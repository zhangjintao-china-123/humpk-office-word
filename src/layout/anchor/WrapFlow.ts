import type { Paragraph } from "../../model/block/Paragraph";
import type { Document } from "../../model/document/Document";
import type { WrapPoint, WrapSide, WrapType } from "../../model/inline/Drawing";
import { Line } from "../../model/line/Line";
import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";
import { flagOff, flagOn } from "../../model/style/ParagraphAttrs";
import type { PlacedAnchor } from "../../model/inline/PlacedAnchor";
import { DEFAULT_FONT_SIZE } from "../LayoutConstants";
import { twipToPx } from "../../shared/units";
import { PunctCompressor } from "../line/PunctCompressor";
import type { LayoutConstraints } from "../LayoutConstraints";
import { fontSizeOf } from "../measure/FontSpec";
import { MixSpacing } from "../measure/MixSpacing";
import { LineMetrics } from "../line/LineMetrics";
import { LinePositioner } from "../line/LinePositioner";
import { LayoutToken, gluedWidth } from "../token/LayoutToken";
import { TokenBuilder } from "../token/TokenBuilder";
import { pageBreakAdvance } from "../page/Paginator";
import { paginateTableRows } from "../page/TablePagination";
import { WrapScanline } from "./WrapScanline";

interface Span {
  left: number;
  right: number;
}

interface BandAttempt {
  splitTokens: Map<number, LayoutToken>;
  wordWidths: Map<Word, { width: number; spacing: number }>;
  beforeHeight?: number;
}

/** 绕排时的一块障碍。坐标都在版心内。 */
export interface FlowBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  wrap: WrapType;
  side: WrapSide;
  polygon?: WrapPoint[];
  distLeft: number;
  distRight: number;
  distTop: number;
  distBottom: number;
}

const MIN_SEGMENT = 8;

/** 按锚定图占位重新断行，文字排进左右空隙，放不下的折到下一行。 */
export class WrapFlow {
  private readonly scanline = new WrapScanline();
  private readonly metrics = new LineMetrics();
  private readonly positioner = new LinePositioner();
  private readonly mix = new MixSpacing();
  private readonly tokens = new TokenBuilder();
  private readonly compressor = new PunctCompressor();

  reflow(
    document: Document,
    anchors: PlacedAnchor[],
    extras: FlowBox[],
    constraints: LayoutConstraints,
  ): { lines: Line[]; origins: Map<Paragraph, number> } {
    this.metrics.gridPitchPx = constraints.linePitchPx;
    this.positioner.setDefaultTab(twipToPx(document.defaultTabStopTwip ?? 720));
    this.resetWidths(document);
    this.mix.apply(document);
    const pageH = constraints.paginate === false ? Number.POSITIVE_INFINITY : Math.max(1, constraints.contentHeight);
    const boxes = [
      ...anchors.filter((anchor) => !anchor.drawing.hidden && anchor.wrap !== "none").map((anchor) => this.boxOf(anchor, pageH)),
      ...extras,
    ].filter((box) => box.bottom > box.top);
    const source = this.tokens.build(document.words.head);
    const origins = new Map<Paragraph, number>();
    const lines = this.flow(source, boxes, constraints.contentWidth, pageH, origins);
    return { lines, origins };
  }

  private boxOf(anchor: PlacedAnchor, pageH: number): FlowBox {
    const set = anchor.drawing.anchorSet;
    const pageStart = Number.isFinite(pageH) ? anchor.pageOn(pageH) * pageH : Number.NEGATIVE_INFINITY;
    const pageEnd = Number.isFinite(pageH) ? pageStart + pageH : Number.POSITIVE_INFINITY;
    return {
      left: anchor.wrapLeft,
      right: anchor.wrapRight,
      top: Math.max(anchor.wrapTop, pageStart),
      bottom: Math.min(anchor.wrapBottom, pageEnd),
      wrap: anchor.wrap,
      side: set?.wrapSide ?? "both",
      polygon: anchor.wrapPolygon,
      distLeft: set?.distLeft ?? 0,
      distRight: set?.distRight ?? 0,
      distTop: set?.distTop ?? 0,
      distBottom: set?.distBottom ?? 0,
    };
  }

