import type { Document } from "../../model/document/Document";
import { Drawing } from "../../model/inline/Drawing";
import { Line } from "../../model/line/Line";
import { LinkedNode } from "../../model/list/LinkedList";
import { Word } from "../../model/inline/Word";
import type { Paragraph } from "../../model/block/Paragraph";
import type { LayoutConstraints } from "../LayoutConstraints";
import { LineMetrics } from "../line/LineMetrics";
import { PlacedAnchor } from "../../model/inline/PlacedAnchor";
import { drawingOutline, placeOutline, rectangleOutline } from "../../model/graphic/DrawingOutline";
import { paginateTableRows } from "../page/TablePagination";
import { FlowBox, WrapFlow } from "./WrapFlow";

interface CharPoint {
  x: number;
  y: number;
  height?: number;
}

interface PlacedTable {
  paragraph: Paragraph;
  x: number;
  y: number;
  width: number;
  pageIndex: number;
  lines: Line[];
}

export class AnchorLayout {
  private readonly flow = new WrapFlow();

  finish(document: Document, lines: Line[], constraints: LayoutConstraints): { lines: Line[]; anchors: PlacedAnchor[]; wrapped: boolean } {
    const characterPositions = new Map<Drawing, CharPoint>();
    const referencePages = new Map<Drawing, number>();
    let anchors = this.placeAll(document, constraints, undefined, characterPositions, referencePages);
    let tables = this.placeTables(document, constraints);
    if (!this.affectsText(anchors, tables)) {
      return { lines: this.merge(lines, tables), anchors, wrapped: false };
    }
    let text = lines;
    for (let pass = 0; pass < 3; pass += 1) {
      const flowed = this.flow.reflow(document, anchors, tables.flatMap((table) => this.tableBoxes(table, constraints)), constraints);
      text = flowed.lines;
      this.assignLines(document, text);
      const nextAnchors = this.placeAll(document, constraints, flowed.origins, characterPositions, referencePages);
      const nextTables = this.placeTables(document, constraints);
      const changed = this.moved(anchors, nextAnchors) || this.tablesMoved(tables, nextTables);
      if (!changed || pass === 2) {
        // 画布必须使用这次文字实际避开的同一组障碍。
        anchors = anchors.map((anchor, index) => this.wraps(anchor) ? anchor : nextAnchors[index]);
        break;
      }
      anchors = nextAnchors;
      tables = nextTables;
    }
    return { lines: this.merge(text, tables), anchors, wrapped: true };
  }

  private affectsText(anchors: PlacedAnchor[], tables: PlacedTable[]): boolean {
    return tables.length > 0 || anchors.some((anchor) => this.wraps(anchor));
  }

  private wraps(anchor: PlacedAnchor): boolean {
    return !anchor.drawing.hidden && anchor.wrap !== "none";
  }

  private moved(before: PlacedAnchor[], after: PlacedAnchor[]): boolean {
    if (before.length !== after.length) {
      return true;
    }
    return before.some((anchor, index) => {
      const next = after[index];
      return this.wraps(anchor) && (anchor.pageIndex !== next.pageIndex || Math.abs(anchor.x - next.x) > 0.01 || Math.abs(anchor.y - next.y) > 0.01);
    });
  }

  private tablesMoved(before: PlacedTable[], after: PlacedTable[]): boolean {
    if (before.length !== after.length) {
      return true;
    }
    return before.some((table, index) => {
      const next = after[index];
      return table.pageIndex !== next.pageIndex || Math.abs(table.x - next.x) > 0.01 || Math.abs(table.y - next.y) > 0.01;
    });
  }

  private assignLines(document: Document, lines: Line[]): void {
    document.paragraphs.each((node) => {
      if (!(node.data.isTable && node.data.hasAnchor)) {
        node.data.lines = [];
      }
    });
    for (const line of lines) {
      if (line.paragraph?.isTable && line.paragraph.hasAnchor) {
        continue;
      }
      line.paragraph?.lines.push(line);
    }
  }

  private merge(lines: Line[], tables: PlacedTable[]): Line[] {
    const tableLines = tables.flatMap((table) => table.lines);
    return [...lines, ...tableLines].sort((a, b) => a.top - b.top || (a.type === "table" ? -1 : 1));
  }

