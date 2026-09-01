import { pxToPt } from "../../../../shared/units";
import type { Block } from "../../../../model/block/Block";
import type { RunStyle } from "../../../../model/style/RunStyle";
import { escapeXml, hexColor } from "../../ooxml/XmlEscape";

export class RunSerializer {
  serialize(block: Block): string {
    if (block.drawing || block.charType === "page") {
      return "";
    }
    const rPr = this.properties(block.style);
    const text = this.text(block.text);
    if (!text && !rPr) {
      return "";
    }
    return `<w:r>${rPr}${text || "<w:t></w:t>"}</w:r>`;
  }

  private text(value: string): string {
    if (!value) {
      return "";
    }
    const preserve = /^\s|\s$/.test(value) || value.includes("  ");
    const space = preserve ? ` xml:space="preserve"` : "";
    return `<w:t${space}>${escapeXml(value)}</w:t>`;
  }

  private properties(style: RunStyle): string {
    const parts: string[] = [];
    const family = style.fontFamily || style.wEastAsia || style.wAscii || style.wHAnsi;
    if (family) {
      const ascii = escapeXml(style.wAscii || family);
      const east = escapeXml(style.wEastAsia || family);
      const hAnsi = escapeXml(style.wHAnsi || family);
      const cs = escapeXml(style.wCs || family);
      const hint = style.wHint ? ` w:hint="${escapeXml(style.wHint)}"` : "";
      parts.push(`<w:rFonts w:ascii="${ascii}" w:hAnsi="${hAnsi}" w:eastAsia="${east}" w:cs="${cs}"${hint}/>`);
    }
    if (style.bold) {
      parts.push("<w:b/>");
    }
    if (style.italic) {
      parts.push("<w:i/>");
    }
    if (style.underline && style.underline !== "none") {
      parts.push(`<w:u w:val="${escapeXml(style.underline)}"/>`);
    }
    if (style.strike === "double") {
      parts.push("<w:dstrike/>");
    } else if (style.strike) {
      parts.push("<w:strike/>");
    }
    const color = hexColor(style.color);
    if (color) {
      parts.push(`<w:color w:val="${color}"/>`);
    }
    const half = this.halfPoint(style);
    if (half != null) {
      parts.push(`<w:sz w:val="${half}"/>`);
      parts.push(`<w:szCs w:val="${half}"/>`);
    }
    const fill = hexColor(style.backgroundColor);
    if (fill) {
      parts.push(`<w:shd w:val="clear" w:fill="${fill}"/>`);
    }
    if (style.highlight && !style.highlight.startsWith("#") && style.highlight !== "none") {
      parts.push(`<w:highlight w:val="${escapeXml(style.highlight)}"/>`);
    }
    return parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
  }

  private halfPoint(style: RunStyle): number | undefined {
    if (style.fontSizeHalfPoint != null) {
      return Math.round(style.fontSizeHalfPoint);
    }
    if (style.fontSizePx != null) {
      return Math.round(pxToPt(style.fontSizePx) * 2);
    }
    return undefined;
  }
}