  private resetWidths(document: Document): void {
    document.words.each((node) => {
      const word = node.data;
      if (word.kind === "text" && !word.isEnterChar()) {
        word.spacingAfter = 0;
        word.kernedWidth = word.width;
      }
    });
  }

  private flow(
    tokens: LayoutToken[],
    boxes: FlowBox[],
    contentWidth: number,
    pageH: number,
    origins: Map<Paragraph, number>,
  ): Line[] {
    const lines: Line[] = [];
    let index = 0;
    let y = 0;
    let passedCover = false;
    while (index < tokens.length) {
      const token = tokens[index];
      const paragraph = token.start.data.paragraph;
      if (!passedCover && Number.isFinite(pageH) && !paragraph?.coverTemplate && lines.at(-1)?.paragraph?.coverTemplate) {
        y = this.skipTo(y, pageH);
        passedCover = true;
      }
      const isText = token.kind !== "page" && token.kind !== "table";
      const opens = isText && this.opensParagraph(lines, token);
      if (opens) {
        y = this.paragraphStartY(tokens, index, lines, y, pageH, contentWidth, boxes);
      }
      const prev = lines.at(-1);
      const previousBand = bandOwner(lines);
      let beforeHeight: number | undefined;
      if (opens && paragraph && prev?.isLast && prev.paragraph && prev.paragraph !== paragraph &&
        !prev.type && !atPageTop(y, pageH) && Math.abs(prev.top + (previousBand?.height ?? prev.height) - y) < 0.01) {
        beforeHeight = this.metrics.collapsedGap(prev.paragraph, paragraph, prev.afterHeight, this.metrics.beforeHeight(paragraph, true));
        y -= prev.afterHeight;
        this.shrinkAfter(lines, prev);
      }
      if (paragraph && !origins.has(paragraph)) {
        origins.set(paragraph, y);
      }
      if (token.kind === "page") {
        y = this.placePage(token, y, pageH, lines);
        index += 1;
        continue;
      }
      if (token.kind === "table") {
        y = this.placeTable(token, y, pageH, lines);
        index += 1;
        continue;
      }

      const isFirst = this.opensParagraph(lines, token);
      const estimate = () => this.estimate(token, isFirst, beforeHeight);
      let probe = estimate();
      if (isFirst && atPageTop(y, pageH)) {
        probe = Math.max(1, probe - (beforeHeight ?? this.metrics.beforeHeight(paragraph, true)));
      }
      let lineY = y;
      const bounds = this.bounds(token, isFirst, contentWidth);
      let band: Line[] = [];
      let cursor = index;
      let bandH = 0;
      let contourSteps = 0;
      while (true) {
        lineY = this.fitY(lineY, probe, pageH, boxes);
        const segments = this.segmentsAt(lineY, probe, bounds, contentWidth, boxes);
        const attempt: BandAttempt = {
          splitTokens: new Map(),
          wordWidths: new Map(),
          beforeHeight: isFirst ? beforeHeight ?? this.metrics.beforeHeight(paragraph, true) : undefined,
        };
        band = [];
        cursor = index;
        for (const segment of segments) {
          if (cursor >= tokens.length || band.at(-1)?.isLast) {
            break;
          }
          const filled = this.fillSegment(tokens, cursor, segment, contentWidth, band.length === 0 && isFirst, bounds, attempt);
          if (filled) {
            band.push(filled.line);
            cursor = filled.next;
          }
        }
        if (cursor === index) {
          // 轮廓没有可排空间时直接越过。推进版面坐标，始终保留当前文字 token。
          const skipContour = contourSteps >= 128;
          lineY = this.nextY(lineY, probe, boxes, skipContour);
          contourSteps = skipContour ? 0 : contourSteps + 1;
          probe = estimate();
          continue;
        }
        if (isFirst && atPageTop(lineY, pageH)) {
          for (const line of band) {
            this.stripBefore(line);
          }
        }
        bandH = Math.max(...band.map((line) => line.height));
        if (bandH <= probe + 0.01 || (
          this.fitY(lineY, bandH, pageH, boxes) === lineY &&
          sameSegments(segments, this.segmentsAt(lineY, bandH, bounds, contentWidth, boxes))
        )) {
          break;
        }
        for (const [at, original] of attempt.splitTokens) {
          tokens[at] = original;
        }
        for (const [word, prior] of attempt.wordWidths) {
          word.kernedWidth = prior.width;
          word.spacingAfter = prior.spacing;
        }
        probe = bandH;
      }
      band[0].height = bandH;
      band[0].fullHeight = bandH;
      for (let i = 0; i < band.length; i += 1) {
        band[i].top = lineY;
        band[i].sharesBand = i > 0;
        lines.push(band[i]);
      }
      y = this.pullOrphan(lines, band, lineY, bandH, pageH, boxes);
      y = this.afterSection(band[band.length - 1], y, pageH);
      index = cursor;
    }
    return lines;
  }

