/** OOXML 单位换算。解析阶段只用 CSS 像素，不乘 devicePixelRatio。 */

export function twipToPx(twip: number): number {
  return twip / 15;
}

export function emuToPx(emu: number): number {
  return emu * 96 / 914400;
}

export function halfPointToPx(sz: number): number {
  return (sz / 2) * (96 / 72);
}

export function ptToPx(pt: number): number {
  return pt * (96 / 72);
}

export function pxToPt(px: number): number {
  return px * (72 / 96);
}

export function parseNumber(value: string | undefined): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
