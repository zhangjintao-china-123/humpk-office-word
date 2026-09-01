import { halfPointToPx, parseNumber } from "../../../../shared/units";
import type { RunStyle } from "../../../../model/style/RunStyle";
import { attr, first } from "../../ooxml/XmlQuery";

export class RunPropertiesParser {
  parse(rPr: Element | null): RunStyle {
    if (!rPr) {
      return {};
    }
    const style: RunStyle = {};
    const fonts = first(rPr, "w:rFonts");
    if (fonts) {
      style.wHint = attr(fonts, "w:hint");
      style.wAscii = attr(fonts, "w:ascii");
      style.wEastAsia = attr(fonts, "w:eastAsia");
      style.wCs = attr(fonts, "w:cs");
      style.wHAnsi = attr(fonts, "w:hAnsi");
    }

    const color = attr(first(rPr, "w:color"), "w:val");
    if (color) {
      style.color = color === "auto" ? "#000000" : `#${color}`;
    }

    const sz = attr(first(rPr, "w:sz"), "w:val") ?? attr(first(rPr, "w:szCs"), "w:val");
    const halfPoint = parseNumber(sz);
    if (halfPoint != null) {
      style.fontSizeHalfPoint = halfPoint;
      style.fontSizePx = halfPointToPx(halfPoint);
    }

    const fill = attr(first(rPr, "w:shd"), "w:fill");
    if (fill && fill !== "auto") {
      style.backgroundColor = `#${fill}`;
    }

    const highlight = attr(first(rPr, "w:highlight"), "w:val");
    if (highlight) {
      style.highlight = highlight;
    }

    const bold = first(rPr, "w:b");
    if (bold) {
      style.bold = attr(bold, "w:val") !== "0";
    }

    const italic = first(rPr, "w:i");
    if (italic) {
      style.italic = attr(italic, "w:val") !== "0";
    }

    const underline = attr(first(rPr, "w:u"), "w:val");
    if (underline) {
      style.underline = underline;
    }

    if (first(rPr, "w:dstrike")) {
      style.strike = "double";
    } else if (first(rPr, "w:strike")) {
      style.strike = "single";
    }

    return style;
  }
}