  private opensParagraph(lines: Line[], token: LayoutToken): boolean {
    const prev = lines.at(-1);
    const paragraph = token.start.data.paragraph;
    return !prev || prev.isLast || prev.paragraph !== paragraph;
  }

  private estimate(token: LayoutToken, isFirst: boolean, beforeHeight?: number): number {
    const paragraph = token.start.data.paragraph;
    const size = Math.max(fontSizeOf(token.start.data.getStyle()), token.start.data.height, DEFAULT_FONT_SIZE);
    const content = this.metrics.lineHeight(paragraph, size);
    const before = isFirst ? beforeHeight ?? this.metrics.beforeHeight(paragraph, true) : 0;
    return Math.max(content + before, size);
  }

  private bounds(token: LayoutToken, isFirst: boolean, contentWidth: number): Span {
    const paragraph = token.start.data.paragraph;
    const word = token.start.data;
    let left = this.metrics.leftBlank(paragraph, isFirst, word);
    const right = contentWidth - this.metrics.rightBlank(paragraph, word);
    if (isFirst) {
      const label = paragraph?.attrs.titleSerial?.label ?? "";
      if (label) {
        left = this.metrics.textStartWithLabel(paragraph, word, left, label);
      }
    }
    return { left, right: Math.max(left + MIN_SEGMENT, right) };
  }

  private skipPage(y: number, height: number, pageH: number): number {
    if (!Number.isFinite(pageH) || height > pageH) {
      return y;
    }
    const rem = pageH - (y % pageH);
    if (rem < height && rem < pageH) {
      return y + rem;
    }
    return y;
  }

  private belowNowrap(y: number, height: number, boxes: FlowBox[]): number {
    let floor = y;
    for (const box of boxes) {
      if (box.wrap !== "nowrap") {
        continue;
      }
      if (y < box.bottom && y + height > box.top) {
        floor = Math.max(floor, box.bottom);
      }
    }
    return floor;
  }

  private fitY(y: number, height: number, pageH: number, boxes: FlowBox[]): number {
    while (true) {
      const next = this.belowNowrap(this.skipPage(y, height, pageH), height, boxes);
      if (next === y) {
        return y;
      }
      y = next;
    }
  }

  private segmentsAt(y: number, height: number, bounds: Span, contentWidth: number, boxes: FlowBox[]): Span[] {
    const blocked = this.blockedAt(y, height, bounds, contentWidth, boxes);
    return freeSegments(blocked, bounds.left, bounds.right).filter((span) => span.right - span.left >= MIN_SEGMENT - 0.01);
  }

