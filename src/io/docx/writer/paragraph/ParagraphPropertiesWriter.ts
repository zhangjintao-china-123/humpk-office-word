import type { ParagraphAttrs, ParagraphBorder, ParagraphShading } from "../../../../model/style/ParagraphAttrs";
import { flagOff, flagOn } from "../../../../model/style/ParagraphAttrs";
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
  const ind = indentAttributes(attrs);
  if (ind.length) {
    parts.push(`<w:ind ${ind.join(" ")}/>`);
  }
  const jc = align(attrs.textAlign);
  if (jc) {
    parts.push(`<w:jc w:val="${escapeXml(jc)}"/>`);
  }
  if (attrs.textAlignment && attrs.textAlignment !== "auto") {
    parts.push(`<w:textAlignment w:val="${escapeXml(attrs.textAlignment)}"/>`);
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
  pushFlag(parts, "w:keepNext", attrs.keepNext, true);
  pushFlag(parts, "w:keepLines", attrs.keepLines, true);
  pushFlag(parts, "w:pageBreakBefore", attrs.pageBreakBefore, true);
  pushFlag(parts, "w:overflowPunct", attrs.overflowPunct, false);
  pushFlag(parts, "w:kinsoku", attrs.kinsoku, false);
  pushFlag(parts, "w:autoSpaceDE", attrs.autoSpaceDE, false);
  pushFlag(parts, "w:autoSpaceDN", attrs.autoSpaceDN, false);
  pushFlag(parts, "w:wordWrap", attrs.wordWrap, false);
  if (attrs.outlineLevel != null && attrs.outlineLevel >= 1 && attrs.outlineLevel <= 10) {
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
  const borders = borderXml(attrs);
  if (borders) {
    parts.push(borders);
  }
  const shading = shadingXml(attrs.shading);
  if (shading) {
    parts.push(shading);
  }
  return parts.length ? `<w:pPr>${parts.join("")}</w:pPr>` : "";
}

export function paragraphIndentXml(attrs: ParagraphAttrs): string {
  const ind = indentAttributes(attrs);
  return ind.length ? `<w:ind ${ind.join(" ")}/>` : "";
}

function indentAttributes(attrs: ParagraphAttrs): string[] {
  const ind: string[] = [];
  pushNumber(ind, "w:left", attrs.leftTwip);
  pushNumber(ind, "w:leftChars", attrs.leftChars);
  pushNumber(ind, "w:right", attrs.rightTwip);
  pushNumber(ind, "w:rightChars", attrs.rightChars);
  pushNumber(ind, "w:firstLine", attrs.firstLineTwip);
  pushNumber(ind, "w:firstLineChars", attrs.firstLineChars);
  pushNumber(ind, "w:hanging", attrs.hangingTwip);
  pushNumber(ind, "w:hangingChars", attrs.hangingChars);
  return ind;
}

function pushNumber(parts: string[], name: string, value: number | undefined): void {
  if (value != null) {
    parts.push(`${name}="${Math.round(value)}"`);
  }
}

function pushAttr(parts: string[], name: string, value: string | undefined): void {
  if (value != null && value !== "") {
    parts.push(`${name}="${escapeXml(value)}"`);
  }
}

/** whenOn：默认关，打开才写。whenOn 为假：默认开，关掉才写。 */
function pushFlag(parts: string[], name: string, value: string | undefined, whenOn: boolean): void {
  if (value == null || value === "") {
    return;
  }
  const on = flagOn(value);
  if (whenOn ? on : flagOff(value) || !on) {
    parts.push(`<${name} w:val="${on ? "1" : "0"}"/>`);
  }
}

function borderXml(attrs: ParagraphAttrs): string {
  const sides: [string, ParagraphBorder | undefined][] = [
    ["w:top", attrs.borderTop],
    ["w:left", attrs.borderLeft],
    ["w:bottom", attrs.borderBottom],
    ["w:right", attrs.borderRight],
    ["w:between", attrs.borderBetween],
  ];
  const body = sides
    .map(([tag, border]) => (border ? `<${tag} ${borderAttributes(border)}/>` : ""))
    .join("");
  return body ? `<w:pBdr>${body}</w:pBdr>` : "";
}

function borderAttributes(border: ParagraphBorder): string {
  const bits = [`w:val="${escapeXml(border.val || "single")}"`];
  if (border.sz) {
    bits.push(`w:sz="${escapeXml(border.sz)}"`);
  }
  if (border.space) {
    bits.push(`w:space="${escapeXml(border.space)}"`);
  }
  if (border.color) {
    bits.push(`w:color="${escapeXml(border.color)}"`);
  }
  return bits.join(" ");
}

function shadingXml(shading: ParagraphShading | undefined): string {
  if (!shading) {
    return "";
  }
  const bits: string[] = [];
  if (shading.val) {
    bits.push(`w:val="${escapeXml(shading.val)}"`);
  }
  if (shading.color) {
    bits.push(`w:color="${escapeXml(shading.color)}"`);
  }
  if (shading.fill) {
    bits.push(`w:fill="${escapeXml(shading.fill)}"`);
  }
  return bits.length ? `<w:shd ${bits.join(" ")}/>` : "";
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