  private tableBoxes(table: PlacedTable, constraints: LayoutConstraints): FlowBox[] {
    const anchor = table.paragraph.table?.anchorSet;
    const pageH = constraints.paginate === false ? Infinity : constraints.contentHeight;
    return table.lines.map((line) => ({
      left: table.x - (anchor?.distLeft ?? 0),
      right: table.x + table.width + (anchor?.distRight ?? 0),
      top: Number.isFinite(pageH) ? Math.max(line.pageIndex! * pageH, line.top - (anchor?.distTop ?? 0)) : line.top - (anchor?.distTop ?? 0),
      bottom: Number.isFinite(pageH)
        ? Math.min((line.pageIndex! + 1) * pageH, line.top + line.height + (anchor?.distBottom ?? 0))
        : line.top + line.height + (anchor?.distBottom ?? 0),
      wrap: "square",
      side: "both",
      distLeft: 0,
      distRight: 0,
      distTop: 0,
      distBottom: 0,
    }));
  }

  private tableLines(paragraph: Paragraph, x: number, y: number, height: number, pageH: number, pageIndex: number): Line[] {
    const data = paragraph.table!;
    const word = new Word();
    word.kind = "table";
    word.table = data;
    word.paragraph = paragraph;
    const node = new LinkedNode(word);
    const slices = Number.isFinite(pageH)
      ? paginateTableRows(data, y, pageH, pageIndex).slices
      : [{ from: 0, to: data.rows.length, clipTop: 0, headerRows: 0, height, top: y }];
    return slices.map((slice, index) => {
      const line = new Line();
      line.type = "table";
      line.paragraph = paragraph;
      line.startNode = node;
      line.length = 1;
      line.top = slice.top;
      line.pageIndex = Number.isFinite(pageH) ? Math.max(pageIndex, Math.floor(slice.top / pageH)) : undefined;
      line.height = line.fullHeight = slice.height;
      line.leftBlankWidth = x;
      line.tableRowFrom = slice.from;
      line.tableRowTo = slice.to;
      line.tableHeaderRows = slice.headerRows;
      line.tableClipTop = slice.clipTop;
      line.isFirst = index === 0;
      line.isLast = index === slices.length - 1;
      return line;
    });
  }

  private placeAll(
    document: Document,
    constraints: LayoutConstraints,
    origins: Map<Paragraph, number> | undefined,
    characterPositions: Map<Drawing, CharPoint>,
    referencePages: Map<Drawing, number>,
  ): PlacedAnchor[] {
    return this.collect(document).map(({ drawing, paragraph }) =>
      this.place(drawing, paragraph, constraints, origins, characterPositions, referencePages),
    );
  }

  private placeTables(document: Document, constraints: LayoutConstraints): PlacedTable[] {
    const placed: PlacedTable[] = [];
    document.paragraphs.each((node) => {
      const paragraph = node.data;
      const table = paragraph.table;
      if (!paragraph.isTable || !paragraph.hasAnchor || !table) {
        return;
      }
      const width = table.columnWidths.reduce((sum, column) => sum + column, 0);
      const height = table.rowHeights.reduce((sum, row) => sum + row, 0);
      const host = this.hostLine(paragraph);
      const { pageH, pageStart } = this.pageMetrics(host, constraints);
      const pageIndex = Number.isFinite(pageH) ? Math.max(0, Math.floor(pageStart / pageH)) : 0;
      const positioned = { width, height, anchorSet: table.anchorSet };
      const x = this.resolveX(positioned, paragraph, constraints, null, pageIndex);
      const y = this.resolveY(positioned, host?.top ?? 0, pageStart, pageH, constraints.contentHeight, null, constraints);
      placed.push({ paragraph, x, y, width, pageIndex, lines: this.tableLines(paragraph, x, y, height, pageH, pageIndex) });
    });
    return placed;
  }

  private collect(document: Document): { drawing: Drawing; paragraph: Paragraph }[] {
    const found: { drawing: Drawing; paragraph: Paragraph; order: number }[] = [];
    let order = 0;
    let maxZ = 0;
    document.paragraphs.each((node) => {
      for (const block of node.data.blocks) {
        if (block.drawing?.position === "anchor") {
          const z = block.drawing.anchorSet?.zIndex;
          if (z != null && Number.isFinite(z)) {
            maxZ = Math.max(maxZ, z);
          }
          found.push({ drawing: block.drawing, paragraph: node.data, order });
          order += 1;
        }
      }
    });
    found.sort((a, b) => {
      const behindA = a.drawing.anchorSet?.behind ? 0 : 1;
      const behindB = b.drawing.anchorSet?.behind ? 0 : 1;
      if (behindA !== behindB) {
        return behindA - behindB;
      }
      const zA = a.drawing.anchorSet?.zIndex ?? maxZ + 1 + a.order;
      const zB = b.drawing.anchorSet?.zIndex ?? maxZ + 1 + b.order;
      return zA - zB || a.order - b.order;
    });
    return found.map(({ drawing, paragraph }) => ({ drawing, paragraph }));
  }