  private nextY(y: number, height: number, boxes: FlowBox[], skipContour: boolean): number {
    let next = Number.POSITIVE_INFINITY;
    for (const box of boxes) {
      if (box.wrap === "none" || box.wrap === "nowrap") {
        continue;
      }
      if (y >= box.bottom || y + height <= box.top) {
        continue;
      }
      const step = box.polygon && !skipContour ? Math.min(box.bottom, y + Math.max(4, height * 0.25)) : box.bottom;
      next = Math.min(next, step);
    }
    return Number.isFinite(next) ? next : y + Math.max(4, height * 0.25);
  }

  private blockedAt(y: number, height: number, bounds: Span, contentWidth: number, boxes: FlowBox[]): Span[] {
    const spans: Span[] = [];
    for (const box of boxes) {
      if (box.wrap === "none" || box.wrap === "nowrap") {
        continue;
      }
      if (y + height <= box.top || y >= box.bottom) {
        continue;
      }
      const pieces = this.pieces(box, y, y + height);
      if (box.side === "both") {
        spans.push(...pieces);
      } else if (pieces.length) {
        const whole = { left: pieces[0].left, right: pieces.at(-1)!.right };
        spans.push(this.applySide(whole, box.side, bounds.left, Math.min(bounds.right, contentWidth)));
      }
    }
    return spans;
  }

  private pieces(box: FlowBox, top: number, bottom: number): Span[] {
    const polygon = box.polygon;
    if (!polygon || polygon.length < 3) {
      return [{ left: box.left, right: box.right }];
    }
    const intervals = this.scanline.intervalsInBand(polygon, top - box.distBottom, bottom + box.distTop);
    if (!intervals.length) {
      return [];
    }
    const blocked = box.wrap === "tight" ? [{ left: intervals[0].left, right: intervals.at(-1)!.right }] : intervals;
    return blocked.map((span) => ({ left: span.left - box.distLeft, right: span.right + box.distRight }));
  }

  /** left：字只留在图左侧；right：只留在右侧；largest：留在更宽的一侧。 */
  private applySide(piece: Span, side: WrapSide, areaLeft: number, areaRight: number): Span {
    if (side === "left") {
      return { left: piece.left, right: areaRight };
    }
    if (side === "right") {
      return { left: areaLeft, right: piece.right };
    }
    if (side === "both") {
      return piece;
    }
    const leftRoom = piece.left - areaLeft;
    const rightRoom = areaRight - piece.right;
    return leftRoom >= rightRoom ? { left: piece.left, right: areaRight } : { left: areaLeft, right: piece.right };
  }

