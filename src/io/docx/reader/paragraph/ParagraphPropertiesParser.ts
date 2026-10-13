import type { SectionBreak } from "../../../../model/document/PageLabel";
import type { ParagraphBorder, TabStop } from "../../../../model/style/ParagraphAttrs";
import { parseNumber, twipToPx } from "../../../../shared/units";
import type { ParagraphAttrs } from "../../../../model/style/ParagraphAttrs";
import { mergeParagraphAttrs } from "../../../../model/style/ParagraphAttrs";
import type { NumberingLevel, TitleSerial } from "../../../../model/style/Numbering";
import { formatOutlineLabel } from "../../../../model/style/OutlineLabel";
import { attr, children, first } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";

export class ParagraphPropertiesParser {
  parse(pPr: Element | null, ctx: ParseContext): ParagraphAttrs {
    if (!pPr) {
      return { snapToGrid: "1", widowControl: "1" };
    }

    let attrs: ParagraphAttrs = {
      snapToGrid: "1",
      widowControl: "1",
    };

    const styleId = attr(first(pPr, "w:pStyle"), "w:val");
    if (styleId) {
      const resolved = ctx.styles.getResolved(styleId);
      attrs = mergeParagraphAttrs(attrs, { ...resolved.paragraphAttrs, styleId });
    }

    const ind = first(pPr, "w:ind");
    if (ind) {
      attrs.firstLineChars = parseNumber(attr(ind, "w:firstLineChars"));
      attrs.leftChars = parseNumber(attr(ind, "w:leftChars"));
      attrs.rightChars = parseNumber(attr(ind, "w:rightChars"));
      attrs.firstLineTwip = parseNumber(attr(ind, "w:firstLine"));
    }

    const widow = first(pPr, "w:widowControl");
    if (widow) {
      attrs.widowControl = attr(widow, "w:val") ?? "1";
    }

    const jc = attr(first(pPr, "w:jc"), "w:val");
    if (jc) {
      attrs.textAlign = jc;
    }

    const spacing = first(pPr, "w:spacing");
    if (spacing) {
      attrs.line = attr(spacing, "w:line");
      attrs.lineRule = attr(spacing, "w:lineRule");
      attrs.beforeLines = attr(spacing, "w:beforeLines");
      attrs.afterLines = attr(spacing, "w:afterLines");
      attrs.before = attr(spacing, "w:before");
      attrs.after = attr(spacing, "w:after");
      attrs.beforeAutospacing = attr(spacing, "w:beforeAutospacing");
      attrs.afterAutospacing = attr(spacing, "w:afterAutospacing");
    }

    const contextual = first(pPr, "w:contextualSpacing");
    if (contextual) {
      attrs.contextualSpacing = attr(contextual, "w:val") ?? "1";
    }

    const snap = first(pPr, "w:snapToGrid");
    if (snap) {
      attrs.snapToGrid = attr(snap, "w:val") ?? "1";
    }

    const outline = first(pPr, "w:outlineLvl");
    if (outline) {
      const raw = Number(attr(outline, "w:val"));
      if (Number.isFinite(raw) && raw >= 0 && raw <= 8) {
        attrs.outlineLevel = raw + 1;
      } else {
        delete attrs.outlineLevel;
      }
    }

    const tabs = first(pPr, "w:tabs");
    if (tabs) {
      attrs.tabs = tabStops(tabs);
    }
    const border = first(first(pPr, "w:pBdr"), "w:bottom");
    if (border) {
      attrs.borderBottom = paragraphBorder(border);
    }
    const sectPr = first(pPr, "w:sectPr");
    if (sectPr) {
      attrs.endsSection = true;
      attrs.sectionBreak = sectionBreak(attr(first(sectPr, "w:type"), "w:val"));
    }

    const numPr = first(pPr, "w:numPr");
    if (numPr) {
      attrs.ilvl = attr(first(numPr, "w:ilvl"), "w:val") ?? "0";
      attrs.numId = attr(first(numPr, "w:numId"), "w:val");
      const serial = this.parseTitleSerial(numPr, ctx);
      if (serial) {
        attrs.titleSerial = serial;
      }
    } else if (styleId) {
      const linked = ctx.styles.get(styleId)?.paragraphAttrs;
      const level = linked?.titleSerial ?? (linked?.numId ? ctx.numbering.getLevel(linked.numId, linked.ilvl ?? "0") : undefined);
      if (level) {
        const ilvl = Number(linked?.ilvl ?? level.ilvl ?? 0) || 0;
        attrs.titleSerial = this.advanceSerial(level, ctx, styleId, linked?.numId, ilvl);
        attrs.numId = linked?.numId;
        attrs.ilvl = linked?.ilvl ?? String(ilvl);
      }
    }

    return attrs;
  }

  parseDirectRun(pPr: Element | null) {
    return first(pPr, "w:rPr");
  }

  private parseTitleSerial(numPr: Element, ctx: ParseContext): TitleSerial | undefined {
    const ilvl = attr(first(numPr, "w:ilvl"), "w:val") ?? "0";
    const numId = attr(first(numPr, "w:numId"), "w:val");
    if (!numId) {
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

function paragraphBorder(border: Element): ParagraphBorder {
  return {
    val: attr(border, "w:val"),
    sz: attr(border, "w:sz"),
    color: attr(border, "w:color"),
    space: attr(border, "w:space"),
  };
}

function sectionBreak(value: string | undefined): SectionBreak {
  if (value === "continuous" || value === "evenPage" || value === "oddPage") {
    return value;
  }
  return "nextPage";
}
