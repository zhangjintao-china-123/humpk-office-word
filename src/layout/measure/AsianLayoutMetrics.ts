import { asianBracketPair, splitAsianTwoLines, type AsianLayoutSpec } from "../../model/inline/AsianLayout";
import type { RunStyle } from "../../model/style/RunStyle";
import { fontCss, glyphSizeOf } from "./FontSpec";
import type { ITextMeasurer } from "./ITextMeasurer";

export interface AsianLayoutMetrics {
  width: number;
  height: number;
  subFontSizePx: number;
  topText: string;
  bottomText: string;
  leftBracket: string;
  rightBracket: string;
  leftBracketW: number;
  rightBracketW: number;
  innerWidth: number;
}

export function measureAsianLayout(
  text: string,
  spec: AsianLayoutSpec,
  style: RunStyle | undefined,
  measurer: ITextMeasurer,
): AsianLayoutMetrics {
  const glyph = glyphSizeOf(style);
  const sampleCode = text.codePointAt(0) ?? 0x4e2d;

  if (spec.kind === "fitWidth") {
    const width = Math.max(spec.fitWidthPx ?? glyph * 3, glyph);
    return {
      width,
      height: glyph,
      subFontSizePx: glyph,
      topText: text,
      bottomText: "",
      leftBracket: "",
      rightBracket: "",
      leftBracketW: 0,
      rightBracketW: 0,
      innerWidth: width,
    };
  }

  if (spec.kind === "tatechuyoko") {
    const natural = measureTextWidth(text, style, sampleCode, measurer);
    const width = spec.compress !== false ? Math.max(glyph, Math.min(natural, glyph * 1.35)) : Math.max(glyph, natural);
    return {
      width,
      height: glyph,
      subFontSizePx: glyph,
      topText: text,
      bottomText: "",
      leftBracket: "",
      rightBracket: "",
      leftBracketW: 0,
      rightBracketW: 0,
      innerWidth: width,
    };
  }

  // combine or twoInOne
  const subFontSizePx = Math.max(7, glyph * 0.52);
  const subStyle: RunStyle = { ...style, fontSizePx: subFontSizePx, fontSizeHalfPoint: undefined };
  const [topText, bottomText] = splitAsianTwoLines(text);
  const topW = topText ? measureTextWidth(topText, subStyle, topText.codePointAt(0) ?? sampleCode, measurer) : 0;
  const bottomW = bottomText
    ? measureTextWidth(bottomText, subStyle, bottomText.codePointAt(0) ?? sampleCode, measurer)
    : 0;
  const innerWidth = Math.max(topW, bottomW, spec.kind === "combine" ? glyph * 0.9 : 8);

  const [leftBracket, rightBracket] = spec.kind === "twoInOne" ? asianBracketPair(spec.brackets) : ["", ""];
  const leftBracketW = leftBracket ? measureTextWidth(leftBracket, style, leftBracket.charCodeAt(0), measurer) : 0;
  const rightBracketW = rightBracket ? measureTextWidth(rightBracket, style, rightBracket.charCodeAt(0), measurer) : 0;
  const width = Math.max(glyph, leftBracketW + innerWidth + rightBracketW + (spec.kind === "combine" ? 2 : 1));

  return {
    width,
    height: glyph,
    subFontSizePx,
    topText,
    bottomText,
    leftBracket,
    rightBracket,
    leftBracketW,
    rightBracketW,
    innerWidth,
  };
}

export function asianSubFontCss(style: RunStyle | undefined, px: number, charCode: number): string {
  return fontCss({ ...style, fontSizePx: px, fontSizeHalfPoint: undefined }, charCode);
}

function measureTextWidth(
  text: string,
  style: RunStyle | undefined,
  charCode: number,
  measurer: ITextMeasurer,
): number {
  let total = 0;
  for (const ch of text) {
    total += measurer.measure(ch, style, ch.codePointAt(0) ?? charCode);
  }
  return total;
}