  private pageMetrics(
    host: Line | undefined,
    constraints: LayoutConstraints,
    origin?: number,
  ): { pageH: number; pageStart: number } {
    const raw = constraints.contentHeight;
    const pageH = constraints.paginate === false || !Number.isFinite(raw) ? Number.POSITIVE_INFINITY : Math.max(1, raw);
    const ref = origin ?? host?.top;
    const pageStart = ref != null && Number.isFinite(pageH) ? Math.floor(ref / pageH) * pageH : 0;
    return { pageH, pageStart };
  }

  private hostLine(paragraph: Paragraph): Line | undefined {
    if (paragraph.isTable) {
      const previous = paragraph.getPreParagraph();
      const text = previous?.lines.filter((line) => line.type !== "table");
      return text?.at(-1) ?? previous?.lines.at(-1);
    }
    return paragraph.lines[0] ?? paragraph.getPreParagraph()?.lines.at(-1);
  }

  private place(
    drawing: Drawing,
    paragraph: Paragraph,
    constraints: LayoutConstraints,
    origins?: Map<Paragraph, number>,
    characterPositions?: Map<Drawing, CharPoint>,
    referencePages?: Map<Drawing, number>,
  ): PlacedAnchor {
    const placed = new PlacedAnchor(drawing, paragraph);
    const host = this.hostLine(paragraph);
    const origin = origins?.get(paragraph);
    const set = drawing.anchorSet;
    let atChar = characterPositions?.get(drawing) ?? this.locateChar(paragraph, this.charIndex(paragraph, drawing));
    if (this.wraps(placed) && (set?.leftFrom === "character" || set?.topFrom === "line" || set?.topFrom === "character")) {
      // 排除对象自身造成的位移，避免锚点跟着它刚刚推开的文字来回跳。
      atChar ??= { x: 0, y: host?.top ?? 0 };
      characterPositions?.set(drawing, atChar);
    }
    const referenceY = set?.topFrom === "line" || set?.topFrom === "character" ? atChar?.y : origin;
    const { pageH, pageStart } = this.pageMetrics(host, constraints, referenceY);
    const referencePage = Number.isFinite(pageH) ? Math.max(0, Math.floor(pageStart / pageH)) : 0;
    const baseTop = origin ?? host?.top ?? 0;
    placed.paragraphTop = baseTop;
    placed.x = set?.simplePosition
      ? set.simplePosition.x - (constraints.leftMargin ?? 0)
      : this.resolveX(drawing, paragraph, constraints, atChar, referencePage);
    placed.y = set?.simplePosition
      ? pageStart + set.simplePosition.y - (constraints.storyTop ?? constraints.topMargin ?? 0)
      : this.resolveY(drawing, baseTop, pageStart, pageH, constraints.contentHeight, atChar, constraints);
    const paragraphOffset = !set?.simplePosition && (!set?.topFrom || set.topFrom === "paragraph" || set.topFrom === "text") && !set?.topAlign;
    placed.pageIndex = paragraphOffset && placed.y >= pageStart && Number.isFinite(pageH)
      ? Math.max(0, Math.floor(placed.y / pageH))
      : referencePage;
    const paperHeight = constraints.pageHeight;
    if (Number.isFinite(pageH) && paperHeight && paperHeight > 0 &&
      set?.leftFrom === "page" && set.topFrom === "page" && !set.topAlign && !set.leftAlign && !set.simplePosition
    ) {
      // 以环绕前的段落页为基准，避免图片一推开文字就把自己的参考页推走。
      const basePage = referencePages?.get(drawing) ?? referencePage;
      referencePages?.set(drawing, basePage);
      const top = set.top ?? 0;
      const pageOffset = drawing.dropPage == null ? Math.floor(top / paperHeight) : 0;
      placed.referencePage = basePage;
      placed.pageIndex = drawing.dropPage ?? Math.max(0, basePage + pageOffset);
      placed.y = placed.pageIndex * pageH + top - pageOffset * paperHeight -
        (constraints.storyTop ?? constraints.topMargin ?? 0);
    }
    const contour = placed.wrap === "tight" || placed.wrap === "through";
    const outline = placeOutline(drawing, contour ? drawingOutline(drawing) : rectangleOutline(placed.width, placed.height), placed.x, placed.y);
    if (contour && (set?.polygon || drawing.shape || drawing.rotation)) {
      placed.wrapPolygon = outline;
    }
    const effects = contour ? undefined : set?.effectExtent;
    placed.wrapLeft = Math.min(...outline.map((point) => point.x)) - (set?.distLeft ?? 0) - (effects?.left ?? 0);
    placed.wrapRight = Math.max(...outline.map((point) => point.x)) + (set?.distRight ?? 0) + (effects?.right ?? 0);
    placed.wrapTop = Math.min(...outline.map((point) => point.y)) - (set?.distTop ?? 0) - (effects?.top ?? 0);
    placed.wrapBottom = Math.max(...outline.map((point) => point.y)) + (set?.distBottom ?? 0) + (effects?.bottom ?? 0);
    return placed;
  }

