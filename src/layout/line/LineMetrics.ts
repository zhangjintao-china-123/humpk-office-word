import type { Paragraph } from "../../model/block/Paragraph";
import type { Line } from "../../model/line/Line";
import type { Word } from "../../model/inline/Word";
import { flagOff } from "../../model/style/ParagraphAttrs";
import { outlineLabelWidth } from "../../model/style/OutlineLabel";
import { parseNumber, twipToPx } from "../../shared/units";
import { fontSizeOf } from "../measure/FontSpec";
import { DEFAULT_FONT_SIZE, INDENT_CHAR_WIDTH, LINE_HEIGHT_RATIO } from "../LayoutConstants";
import { snappedLineMultiple } from "./FontGrid";

export function indentUnit(word: Word | null | undefined): number {
  const size = word ? fontSizeOf(word.getStyle()) : 0;
  return size > 0 ? size : INDENT_CHAR_WIDTH;
}

export class LineMetrics {
  gridPitchPx?: number;

  leftBlank(paragraph: Paragraph | null, isFirst: boolean, firstWord: Word | null): number {
    if (!paragraph) {
      return 0;
    }
    const unit = indentUnit(firstWord);
    const left = sideIndent(paragraph.attrs.leftChars, paragraph.attrs.leftTwip, unit);
    if (!isFirst) {
      return left;
    }
    const hanging = sideIndent(paragraph.attrs.hangingChars, paragraph.attrs.hangingTwip, unit);
    if (hanging > 0) {
      return left - hanging;
    }
    const firstLine = sideIndent(paragraph.attrs.firstLineChars, paragraph.attrs.firstLineTwip, unit);
    return left + firstLine;
  }

  /** 编号画在悬挂区里，正文和后续行对齐。悬挂不够时才把首行再往右推。 */
  textStartWithLabel(paragraph: Paragraph | null, word: Word, firstLineLeft: number, label: string): number {
    const body = this.leftBlank(paragraph, false, word);
    const need = outlineLabelWidth(label, word.height || DEFAULT_FONT_SIZE) + 6;
    const gutter = body - firstLineLeft;
    if (gutter >= need) {
      return body;
    }
    return body + (need - Math.max(0, gutter));
  }

  rightBlank(paragraph: Paragraph | null, firstWord: Word | null = null): number {
    if (!paragraph) {
      return 0;
    }
    return sideIndent(paragraph.attrs.rightChars, paragraph.attrs.rightTwip, indentUnit(firstWord));
  }

  snapsToGrid(paragraph: Paragraph | null): boolean {
    return !flagOff(paragraph?.attrs.snapToGrid) && this.gridPitchPx != null && this.gridPitchPx > 0;
  }

  lineHeight(paragraph: Paragraph | null, maxFontSize: number): number {
    const size = Math.max(maxFontSize, DEFAULT_FONT_SIZE * 0.5);
    const attrs = paragraph?.attrs;
    const line = parseNumber(attrs?.line);
    const rule = attrs?.lineRule;
    const autoRule = rule == null || rule === "" || rule === "auto";
    const multiple = autoRule && line != null && line > 0 ? line / 240 : 1;
    const fromTwip = line != null && line > 0 ? twipToPx(line) : 0;
    const snap = autoRule && this.snapsToGrid(paragraph);
    const rows = snap ? snappedLineMultiple(multiple, size, this.gridPitchPx!) : multiple;
    const auto = snap ? this.gridPitchPx! * rows : size * LINE_HEIGHT_RATIO * multiple;

    if (rule === "exact") {
      return fromTwip > 0 ? fromTwip : auto;
    }
    if (rule === "atLeast" && fromTwip > 0) {
      return Math.max(fromTwip, size * LINE_HEIGHT_RATIO);
    }
    return auto;
  }

  /** auto/baseline/top 贴着行框上沿；center 居中；bottom 贴底。字高出框时从下边裁。 */
  contentOffset(boxHeight: number, glyphHeight: number, align: string | undefined): number {
    if (boxHeight <= 0) {
      return 0;
    }
    if (align === "center") {
      return glyphHeight <= boxHeight ? (boxHeight - glyphHeight) / 2 : 0;
    }
    if (align === "bottom") {
      return boxHeight - glyphHeight;
    }
    return 0;
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
    const key = (paragraph: Paragraph) => paragraph.attrs.styleId || paragraph.attrs.resolvedStyleId || "";
    return key(a) === key(b);
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

function sideIndent(chars: number | undefined, twip: number | undefined, unit: number): number {
  if (chars != null && chars !== 0) {
    return (chars / 100) * unit;
  }
  if (twip != null && twip !== 0) {
    return twipToPx(twip);
  }
  return 0;
}
