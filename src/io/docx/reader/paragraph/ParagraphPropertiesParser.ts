import type { SectionBreak } from "../../../../model/document/PageLabel";
import type { ParagraphBorder, ParagraphShading, TabStop } from "../../../../model/style/ParagraphAttrs";
import { parseNumber, twipToPx } from "../../../../shared/units";
import type { ParagraphAttrs } from "../../../../model/style/ParagraphAttrs";
import { mergeParagraphAttrs } from "../../../../model/style/ParagraphAttrs";
import type { NumberingLevel, TitleSerial } from "../../../../model/style/Numbering";
import { formatOutlineLabel } from "../../../../model/style/OutlineLabel";
import { attr, children, first } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";

const INDENT_KEYS = [
  "leftTwip",
  "leftChars",
  "rightTwip",
  "rightChars",
  "firstLineTwip",
  "firstLineChars",
  "hangingTwip",
  "hangingChars",
] as const;

export class ParagraphPropertiesParser {
  parse(pPr: Element | null, ctx: ParseContext): ParagraphAttrs {
    const direct = readDirect(pPr);
    const explicitStyleId = direct.styleId;
    const appliedStyleId = explicitStyleId ?? (ctx.applyDefaults ? ctx.styles.defaultParagraphStyleId : undefined);

    let attrs: ParagraphAttrs = {
      snapToGrid: "1",
      widowControl: "1",
    };
    if (ctx.applyDefaults) {
      attrs = mergeParagraphAttrs(attrs, ctx.styles.docDefaults);
    }
    if (appliedStyleId && ctx.styles.get(appliedStyleId)) {
      attrs = mergeParagraphAttrs(attrs, ctx.styles.getResolved(appliedStyleId).paragraphAttrs);
    }
    if (explicitStyleId) {
      attrs.styleId = explicitStyleId;
    } else if (appliedStyleId) {
      attrs.resolvedStyleId = appliedStyleId;
    }

    const numbered = this.applyNumbering(attrs, pPr, ctx, explicitStyleId);
    if (direct.hasInd) {
      replaceIndent(attrs, direct.props);
    } else if (numbered) {
      const level = ctx.numbering.getLevel(attrs.numId ?? "", attrs.ilvl ?? "0");
      if (level && hasLevelIndent(level)) {
        replaceIndent(attrs, levelIndent(level));
      }
    }

    return mergeParagraphAttrs(attrs, direct.props);
  }

  parseDirectRun(pPr: Element | null) {
    return first(pPr, "w:rPr");
  }

  private applyNumbering(
    attrs: ParagraphAttrs,
    pPr: Element | null,
    ctx: ParseContext,
    explicitStyleId: string | undefined,
  ): boolean {
    const numPr = first(pPr, "w:numPr");
    if (numPr) {
      attrs.ilvl = attr(first(numPr, "w:ilvl"), "w:val") ?? "0";
      attrs.numId = attr(first(numPr, "w:numId"), "w:val");
      const serial = this.parseTitleSerial(numPr, ctx);
      if (serial) {
        attrs.titleSerial = serial;
      }
      return attrs.numId != null && attrs.numId !== "0";
    }
    const styleId = explicitStyleId ?? attrs.resolvedStyleId;
    if (!styleId) {
      return false;
    }
    const linked = ctx.styles.get(styleId)?.paragraphAttrs;
    const level = linked?.titleSerial ?? (linked?.numId ? ctx.numbering.getLevel(linked.numId, linked.ilvl ?? "0") : undefined);
    if (!level) {
      return false;
    }
    const ilvl = Number(linked?.ilvl ?? level.ilvl ?? 0) || 0;
    attrs.titleSerial = this.advanceSerial(level, ctx, styleId, linked?.numId, ilvl);
    attrs.numId = linked?.numId;
    attrs.ilvl = linked?.ilvl ?? String(ilvl);
    return attrs.numId != null && attrs.numId !== "0";
  }

  private parseTitleSerial(numPr: Element, ctx: ParseContext): TitleSerial | undefined {
    const ilvl = attr(first(numPr, "w:ilvl"), "w:val") ?? "0";
    const numId = attr(first(numPr, "w:numId"), "w:val");
    if (!numId || numId === "0") {
      return undefined;
    }
    const level = ctx.numbering.getLevel(numId, ilvl);
    if (!level) {
      return undefined;
    }
    return this.advanceSerial(level, ctx, `${numId}#${ilvl}`, numId, Number(ilvl) || 0);
  }

