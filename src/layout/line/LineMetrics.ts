import type { Paragraph } from "../../model/block/Paragraph";
import type { Line } from "../../model/line/Line";
import type { Word } from "../../model/inline/Word";
import { parseNumber, twipToPx } from "../../shared/units";
import { DEFAULT_FONT_SIZE, INDENT_CHAR_WIDTH, LINE_HEIGHT_RATIO } from "../LayoutConstants";
import { snappedLineMultiple } from "./FontGrid";

function flagOff(value: string | undefined): boolean {
  return value === "0" || value === "off" || value === "false";
}

export class LineMetrics {
  gridPitchPx?: number;

  leftBlank(paragraph: Paragraph | null, isFirst: boolean, firstWord: Word | null): number {
    if (!paragraph) {
      return 0;
    }
    const attrs = paragraph.attrs;
    const leftChars = ((attrs.leftChars ?? 0) / 100) * INDENT_CHAR_WIDTH;
    if (!isFirst) {
      return leftChars;
    }
    if (attrs.firstLineTwip != null && attrs.firstLineTwip !== 0) {
      return leftChars + twipToPx(attrs.firstLineTwip);
    }
    if (attrs.firstLineChars != null && attrs.firstLineChars !== 0) {
      const unit = firstWord && firstWord.kernedWidth > 0 ? firstWord.kernedWidth : INDENT_CHAR_WIDTH;
      return leftChars + (attrs.firstLineChars / 100) * unit;
    }
    return leftChars;
  }

  rightBlank(paragraph: Paragraph | null): number {
    if (!paragraph) {
      return 0;
    }
    return ((paragraph.attrs.rightChars ?? 0) / 100) * INDENT_CHAR_WIDTH;
  }

  snapsToGrid(paragraph: Paragraph | null): boolean {
    return !flagOff(paragraph?.attrs.snapToGrid) && this.gridPitchPx != null && this.gridPitchPx > 0;
  }

  lineHeight(paragraph: Paragraph | null, maxFontSize: number): number {
    const size = Math.max(maxFontSize, DEFAULT_FONT_SIZE * 0.5);
    const attrs = paragraph?.attrs;
    const line = parseNumber(attrs?.line);
    const rule = attrs?.lineRule;
    const multiple = line != null && line > 0 ? line / 240 : 1;
    const fromTwip = line != null && line > 0 ? twipToPx(line) : 0;
    const snap = this.snapsToGrid(paragraph);
    const rows = snap ? snappedLineMultiple(multiple, size, this.gridPitchPx!) : multiple;
    const auto = snap ? this.gridPitchPx! * rows : size * LINE_HEIGHT_RATIO * multiple;

    if (rule === "exact") {
      return fromTwip > 0 ? fromTwip : auto;
    }
    if (rule === "atLeast" && fromTwip > 0) {
      return Math.max(fromTwip, auto);
    }
    return auto;
  }

  /** exact：太高居中，太矮贴底（从上裁）。 */
  exactOffset(boxHeight: number, glyphHeight: number): number {
    if (boxHeight <= 0) {
      return 0;
    }
    if (glyphHeight <= boxHeight) {
      return (boxHeight - glyphHeight) / 2;
    }
    return boxHeight - glyphHeight;
  }

  beforeHeight(paragraph: Paragraph | null, isFirst: boolean): number {
    if (!isFirst || !paragraph) {
      return 0;
    }
    return this.blockSpacing(paragraph, "before");
  }

  afterHeight(paragraph: Paragraph | null, isLast: boolean): number {
    if (!isLast || !paragraph) {
      return 0;
    }
    return this.blockSpacing(paragraph, "after");
  }

  /** 两段之间取 max(上 after, 下 before)；同样式 contextualSpacing 则清零。 */
  collapseAdjacent(lines: Line[]): void {
    for (let i = 1; i < lines.length; i += 1) {
      const prev = lines[i - 1];
      const curr = lines[i];
      if (prev.type || curr.type || !prev.isLast || !curr.isFirst) {
        continue;
      }
      if (!prev.paragraph || !curr.paragraph || prev.paragraph === curr.paragraph) {
        continue;
      }
      const gap = this.collapsedGap(prev.paragraph, curr.paragraph, prev.afterHeight, curr.beforeHeight);
      prev.height -= prev.afterHeight;
      prev.afterHeight = 0;
      prev.fullHeight = prev.height;
      curr.height += gap - curr.beforeHeight;
      curr.beforeHeight = gap;
      curr.fullHeight = curr.height;
    }
  }

  collapsedGap(prev: Paragraph, next: Paragraph, afterPx: number, beforePx: number): number {
    if (this.sameStyle(prev, next) && (this.hasContextual(prev) || this.hasContextual(next))) {
      return 0;
    }
    return Math.max(afterPx, beforePx);
  }

  private sameStyle(a: Paragraph, b: Paragraph): boolean {
    return (a.attrs.styleId ?? "") === (b.attrs.styleId ?? "");
  }

  private hasContextual(paragraph: Paragraph): boolean {
    const value = paragraph.attrs.contextualSpacing;
    return value != null && !flagOff(value);
  }

  private blockSpacing(paragraph: Paragraph, side: "before" | "after"): number {
    const attrs = paragraph.attrs;
    const auto = side === "before" ? attrs.beforeAutospacing : attrs.afterAutospacing;
    if (auto != null && !flagOff(auto)) {
      return this.lineUnitPx();
    }
    const lines = side === "before" ? attrs.beforeLines : attrs.afterLines;
    const lineCount = parseNumber(lines);
    if (lineCount != null && lineCount > 0) {
      return (lineCount / 100) * this.lineUnitPx();
    }
    const twipish = side === "before" ? attrs.before : attrs.after;
    const abs = parseNumber(twipish);
    if (abs != null && abs > 0) {
      return twipToPx(abs);
    }
    return 0;
  }

  /** 段前/段后「行」单位：有网格用 linePitch，否则用默认单倍行高。 */
  private lineUnitPx(): number {
    if (this.gridPitchPx != null && this.gridPitchPx > 0) {
      return this.gridPitchPx;
    }
    return DEFAULT_FONT_SIZE * LINE_HEIGHT_RATIO;
  }
}