  private charIndex(paragraph: Paragraph, drawing: Drawing): number {
    let index = 0;
    for (const block of paragraph.blocks) {
      if (block.drawing === drawing) {
        return index;
      }
      index += block.text.length;
    }
    return 0;
  }

  private locateChar(paragraph: Paragraph, index: number): CharPoint | null {
    let seen = 0;
    let fallback: CharPoint | null = null;
    for (const line of paragraph.lines) {
      if (line.type === "table" || line.type === "page") {
        continue;
      }
      let node = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        if (!node) {
          break;
        }
        const word = node.data;
        if (word.kind === "text" && !word.isEnterChar()) {
          if (seen >= index) {
            return { x: word.left, y: line.top, height: line.height };
          }
          fallback = { x: word.left + word.kernedWidth, y: line.top, height: line.height };
          seen += 1;
        }
        node = node.next;
      }
    }
    return fallback;
  }

  private resolveX(
    drawing: Pick<Drawing, "width" | "anchorSet">,
    paragraph: Paragraph,
    constraints: LayoutConstraints,
    atChar: CharPoint | null,
    pageIndex = 0,
  ): number {
    const set = drawing.anchorSet;
    const leftMargin = constraints.leftMargin ?? 0;
    const pageWidth = constraints.pageWidth ?? constraints.contentWidth + leftMargin * 2;
    const insideLeft = pageIndex % 2 === 0;
    let from = set?.leftFrom;
    let align = set?.leftAlign;
    if (from === "insideMargin" || from === "outsideMargin") {
      from = (from === "insideMargin") === insideLeft ? "leftMargin" : "rightMargin";
    }
    if (align === "inside" || align === "outside") {
      align = (align === "inside") === insideLeft ? "left" : "right";
    }
    let start = 0;
    let span = constraints.contentWidth;
    switch (from) {
      case "page":
        start = -leftMargin;
        span = pageWidth;
        break;
      case "leftMargin":
        start = -leftMargin;
        span = leftMargin;
        break;
      case "rightMargin":
        start = constraints.contentWidth;
        span = Math.max(0, pageWidth - leftMargin - constraints.contentWidth);
        break;
      case "character":
        start = atChar?.x ?? 0;
        span = 0;
        break;
      case "paragraph":
        start = new LineMetrics().leftBlank(paragraph, false, this.hostLine(paragraph)?.startNode?.data ?? null);
        span -= start;
        break;
    }
    return start + alignOffset(align, span - drawing.width, "right", set?.left);
  }

  private resolveY(
    drawing: Pick<Drawing, "height" | "anchorSet">,
    hostTop: number,
    pageStart: number,
    pageH: number,
    contentHeight: number,
    atChar: CharPoint | null,
    constraints: LayoutConstraints,
  ): number {
    const set = drawing.anchorSet;
    const content = Number.isFinite(contentHeight) ? contentHeight : drawing.height;
    const marginTop = constraints.topMargin ?? 0;
    const storyTop = constraints.storyTop ?? marginTop;
    const paperHeight = constraints.pageHeight ?? (Number.isFinite(pageH) ? pageH + marginTop : content);
    let start = hostTop;
    let span = 0;
    switch (set?.topFrom) {
      case "page":
        start = pageStart - storyTop;
        span = paperHeight;
        break;
      case "topMargin":
        start = pageStart - storyTop;
        span = marginTop;
        break;
      case "bottomMargin":
        start = pageStart + marginTop + content - storyTop;
        span = Math.max(0, paperHeight - marginTop - content);
        break;
      case "margin":
      case "insideMargin":
      case "outsideMargin":
        start = pageStart + marginTop - storyTop;
        span = content;
        break;
      case "character":
      case "line":
        start = atChar?.y ?? hostTop;
        span = atChar?.height ?? 0;
        break;
    }
    return start + alignOffset(set?.topAlign, span - drawing.height, "bottom", set?.top);
  }
}

function alignOffset(align: string | undefined, spare: number, end: string, offset: number | undefined): number {
  if (align === "center") {
    return spare / 2;
  }
  if (align === end) {
    return spare;
  }
  if (align === "left" || align === "top") {
    return 0;
  }
  return offset ?? 0;
}