  private fillSegment(
    tokens: LayoutToken[],
    start: number,
    segment: Span,
    contentWidth: number,
    isFirst: boolean,
    bounds: Span,
    attempt: BandAttempt,
  ): { line: Line; next: number } | null {
    const line = new Line();
    const { splitTokens, wordWidths } = attempt;
    const roomOf = () => segment.right - segment.left - line.width;
    let cursor = start;
    let ended = false;
    const paragraph = tokens[start]?.start.data.paragraph ?? null;
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token.start.data.paragraph !== paragraph) {
        break;
      }
      if (token.kind === "table" || token.kind === "page") {
        break;
      }
      if (token.kind === "break") {
        this.append(line, token, wordWidths);
        cursor += 1;
        ended = true;
        break;
      }
      const need = this.lookahead(tokens, cursor);
      if (line.length > 0 && need > roomOf() + 0.01) {
        const kinsoku = !flagOff(line.paragraph?.attrs.kinsoku);
        const short = need - roomOf();
        if (kinsoku && short > 0 && this.compressor.tryCompress(line, short)) {
          this.syncWidth(line);
          if (need <= roomOf() + 0.01) {
            this.append(line, token, wordWidths);
            cursor += 1;
            continue;
          }
        }
        if (token.canOverflow && segment.right >= bounds.right - 0.01) {
          this.append(line, token, wordWidths);
          line.overflowPun = true;
          cursor += 1;
          continue;
        }
        break;
      }
      if (line.length === 0 && token.width > roomOf() && token.length > 1) {
        const fit = this.fitLength(token, roomOf());
        const widest = segment.right - segment.left >= bounds.right - bounds.left - 0.5;
        const take = fit > 0 ? fit : widest ? 1 : 0;
        if (take <= 0) {
          return null;
        }
        this.append(line, this.slice(token, take), wordWidths);
        const rest = this.rest(token, take);
        if (rest) {
          if (!splitTokens.has(cursor)) {
            splitTokens.set(cursor, token);
          }
          tokens[cursor] = rest;
        } else {
          cursor += 1;
        }
        break;
      }
      if (line.length === 0 && token.width > roomOf()) {
        const widest = segment.right - segment.left >= bounds.right - bounds.left - 0.5;
        if (!widest) {
          return null;
        }
      }
      this.append(line, token, wordWidths);
      cursor += 1;
    }
    if (line.length === 0) {
      return null;
    }
    line.isLast = ended;
    this.finish(line, segment, contentWidth, isFirst, attempt.beforeHeight);
    return { line, next: cursor };
  }

  private finish(line: Line, segment: Span, contentWidth: number, isFirst: boolean, beforeHeight?: number): void {
    line.isFirst = isFirst;
    line.leftBlankWidth = segment.left;
    line.rightBlankWidth = Math.max(0, contentWidth - segment.right);
    if (isFirst) {
      const label = line.paragraph?.attrs.titleSerial?.label ?? "";
      if (label) {
        line.outlineLabel = label;
      }
    }
    this.applyHeights(line, beforeHeight);
    this.positioner.place(line, contentWidth);
  }

  private applyHeights(line: Line, beforeHeight?: number): void {
    let maxFont = DEFAULT_FONT_SIZE;
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      if (node.data.kind === "drawing" && node.data.drawing) {
        maxFont = Math.max(maxFont, node.data.drawing.height);
      } else {
        maxFont = Math.max(maxFont, fontSizeOf(node.data.getStyle()), node.data.height);
      }
      node = node.next;
    }
    line.maxCharHeight = maxFont;
    line.beforeHeight = beforeHeight ?? this.metrics.beforeHeight(line.paragraph, line.isFirst);
    line.afterHeight = this.metrics.afterHeight(line.paragraph, line.isLast);
    const content = this.metrics.lineHeight(line.paragraph, maxFont);
    const rule = line.paragraph?.attrs.lineRule;
    const box = rule === "exact" ? content : Math.max(content, maxFont);
    line.contentOffsetY = this.metrics.contentOffset(box, maxFont, line.paragraph?.attrs.textAlignment);
    line.height = box + line.beforeHeight + line.afterHeight;
    line.fullHeight = line.height;
  }

  private placePage(token: LayoutToken, y: number, pageH: number, lines: Line[]): number {
    const line = this.marker(token, "page");
    if (!Number.isFinite(pageH)) {
      line.top = y;
      lines.push(line);
      return y;
    }
    line.top = y;
    line.height = pageBreakAdvance(y, pageH, lines.at(-1)?.type === "page");
    line.fullHeight = line.height;
    lines.push(line);
    return y + line.height;
  }

  private placeTable(token: LayoutToken, y: number, pageH: number, lines: Line[]): number {
    const table = token.start.data.table;
    const heights = table?.rowHeights ?? [];
    if (!table || heights.length === 0 || !Number.isFinite(pageH)) {
      const line = this.marker(token, "table");
      const height = heights.reduce((sum, row) => sum + row, 0);
      line.top = y;
      line.height = height;
      line.fullHeight = height;
      line.tableRowFrom = 0;
      line.tableRowTo = table?.rows.length ?? 0;
      lines.push(line);
      return y + height;
    }
    const laid = paginateTableRows(table, y, pageH);
    laid.slices.forEach((slice, index) => {
      const line = this.marker(token, "table");
      line.top = slice.top;
      line.height = slice.height;
      line.fullHeight = slice.height;
      line.tableRowFrom = slice.from;
      line.tableRowTo = slice.to;
      line.tableHeaderRows = slice.headerRows;
      line.tableClipTop = slice.clipTop;
      line.isFirst = slice.from === 0 && slice.clipTop <= 0;
      line.isLast = index === laid.slices.length - 1;
      lines.push(line);
    });
    const last = laid.slices.length ? lines.at(-1) : undefined;
    return last ? this.afterSection(last, laid.y, pageH) : laid.y;
  }

  private marker(token: LayoutToken, type: "page" | "table"): Line {
    const line = new Line();
    line.type = type;
    line.startNode = token.start;
    line.length = token.length;
    line.paragraph = token.start.data.paragraph;
    line.isFirst = true;
    line.isLast = true;
    return line;
  }

  private afterSection(line: Line, y: number, pageH: number): number {
    const kind = line.paragraph?.sectionBreak;
    if (!line.isLast || !kind || kind === "continuous" || line.type === "page" || !Number.isFinite(pageH)) {
      return y;
    }
    const skip = () => {
      const rest = pageH - (y % pageH);
      if (rest < pageH) {
        y += rest;
      }
    };
    skip();
    if (kind === "evenPage" || kind === "oddPage") {
      const next = Math.floor(y / pageH) + 1;
      const even = next % 2 === 0;
      if (kind === "evenPage" ? !even : even) {
        skip();
      }
    }
    return y;
  }

  private paragraphStartY(
    tokens: LayoutToken[],
    index: number,
    lines: Line[],
    y: number,
    pageH: number,
    contentWidth: number,
    boxes: FlowBox[],
  ): number {
    if (!Number.isFinite(pageH)) {
      return y;
    }
    const token = tokens[index];
    const paragraph = token.start.data.paragraph;
    const attrs = paragraph?.attrs;
    if (flagOn(attrs?.pageBreakBefore) && y > 0 && !atPageTop(y, pageH)) {
      y = this.skipTo(y, pageH);
    }
    if (flagOn(attrs?.keepLines)) {
      const span = this.paragraphEstimate(tokens, index, contentWidth);
      const atTop = atPageTop(y, pageH);
      const before = this.metrics.beforeHeight(paragraph, true);
      const need = atTop ? Math.max(1, span - before) : span;
      if (need <= pageH && pageH - (y % pageH) < need && !atTop) {
        y = this.skipTo(y, pageH);
      }
    }
    y = this.holdWrapPrevious(lines, y, pageH, this.estimate(token, true), boxes);
    if (!flagOff(attrs?.widowControl) && this.likelyMultiLine(tokens, index, contentWidth)) {
      const probe = this.estimate(token, true);
      const rem = pageH - (y % pageH);
      if (rem >= probe && rem < probe * 2 && rem < pageH) {
        y = this.skipTo(y, pageH);
      }
    }
    return y;
  }

  private skipTo(y: number, pageH: number): number {
    const rem = pageH - (y % pageH);
    return rem < pageH ? y + rem : y;
  }

  private paragraphEstimate(tokens: LayoutToken[], index: number, contentWidth: number): number {
    const paragraph = tokens[index]?.start.data.paragraph;
    const first = this.estimate(tokens[index], true);
    const rest = this.estimate(tokens[index], false);
    let width = 0;
    let count = 0;
    let height = 0;
    const push = () => {
      count += 1;
      height += count === 1 ? first : rest;
      width = 0;
    };
    for (let i = index; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.start.data.paragraph !== paragraph) {
        break;
      }
      if (token.kind === "break" || token.kind === "page" || token.kind === "table") {
        if (width > 0) {
          push();
        }
        break;
      }
      if (width > 0 && width + token.width > contentWidth) {
        push();
      }
      width += token.width;
    }
    if (width > 0) {
      push();
    }
    return height;
  }

  private likelyMultiLine(tokens: LayoutToken[], index: number, contentWidth: number): boolean {
    const paragraph = tokens[index]?.start.data.paragraph;
    let width = 0;
    for (let i = index; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.start.data.paragraph !== paragraph || token.kind === "break") {
        return false;
      }
      width += token.width;
      if (width > contentWidth) {
        return true;
      }
    }
    return false;
  }

  private holdWrapPrevious(lines: Line[], y: number, pageH: number, probe: number, boxes: FlowBox[]): number {
    const prev = lines.at(-1);
    if (!prev?.isLast || !flagOn(prev.paragraph?.attrs.keepNext) || !Number.isFinite(pageH)) {
      return y;
    }
    const startTop = lines.find((line) => line.paragraph === prev.paragraph && line.isFirst)?.top;
    if (startTop == null || atPageTop(startTop, pageH)) {
      return y;
    }
    if (Math.floor(startTop / pageH) !== Math.floor(y / pageH)) {
      return y;
    }
    if (pageH - (y % pageH) >= probe) {
      return y;
    }
    const nextTop = (Math.floor(startTop / pageH) + 1) * pageH;
    const shift = nextTop - startTop;
    const movedLines = lines.filter((line) => line.paragraph === prev.paragraph && line.top >= startTop - 0.5);
    if (movedLines.some((line) => !this.canMoveLine(line, line.top + shift, pageH, boxes))) {
      return y;
    }
    for (const line of movedLines) {
      line.top += shift;
    }
    const moved = lines.find((line) => line.paragraph === prev.paragraph && line.isFirst);
    let dropped = 0;
    if (moved && atPageTop(moved.top, pageH)) {
      dropped = moved.beforeHeight;
      this.stripBefore(moved);
      if (dropped > 0) {
        for (const line of lines) {
          if (line.paragraph === prev.paragraph && line.top > moved.top + 0.5) {
            line.top -= dropped;
          }
        }
      }
    }
    return y + shift - dropped;
  }

  private stripBefore(line: Line): void {
    if (line.beforeHeight <= 0) {
      return;
    }
    line.height -= line.beforeHeight;
    line.fullHeight = line.height;
    line.beforeHeight = 0;
  }

  private pullOrphan(lines: Line[], band: Line[], lineY: number, bandH: number, pageH: number, boxes: FlowBox[]): number {
    const line = band[0];
    const placed = lineY + bandH;
    if (!line?.isLast || line.isFirst || !Number.isFinite(pageH) || flagOff(line.paragraph?.attrs.widowControl)) {
      return placed;
    }
    const prev = lines.filter((item) => item.paragraph === line.paragraph && !band.includes(item) && !item.sharesBand).at(-1);
    if (!prev || Math.floor(prev.top / pageH) === Math.floor(line.top / pageH)) {
      return placed;
    }
    const prevTop = prev.top;
    const prevBand = lines.filter((item) => item.paragraph === line.paragraph && Math.abs(item.top - prevTop) < 0.5);
    const newTop = line.top + prev.height;
    if (prevBand.some((item) => !this.canMoveLine(item, line.top, pageH, boxes)) ||
      band.some((item) => !this.canMoveLine(item, newTop, pageH, boxes))) {
      return placed;
    }
    for (const item of prevBand) {
      item.top = line.top;
    }
    for (const item of band) {
      item.top = newTop;
    }
    return newTop + bandH;
  }

  private canMoveLine(line: Line, y: number, pageH: number, boxes: FlowBox[]): boolean {
    if (this.fitY(y, line.height, pageH, boxes) !== y) {
      return false;
    }
    const bounds = { left: 0, right: line.contentWidth };
    return !this.blockedAt(y, line.height, bounds, line.contentWidth, boxes).some((span) =>
      span.left < line.contentWidth - line.rightBlankWidth - 0.01 && span.right > line.leftBlankWidth + 0.01,
    );
  }

  private syncWidth(line: Line): void {
    let width = 0;
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      width += node.data.kernedWidth;
      node = node.next;
    }
    line.width = width;
  }

  /** 段后间距记在带断行的片段上，行高记在这一基线的主片段上。 */
  private shrinkAfter(lines: Line[], last: Line): void {
    const after = last.afterHeight;
    last.afterHeight = 0;
    last.height -= after;
    last.fullHeight = last.height;
    const owner = bandOwner(lines);
    if (owner && owner !== last) {
      owner.height -= after;
      owner.fullHeight = owner.height;
    }
  }

  private lookahead(tokens: LayoutToken[], index: number): number {
    return gluedWidth(tokens, index);
  }

  private fitLength(token: LayoutToken, room: number): number {
    let used = 0;
    let count = 0;
    let node: LinkedNode<Word> | null = token.start;
    for (let i = 0; i < token.length && node; i += 1) {
      const width = node.data.kernedWidth;
      if (count > 0 && used + width > room) {
        break;
      }
      used += width;
      count += 1;
      node = node.next;
    }
    return count;
  }

  private slice(token: LayoutToken, length: number): LayoutToken {
    const part = new LayoutToken(token.start);
    part.kind = token.kind;
    part.length = length;
    part.width = this.widthOf(token.start, length);
    return part;
  }

  private rest(token: LayoutToken, skip: number): LayoutToken | null {
    if (skip >= token.length) {
      return null;
    }
    let node: LinkedNode<Word> | null = token.start;
    for (let i = 0; i < skip; i += 1) {
      node = node?.next ?? null;
    }
    if (!node) {
      return null;
    }
    const part = new LayoutToken(node);
    part.kind = token.kind;
    part.length = token.length - skip;
    part.width = this.widthOf(node, part.length);
    return part;
  }

  private widthOf(start: LinkedNode<Word>, length: number): number {
    let width = 0;
    let node: LinkedNode<Word> | null = start;
    for (let i = 0; i < length && node; i += 1) {
      width += node.data.kernedWidth;
      node = node.next;
    }
    return width;
  }

  private append(line: Line, token: LayoutToken, widths: Map<Word, { width: number; spacing: number }>): void {
    if (!line.startNode) {
      line.startNode = token.start;
      line.paragraph = token.start.data.paragraph;
    }
    line.length += token.length;
    line.width += token.width;
    let node: LinkedNode<Word> | null = token.start;
    for (let i = 0; i < token.length && node; i += 1, node = node.next) {
      const word = node.data;
      if (!widths.has(word)) {
        widths.set(word, { width: word.kernedWidth, spacing: word.spacingAfter });
      }
    }
  }
}

