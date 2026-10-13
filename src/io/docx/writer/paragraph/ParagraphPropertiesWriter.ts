import type { ParagraphAttrs } from "../../../../model/style/ParagraphAttrs";
import { pxToTwip } from "../../../../shared/units";
import { escapeXml } from "../../ooxml/XmlEscape";

export function paragraphPropertiesXml(attrs: ParagraphAttrs, omitStyleId = false): string {
  const parts: string[] = [];
  if (!omitStyleId && attrs.styleId) {
    parts.push(`<w:pStyle w:val="${escapeXml(attrs.styleId)}"/>`);
  }
  if (attrs.numId) {
    const ilvl = escapeXml(attrs.ilvl ?? "0");
    parts.push(`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${escapeXml(attrs.numId)}"/></w:numPr>`);
  }
  const ind: string[] = [];
  if (attrs.firstLineTwip != null) {
    ind.push(`w:firstLine="${Math.round(attrs.firstLineTwip)}"`);
  }
  if (attrs.firstLineChars != null) {
    ind.push(`w:firstLineChars="${Math.round(attrs.firstLineChars)}"`);
  }
  if (attrs.leftChars != null) {
    ind.push(`w:leftChars="${Math.round(attrs.leftChars)}"`);
  }
  if (attrs.rightChars != null) {
    ind.push(`w:rightChars="${Math.round(attrs.rightChars)}"`);
  }
  if (ind.length) {
    parts.push(`<w:ind ${ind.join(" ")}/>`);
  }
  const jc = align(attrs.textAlign);
  if (jc) {
    parts.push(`<w:jc w:val="${escapeXml(jc)}"/>`);
  }
  const spacing: string[] = [];
  pushAttr(spacing, "w:before", attrs.before);
  pushAttr(spacing, "w:after", attrs.after);
  pushAttr(spacing, "w:beforeLines", attrs.beforeLines);
  pushAttr(spacing, "w:afterLines", attrs.afterLines);
  pushAttr(spacing, "w:line", attrs.line);
  pushAttr(spacing, "w:lineRule", attrs.lineRule);
  pushAttr(spacing, "w:beforeAutospacing", attrs.beforeAutospacing);
  pushAttr(spacing, "w:afterAutospacing", attrs.afterAutospacing);
  if (spacing.length) {
    parts.push(`<w:spacing ${spacing.join(" ")}/>`);
  }
  if (attrs.contextualSpacing && attrs.contextualSpacing !== "0") {
    parts.push(`<w:contextualSpacing w:val="${escapeXml(attrs.contextualSpacing)}"/>`);
  }
  if (attrs.snapToGrid && attrs.snapToGrid !== "1") {
    parts.push(`<w:snapToGrid w:val="${escapeXml(attrs.snapToGrid)}"/>`);
  }
  if (attrs.widowControl && attrs.widowControl !== "1") {
    parts.push(`<w:widowControl w:val="${escapeXml(attrs.widowControl)}"/>`);
  }
  if (attrs.outlineLevel != null && attrs.outlineLevel >= 1 && attrs.outlineLevel <= 9) {
    parts.push(`<w:outlineLvl w:val="${attrs.outlineLevel - 1}"/>`);
  }
  if (attrs.tabs?.length) {
    const tabs = attrs.tabs
      .map((stop) => {
        const leader = stop.leader ? ` w:leader="${escapeXml(stop.leader)}"` : "";
        return `<w:tab w:val="${stop.val}"${leader} w:pos="${pxToTwip(stop.posPx)}"/>`;
      })
      .join("");
    parts.push(`<w:tabs>${tabs}</w:tabs>`);
  }
  const border = attrs.borderBottom;
  if (border?.val && border.val !== "nil" && border.val !== "none") {
    const bits = [`w:val="${escapeXml(border.val)}"`];
    if (border.sz) {
      bits.push(`w:sz="${escapeXml(border.sz)}"`);
    }
    if (border.space) {
      bits.push(`w:space="${escapeXml(border.space)}"`);
    }
    if (border.color) {
      bits.push(`w:color="${escapeXml(border.color)}"`);
    }
    parts.push(`<w:pBdr><w:bottom ${bits.join(" ")}/></w:pBdr>`);
  }
  return parts.length ? `<w:pPr>${parts.join("")}</w:pPr>` : "";
}

function pushAttr(parts: string[], name: string, value: string | undefined): void {
  if (value) {
    parts.push(`${name}="${escapeXml(value)}"`);
  }
}

function align(value: string | undefined): string | undefined {
  if (!value || value === "left" || value === "start") {
    return undefined;
  }
  if (value === "end") {
    return "right";
  }
  if (value === "justify") {
    return "both";
  }
  return value;
}
