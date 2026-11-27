import { LineMetrics } from "../layout/line/LineMetrics";
import type { Paragraph } from "../model/block/Paragraph";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import { cmToPx, pxToCm, pxToTwip } from "../shared/units";

export type IndentMarker = "first" | "hanging" | "left" | "right";

export interface IndentBounds {
  width: number;
  leftMargin: number;
  rightMargin: number;
}

const MIN_TEXT_WIDTH = cmToPx(0.5);
const metrics = new LineMetrics();

export function indentMarkers(paragraph: Paragraph, width: number): Record<IndentMarker, number> {
  const word = paragraph.lines[0]?.startNode?.data ?? null;
  const left = metrics.leftBlank(paragraph, false, word);
  return {
    first: metrics.leftBlank(paragraph, true, word),
    hanging: left,
    left,
    right: width - metrics.rightBlank(paragraph, word),
  };
}

export function markerLimits(marker: IndentMarker, positions: Record<IndentMarker, number>, bounds: IndentBounds) {
  const firstOffset = positions.first - positions.left;
  const paperLeft = -bounds.leftMargin;
  const paperRight = bounds.width + bounds.rightMargin;
  if (marker === "right") return { min: Math.min(paperRight, Math.max(positions.first, positions.left) + MIN_TEXT_WIDTH), max: paperRight };
  const textRight = positions.right - MIN_TEXT_WIDTH;
  const max = marker === "left" ? textRight - Math.max(0, firstOffset) : textRight;
  // 移动组合标记时，保持首行与正文的相对距离，两者都留在纸面内。
  const min = marker === "left" ? paperLeft - Math.min(0, firstOffset) : paperLeft;
  const end = Math.min(paperRight, max);
  return { min: Math.min(min, end), max: end };
}

export function snapIndent(px: number, limits: { min: number; max: number }, zero = 0): number {
  const snapped = zero + cmToPx(Math.round(pxToCm(px - zero) * 10) / 10);
  return Math.max(limits.min, Math.min(limits.max, snapped));
}

export function rulerIndentPatch(paragraph: Paragraph, marker: IndentMarker, px: number, bounds: IndentBounds): Partial<ParagraphAttrs> {
  const positions = indentMarkers(paragraph, bounds.width);
  const { min, max } = markerLimits(marker, positions, bounds);
  const target = Math.max(min, Math.min(max, px));
  if (marker === "right") return { rightChars: undefined, rightTwip: pxToTwip(bounds.width - target) };
  if (marker === "left") return { leftChars: undefined, leftTwip: pxToTwip(target) };

  const left = marker === "hanging" ? target : positions.left;
  const first = marker === "first" ? target : positions.first;
  const offset = pxToTwip(first - left);
  return {
    ...(marker === "hanging" ? { leftChars: undefined, leftTwip: pxToTwip(left) } : {}),
    firstLineChars: undefined,
    hangingChars: undefined,
    firstLineTwip: offset < 0 ? undefined : Math.max(0, offset),
    hangingTwip: offset < 0 ? -offset : undefined,
  };
}