function atPageTop(y: number, pageH: number): boolean {
  if (!Number.isFinite(pageH) || pageH <= 0) {
    return false;
  }
  const rem = pageH - (y % pageH);
  return rem >= pageH - 0.5;
}

function bandOwner(lines: Line[]): Line | undefined {
  let index = lines.length - 1;
  while (lines[index]?.sharesBand) {
    index -= 1;
  }
  return lines[index];
}

function sameSegments(a: Span[], b: Span[]): boolean {
  return a.length === b.length && a.every((span, index) =>
    Math.abs(span.left - b[index].left) < 0.01 && Math.abs(span.right - b[index].right) < 0.01,
  );
}

function freeSegments(blocks: Span[], left: number, right: number): Span[] {
  const cuts = blocks
    .map((block) => ({ left: Math.max(left, block.left), right: Math.min(right, block.right) }))
    .filter((block) => block.right - block.left > 0.5)
    .sort((a, b) => a.left - b.left || a.right - b.right);
  const gaps: Span[] = [];
  let cursor = left;
  for (const cut of cuts) {
    if (cut.left > cursor + 0.5) {
      gaps.push({ left: cursor, right: cut.left });
    }
    cursor = Math.max(cursor, cut.right);
  }
  if (right > cursor + 0.5) {
    gaps.push({ left: cursor, right });
  }
  return gaps;
}
