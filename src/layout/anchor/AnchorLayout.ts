import type { Document } from "../../model/document/Document";
import { Drawing } from "../../model/inline/Drawing";
import { Line } from "../../model/line/Line";
import { LinkedNode } from "../../model/list/LinkedList";
import { Word } from "../../model/inline/Word";
import type { Paragraph } from "../../model/block/Paragraph";
import type { LayoutConstraints } from "../LayoutConstraints";
import { LineMetrics } from "../line/LineMetrics";
import { PlacedAnchor } from "../../model/inline/PlacedAnchor";
import { FlowBox, WrapFlow } from "./WrapFlow";

interface CharPoint {
  x: number;
  y: number;
}

interface PlacedTable {
  paragraph: Paragraph;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class AnchorLayout {
  private readonly flow = new WrapFlow();

  finish(document: Document, lines: Line[], constraints: LayoutConstraints): { lines: Line[]; anchors: PlacedAnchor[] } {
    let anchors = this.placeAll(document, constraints);
    let tables = this.placeTables(document, constraints);
    if (!this.affectsText(anchors, tables)) {
      return { lines: this.merge(lines, tables), anchors };
    }
    let text = lines;
    for (let pass = 0; pass < 3; pass += 1) {
      const flowed = this.flow.reflow(document, anchors, tables.map((table) => this.tableBox(table)), constraints);
      text = flowed.lines;
      this.assignLines(document, text);
      const nextAnchors = this.placeAll(document, constraints, flowed.origins);
      const nextTables = this.placeTables(document, constraints);
      const changed = this.moved(anchors, nextAnchors) || this.tablesMoved(tables, nextTables);
      anchors = nextAnchors;
      tables = nextTables;
      if (!changed) {
        break;
      }
    }
    return { lines: this.merge(text, tables), anchors };
  }

  private affectsText(anchors: PlacedAnchor[], tables: PlacedTable[]): boolean {
    return tables.length > 0 || anchors.some((anchor) => anchor.wrap !== "none");
  }

  private moved(before: PlacedAnchor[], after: PlacedAnchor[]): boolean {
    if (before.length !== after.length) {
      return true;
    }
    return before.some((anchor, index) => {
      const next = after[index];
      return Math.abs(anchor.x - next.x) > 0.5 || Math.abs(anchor.y - next.y) > 0.5;
    });
  }

  private tablesMoved(before: PlacedTable[], after: PlacedTable[]): boolean {
    if (before.length !== after.length) {
      return true;
    }
    return before.some((table, index) => {
      const next = after[index];
      return Math.abs(table.x - next.x) > 0.5 || Math.abs(table.y - next.y) > 0.5;
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
    const tableLines = tables
      .map((table) => this.tableLine(table))
      .filter((line): line is Line => line != null);
    return [...lines, ...tableLines].sort((a, b) => a.top - b.top || (a.type === "table" ? -1 : 1));
  }

  private tableBox(table: PlacedTable): FlowBox {
    return {
      left: table.x,
      right: table.x + table.width,
      top: table.y,
      bottom: table.y + table.height,
      wrap: "square",
      side: "both",
      originX: table.x,
      originY: table.y,
      distLeft: 0,
      distRight: 0,
    };
  }

  private tableLine(table: PlacedTable): Line | null {
    const data = table.paragraph.table;
    if (!data) {
      return null;
    }
    const word = new Word();
    word.kind = "table";
    word.table = data;
    word.paragraph = table.paragraph;
    const line = new Line();
    line.type = "table";
    line.paragraph = table.paragraph;
    line.startNode = new LinkedNode(word);
    line.length = 1;
    line.top = table.y;
    line.height = table.height;
    line.fullHeight = table.height;
    line.leftBlankWidth = table.x;
    line.tableRowFrom = 0;
    line.tableRowTo = data.rows.length;
    line.isFirst = true;
    line.isLast = true;
    return line;
  }

  private placeAll(document: Document, constraints: LayoutConstraints, origins?: Map<Paragraph, number>): PlacedAnchor[] {
    return this.collect(document).map(({ drawing, paragraph }) => this.place(drawing, paragraph, constraints, origins));
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
      const drawing = new Drawing();
      drawing.width = width;
      drawing.height = height;
      drawing.anchorSet = {
        leftFrom: table.anchorSet?.leftFrom,
        left: table.anchorSet?.left,
        topFrom: table.anchorSet?.topFrom,
        top: table.anchorSet?.top,
      };
      const x = this.resolveX(drawing, paragraph, constraints, null);
      const y = this.resolveY(drawing, host?.top ?? 0, pageStart, pageH, constraints.contentHeight, null);
      placed.push({ paragraph, x, y, width, height });
    });
    return placed;
  }

  private collect(document: Document): { drawing: Drawing; paragraph: Paragraph }[] {
    const found: { drawing: Drawing; paragraph: Paragraph }[] = [];
    document.paragraphs.each((node) => {
      for (const block of node.data.blocks) {
        if (block.drawing?.position === "anchor") {
          found.push({ drawing: block.drawing, paragraph: node.data });
        }
      }
    });
    return found;
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
  ): PlacedAnchor {
    const placed = new PlacedAnchor(drawing, paragraph);
    const host = this.hostLine(paragraph);
    const origin = origins?.get(paragraph);
    const { pageH, pageStart } = this.pageMetrics(host, constraints, origin);
    const atChar = this.locateChar(paragraph, this.charIndex(paragraph, drawing));
    placed.x = this.resolveX(drawing, paragraph, constraints, atChar);
    const baseTop = origin ?? host?.top ?? 0;
    placed.y = this.resolveY(drawing, baseTop, pageStart, pageH, constraints.contentHeight, atChar);
    const set = drawing.anchorSet;
    placed.wrapLeft = placed.x - (set?.distLeft ?? 0);
    placed.wrapRight = placed.x + placed.width + (set?.distRight ?? 0);
    placed.wrapTop = placed.y - (set?.distTop ?? 0);
    placed.wrapBottom = placed.y + placed.height + (set?.distBottom ?? 0);
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
            return { x: word.left, y: line.top };
          }
          fallback = { x: word.left + word.kernedWidth, y: line.top };
          seen += 1;
        }
        node = node.next;
      }
    }
    return fallback;
  }

  private resolveX(drawing: Drawing, paragraph: Paragraph, constraints: LayoutConstraints, atChar: CharPoint | null): number {
    const set = drawing.anchorSet;
    const width = drawing.width;
    const contentWidth = constraints.contentWidth;
    const align = set?.leftAlign;
    if (align === "center") {
      return (contentWidth - width) / 2;
    }
    if (align === "right") {
      return contentWidth - width;
    }
    if (align === "left") {
      return 0;
    }
    const offset = set?.left ?? 0;
    const from = set?.leftFrom;
    if (from === "character") {
      return (atChar?.x ?? 0) + offset;
    }
    if (from === "page" || from === "leftMargin") {
      return offset - (constraints.leftMargin ?? 0);
    }
    if (from === "rightMargin") {
      return contentWidth - width - offset;
    }
    if (from === "paragraph") {
      const word = this.hostLine(paragraph)?.startNode?.data ?? null;
      return new LineMetrics().leftBlank(paragraph, false, word) + offset;
    }
    if (from === "insideMargin" || from === "outsideMargin") {
      const pageH = Math.max(1, constraints.contentHeight);
      const host = this.hostLine(paragraph);
      const pageIndex = host ? Math.floor(host.top / pageH) : 0;
      const onLeft = from === "insideMargin" ? pageIndex % 2 === 0 : pageIndex % 2 === 1;
      return onLeft ? offset : contentWidth - width - offset;
    }
    return offset;
  }

  private resolveY(
    drawing: Drawing,
    hostTop: number,
    pageStart: number,
    pageH: number,
    contentHeight: number,
    atChar: CharPoint | null,
  ): number {
    const set = drawing.anchorSet;
    const height = drawing.height;
    const align = set?.topAlign;
    if (align === "center") {
      return pageStart + (pageH - height) / 2;
    }
    if (align === "bottom") {
      return pageStart + contentHeight - height;
    }
    if (align === "top") {
      return pageStart;
    }
    const offset = set?.top ?? 0;
    const from = set?.topFrom;
    if (from === "character" || from === "line") {
      return (atChar?.y ?? hostTop) + offset;
    }
    if (from === "page" || from === "margin" || from === "topMargin") {
      return pageStart + offset;
    }
    if (from === "bottomMargin") {
      return pageStart + contentHeight - height - offset;
    }
    return hostTop + offset;
  }
}