  private advanceSerial(
    level: NumberingLevel,
    ctx: ParseContext,
    key: string,
    numId?: string,
    ilvl = 0,
  ): TitleSerial {
    const serialKey = numId != null ? `n:${numId}#${ilvl}` : `s:${key}`;
    const serial = ctx.titleSerial.has(serialKey) ? (ctx.titleSerial.get(serialKey) ?? level.start) + 1 : level.start;
    ctx.titleSerial.set(serialKey, serial);
    if (numId != null) {
      for (let deeper = ilvl + 1; deeper <= 8; deeper += 1) {
        ctx.titleSerial.delete(`n:${numId}#${deeper}`);
      }
    }

    const parents: number[] = [];
    const parentFmts: string[] = [];
    const result: TitleSerial = {
      ...level,
      ilvl,
      serial,
      label: "",
    };
    if (numId != null && ilvl > 0) {
      for (let i = 0; i < ilvl; i += 1) {
        const parent = ctx.numbering.getLevel(numId, String(i));
        const value = ctx.titleSerial.get(`n:${numId}#${i}`) ?? parent?.start ?? 1;
        parents[i] = value;
        parentFmts[i] = parent?.numFmt ?? "decimal";
        result[`lvl_${i}`] = value;
      }
    }
    result.label = formatOutlineLabel(level, ilvl, serial, parents, parentFmts);
    return result;
  }
}

function readDirect(pPr: Element | null): { props: ParagraphAttrs; hasInd: boolean; styleId?: string } {
  const props: ParagraphAttrs = {};
  if (!pPr) {
    return { props, hasInd: false };
  }
  const styleId = attr(first(pPr, "w:pStyle"), "w:val") ?? undefined;
  const ind = first(pPr, "w:ind");
  if (ind) {
    copyIndent(props, readIndent(ind));
  }
  assignOnOff(props, "widowControl", first(pPr, "w:widowControl"));
  const jc = attr(first(pPr, "w:jc"), "w:val");
  if (jc) {
    props.textAlign = jc;
  }
  const align = attr(first(pPr, "w:textAlignment"), "w:val");
  if (align) {
    props.textAlignment = align;
  }
  const spacing = first(pPr, "w:spacing");
  if (spacing) {
    copyIfPresent(props, "line", attr(spacing, "w:line"));
    copyIfPresent(props, "lineRule", attr(spacing, "w:lineRule"));
    copyIfPresent(props, "beforeLines", attr(spacing, "w:beforeLines"));
    copyIfPresent(props, "afterLines", attr(spacing, "w:afterLines"));
    copyIfPresent(props, "before", attr(spacing, "w:before"));
    copyIfPresent(props, "after", attr(spacing, "w:after"));
    copyIfPresent(props, "beforeAutospacing", attr(spacing, "w:beforeAutospacing"));
    copyIfPresent(props, "afterAutospacing", attr(spacing, "w:afterAutospacing"));
  }
  assignOnOff(props, "contextualSpacing", first(pPr, "w:contextualSpacing"));
  assignOnOff(props, "snapToGrid", first(pPr, "w:snapToGrid"));
  assignOnOff(props, "keepNext", first(pPr, "w:keepNext"));
  assignOnOff(props, "keepLines", first(pPr, "w:keepLines"));
  assignOnOff(props, "pageBreakBefore", first(pPr, "w:pageBreakBefore"));
  assignOnOff(props, "overflowPunct", first(pPr, "w:overflowPunct"));
  assignOnOff(props, "kinsoku", first(pPr, "w:kinsoku"));
  assignOnOff(props, "autoSpaceDE", first(pPr, "w:autoSpaceDE"));
  assignOnOff(props, "autoSpaceDN", first(pPr, "w:autoSpaceDN"));
  assignOnOff(props, "wordWrap", first(pPr, "w:wordWrap"));

  const outline = first(pPr, "w:outlineLvl");
  if (outline) {
    const raw = Number(attr(outline, "w:val"));
    if (Number.isFinite(raw) && raw >= 0 && raw <= 9) {
      props.outlineLevel = raw + 1;
    }
  }
  const tabs = first(pPr, "w:tabs");
  if (tabs) {
    props.tabs = tabStops(tabs);
  }
  const borders = readBorders(first(pPr, "w:pBdr"));
  Object.assign(props, borders);
  const shading = readShading(first(pPr, "w:shd"));
  if (shading) {
    props.shading = shading;
  }
  const sectPr = first(pPr, "w:sectPr");
  if (sectPr) {
    props.endsSection = true;
    props.sectionBreak = sectionBreak(attr(first(sectPr, "w:type"), "w:val"));
  }
  return { props, hasInd: ind != null, styleId };
}

