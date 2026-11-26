import { pxToPt, pxToTwip } from "../../../../shared/units";
import type { Block } from "../../../../model/block/Block";
import type { AsianLayoutSpec } from "../../../../model/inline/AsianLayout";
import type { RunStyle } from "../../../../model/style/RunStyle";
import { escapeXml, hexColor } from "../../ooxml/XmlEscape";
import { DrawingSerializer } from "../drawing/DrawingSerializer";
import type { PartAssets } from "../package/PartAssets";

export class RunSerializer {
  private readonly drawings = new DrawingSerializer();

  serialize(block: Block, assets?: PartAssets): string {
    if (block.mathXml) {
      return block.mathXml;
    }
    if (block.drawing) {
      return this.drawings.serialize(block.drawing, assets) ?? "";
    }
    if (block.footnoteId) {
      return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${escapeXml(block.footnoteId)}"/></w:r>`;
    }
    if (block.commentRef) {
      return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:commentReference w:id="${escapeXml(block.commentRef)}"/></w:r>`;
    }
    const rPr = this.properties(block.style, block.asianLayout);
    const text = block.revision?.kind === "del" ? this.deleted(block.text) : this.text(block.text);
    const br = block.charType === "page" ? `<w:br w:type="page"/>` : "";
    if (!text && !rPr && !br) {
      return "";
    }
    return `<w:r>${rPr}${br}${text || (br ? "" : "<w:t></w:t>")}</w:r>`;
  }

  propertiesOf(style: RunStyle | undefined): string {
    return style ? this.properties(style) : "";
  }

  private deleted(value: string): string {
    if (!value) {
      return "";
    }
    const preserve = /^\s|\s$/.test(value) || value.includes("  ");
    const space = preserve ? ` xml:space="preserve"` : "";
    return `<w:delText${space}>${escapeXml(value)}</w:delText>`;
  }

  private text(value: string): string {
    if (!value) {
      return "";
    }
    const preserve = /^\s|\s$/.test(value) || value.includes("  ");
    const space = preserve ? ` xml:space="preserve"` : "";
    return `<w:t${space}>${escapeXml(value)}</w:t>`;
  }

  private properties(style: RunStyle, asianLayout?: AsianLayoutSpec): string {
    const parts: string[] = [];
    if (style.characterStyleId) {
      parts.push(`<w:rStyle w:val="${escapeXml(style.characterStyleId)}"/>`);
    }
    const family = style.fontFamily || style.wEastAsia || style.wAscii || style.wHAnsi;
    if (family) {
      const ascii = escapeXml(style.wAscii || family);
      const east = escapeXml(style.wEastAsia || family);
      const hAnsi = escapeXml(style.wHAnsi || family);
      const cs = escapeXml(style.wCs || family);
      const hint = style.wHint ? ` w:hint="${escapeXml(style.wHint)}"` : "";
      parts.push(`<w:rFonts w:ascii="${ascii}" w:hAnsi="${hAnsi}" w:eastAsia="${east}" w:cs="${cs}"${hint}/>`);
    }
    if (style.bold != null) {
      parts.push(style.bold ? "<w:b/>" : '<w:b w:val="0"/>');
    }
    if (style.italic != null) {
      parts.push(style.italic ? "<w:i/>" : '<w:i w:val="0"/>');
    }
    if (style.smallCaps != null) {
      parts.push(style.smallCaps ? "<w:smallCaps/>" : '<w:smallCaps w:val="0"/>');
    }
    if (style.strike === "double") {
      parts.push("<w:dstrike/>");
    } else if (style.strike) {
      parts.push("<w:strike/>");
    }
    if (style.vertAlign === "superscript" || style.vertAlign === "subscript") {
      parts.push(`<w:vertAlign w:val="${style.vertAlign}"/>`);
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
    if (style.underline) {
      parts.push(`<w:u w:val="${escapeXml(style.underline)}"/>`);
    }
    if (asianLayout) {
      const xml = asianLayoutXml(asianLayout);
      if (xml) {
        parts.push(xml);
      }
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

function asianLayoutXml(spec: AsianLayoutSpec): string {
  if (spec.kind === "fitWidth") {
    const val = Math.max(120, pxToTwip(spec.fitWidthPx ?? 48));
    return `<w:fitText w:val="${val}"/>`;
  }
  if (spec.kind === "combine") {
    return `<w:eastAsianLayout w:combine="1"/>`;
  }
  if (spec.kind === "twoInOne") {
    const brackets = spec.brackets ?? "none";
    return `<w:eastAsianLayout w:combine="1" w:combineBrackets="${escapeXml(brackets)}"/>`;
  }
  if (spec.kind === "tatechuyoko") {
    const compress = spec.compress !== false ? "1" : "0";
    return `<w:eastAsianLayout w:vert="1" w:vertCompress="${compress}"/>`;
  }
  return "";
}
