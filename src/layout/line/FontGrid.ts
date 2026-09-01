import { LINE_HEIGHT_RATIO } from "../LayoutConstants";

/** 字号在文档网格上至少占几行。大于段倍数时，1.5 倍行距不会生效。 */
export function fontGridRows(fontSizePx: number, gridPitchPx: number): number {
  if (gridPitchPx <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil((fontSizePx * LINE_HEIGHT_RATIO) / gridPitchPx - 1e-9));
}

export function snappedLineMultiple(lineMultiple: number, fontSizePx: number, gridPitchPx: number): number {
  return Math.max(lineMultiple, fontGridRows(fontSizePx, gridPitchPx));
}
