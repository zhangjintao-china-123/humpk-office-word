import { parseNumber } from "../../../../shared/units";
import type { ParagraphAttrs } from "../../../../model/style/ParagraphAttrs";
import { mergeParagraphAttrs } from "../../../../model/style/ParagraphAttrs";
import type { TitleSerial } from "../../../../model/style/Numbering";
import { attr, first } from "../../ooxml/XmlQuery";
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

    const numPr = first(pPr, "w:numPr");
    if (numPr) {
      const serial = this.parseTitleSerial(numPr, ctx);
      if (serial) {
        attrs.titleSerial = serial;
      }
    } else if (styleId) {
      const style = ctx.styles.get(styleId);
      if (style?.paragraphAttrs?.titleSerial) {
        attrs.titleSerial = this.advanceSerial(style.paragraphAttrs.titleSerial, ctx, styleId);
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
    return this.advanceSerial(level, ctx, `${numId}#${ilvl}`, numId, Number(ilvl));
  }

  private advanceSerial(
    level: { start: number; numFmt: string; lvlText: string; lvlJc?: string },
    ctx: ParseContext,
    key: string,
    numId?: string,
    ilvl?: number,
  ): TitleSerial {
    const serialKey = numId != null && ilvl != null ? `n:${numId}#${ilvl}` : `s:${key}`;
    const current = ctx.titleSerial.get(serialKey) ?? 0;
    const serial = current + 1;
    ctx.titleSerial.set(serialKey, serial);
    if (numId != null && ilvl != null) {
      ctx.titleSerial.set(`n:${numId}#${ilvl + 1}`, 0);
    }

    const result: TitleSerial = {
      start: level.start,
      numFmt: level.numFmt,
      lvlText: level.lvlText,
      lvlJc: level.lvlJc,
      serial,
    };
    if (numId != null && ilvl != null && ilvl > 0) {
      for (let i = 0; i < ilvl; i += 1) {
        result[`lvl_${i}`] = ctx.titleSerial.get(`n:${numId}#${i}`) ?? 1;
      }
    }
    return result;
  }
}