export function readIndent(ind: Element): ParagraphAttrs {
  const attrs: ParagraphAttrs = {};
  const left = parseNumber(attr(ind, "w:left")) ?? parseNumber(attr(ind, "w:start"));
  const leftChars = parseNumber(attr(ind, "w:leftChars")) ?? parseNumber(attr(ind, "w:startChars"));
  const right = parseNumber(attr(ind, "w:right")) ?? parseNumber(attr(ind, "w:end"));
  const rightChars = parseNumber(attr(ind, "w:rightChars")) ?? parseNumber(attr(ind, "w:endChars"));
  if (left != null) {
    attrs.leftTwip = left;
  }
  if (leftChars != null) {
    attrs.leftChars = leftChars;
  }
  if (right != null) {
    attrs.rightTwip = right;
  }
  if (rightChars != null) {
    attrs.rightChars = rightChars;
  }
  const firstLine = parseNumber(attr(ind, "w:firstLine"));
  const firstLineChars = parseNumber(attr(ind, "w:firstLineChars"));
  const hanging = parseNumber(attr(ind, "w:hanging"));
  const hangingChars = parseNumber(attr(ind, "w:hangingChars"));
  if (firstLine != null) {
    attrs.firstLineTwip = firstLine;
  }
  if (firstLineChars != null) {
    attrs.firstLineChars = firstLineChars;
  }
  if (hanging != null) {
    attrs.hangingTwip = hanging;
  }
  if (hangingChars != null) {
    attrs.hangingChars = hangingChars;
  }
  return attrs;
}

function copyIndent(target: ParagraphAttrs, source: ParagraphAttrs): void {
  for (const key of INDENT_KEYS) {
    const value = source[key];
    if (value != null) {
      target[key] = value;
    }
  }
}

function replaceIndent(attrs: ParagraphAttrs, source: ParagraphAttrs): void {
  for (const key of INDENT_KEYS) {
    delete attrs[key];
  }
  copyIndent(attrs, source);
}

function hasLevelIndent(level: NumberingLevel): boolean {
  return (
    level.leftTwip != null ||
    level.leftChars != null ||
    level.rightTwip != null ||
    level.rightChars != null ||
    level.firstLineTwip != null ||
    level.firstLineChars != null ||
    level.hangingTwip != null ||
    level.hangingChars != null
  );
}

function levelIndent(level: NumberingLevel): ParagraphAttrs {
  return {
    leftTwip: level.leftTwip,
    leftChars: level.leftChars,
    rightTwip: level.rightTwip,
    rightChars: level.rightChars,
    firstLineTwip: level.firstLineTwip,
    firstLineChars: level.firstLineChars,
    hangingTwip: level.hangingTwip,
    hangingChars: level.hangingChars,
  };
}

function copyIfPresent(props: ParagraphAttrs, key: keyof ParagraphAttrs, value: string | undefined): void {
  if (value != null) {
    (props as Record<string, string>)[key] = value;
  }
}

function assignOnOff(props: ParagraphAttrs, key: keyof ParagraphAttrs, element: Element | null): void {
  if (!element) {
    return;
  }
  (props as Record<string, string>)[key] = attr(element, "w:val") ?? "1";
}

function tabStops(tabs: Element): TabStop[] {
  const stops: TabStop[] = [];
  for (const tab of children(tabs, "w:tab")) {
    const pos = parseNumber(attr(tab, "w:pos"));
    const raw = attr(tab, "w:val") ?? "left";
    if (pos == null || raw === "clear" || raw === "bar" || raw === "num") {
      continue;
    }
    const val = raw === "center" || raw === "right" || raw === "decimal" ? raw : "left";
    stops.push({ posPx: twipToPx(pos), val, leader: attr(tab, "w:leader") });
  }
  return stops.sort((a, b) => a.posPx - b.posPx);
}

const BORDER_SIDES = [
  ["w:top", "borderTop"],
  ["w:left", "borderLeft"],
  ["w:bottom", "borderBottom"],
  ["w:right", "borderRight"],
  ["w:between", "borderBetween"],
] as const;

function readBorders(pBdr: Element | null): ParagraphAttrs {
  const attrs: ParagraphAttrs = {};
  if (!pBdr) {
    return attrs;
  }
  for (const [tag, key] of BORDER_SIDES) {
    const border = first(pBdr, tag);
    if (border) {
      attrs[key] = paragraphBorder(border);
    }
  }
  return attrs;
}

function paragraphBorder(border: Element): ParagraphBorder {
  return {
    val: attr(border, "w:val"),
    sz: attr(border, "w:sz"),
    color: attr(border, "w:color"),
    space: attr(border, "w:space"),
  };
}

function readShading(shd: Element | null): ParagraphShading | undefined {
  if (!shd) {
    return undefined;
  }
  return {
    val: attr(shd, "w:val"),
    color: attr(shd, "w:color"),
    fill: attr(shd, "w:fill"),
  };
}

function sectionBreak(value: string | undefined): SectionBreak {
  if (value === "continuous" || value === "evenPage" || value === "oddPage") {
    return value;
  }
  return "nextPage";
}
