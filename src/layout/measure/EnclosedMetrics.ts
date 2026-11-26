import type { EnclosedSpec } from "../../model/inline/EnclosedChar";
import type { RunStyle } from "../../model/style/RunStyle";
import { fontCss, glyphSizeOf } from "./FontSpec";
import type { ITextMeasurer } from "./ITextMeasurer";

export interface EnclosedMetrics {
  boxSize: number;
  innerFontSizePx: number;
  strokeWidth: number;
}

export function enclosedInnerFontSize(basePx: number, text: string, mode: EnclosedSpec["mode"]): number {
  const count = Math.max(1, [...text].length);
  if (mode === "enlarge") {
    return Math.max(8, basePx);
  }
  const factor = count === 1 ? 0.62 : count === 2 ? 0.48 : 0.38;
  return Math.max(7, basePx * factor);
}

export function measureEnclosed(
  text: string,
  spec: EnclosedSpec,
  style: RunStyle | undefined,
  measurer: ITextMeasurer,
): EnclosedMetrics {
  const glyph = glyphSizeOf(style);
  const innerFontSizePx = enclosedInnerFontSize(glyph, text, spec.mode);
  const innerStyle: RunStyle = { ...style, fontSizePx: innerFontSizePx, fontSizeHalfPoint: undefined };
  let innerWidth = 0;
  for (const ch of text) {
    innerWidth += measurer.measure(ch, innerStyle, ch.codePointAt(0) ?? 0);
  }
  const pad = spec.mode === "enlarge" ? Math.max(6, glyph * 0.42) : Math.max(4, glyph * 0.28);
  const minBox = spec.mode === "enlarge" ? glyph * 1.42 : glyph * 1.08;
  const boxSize = Math.max(minBox, innerWidth + pad);
  return {
    boxSize,
    innerFontSizePx,
    strokeWidth: Math.max(1, Math.min(2, boxSize * 0.055)),
  };
}

export function enclosedInnerFontCss(style: RunStyle | undefined, innerFontSizePx: number, charCode: number): string {
  return fontCss({ ...style, fontSizePx: innerFontSizePx, fontSizeHalfPoint: undefined }, charCode);
}
