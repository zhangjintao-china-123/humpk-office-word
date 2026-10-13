import { Numbering, type NumberingLevel } from "../../../model/style/Numbering";
import { parseNumber } from "../../../shared/units";
import { attr, children, first, parseXml } from "../ooxml/XmlQuery";
import { readIndent } from "./paragraph/ParagraphPropertiesParser";

export class NumberingParser {
  parse(xml: string | undefined): Numbering {
    const numbering = new Numbering();
    if (!xml) {
      return numbering;
    }
    const doc = parseXml(xml);
    const root = doc.documentElement;
    const abstracts = new Map<string, Map<string, NumberingLevel>>();

    for (const abstract of children(root, "w:abstractNum")) {
      const abstractId = attr(abstract, "w:abstractNumId");
      if (!abstractId) {
        continue;
      }
      const levels = new Map<string, NumberingLevel>();
      for (const lvl of children(abstract, "w:lvl")) {
        const ilvl = attr(lvl, "w:ilvl") ?? "0";
        levels.set(ilvl, readLevel(lvl, Number(ilvl) || 0));
      }
      abstracts.set(abstractId, levels);
    }

    for (const num of children(root, "w:num")) {
      const numId = attr(num, "w:numId");
      const abstractId = attr(first(num, "w:abstractNumId"), "w:val");
      if (!numId || !abstractId) {
        continue;
      }
      const levels = abstracts.get(abstractId);
      if (!levels) {
        continue;
      }
      const copied = new Map<string, NumberingLevel>();
      for (const [ilvl, level] of levels) {
        copied.set(ilvl, { ...level });
      }
      for (const override of children(num, "w:lvlOverride")) {
        const ilvl = attr(override, "w:ilvl") ?? "0";
        const base = copied.get(ilvl) ?? {
          start: 1,
          numFmt: "decimal",
          lvlText: `%${(Number(ilvl) || 0) + 1}`,
          ilvl: Number(ilvl) || 0,
        };
        const replaced = first(override, "w:lvl");
        const next = replaced ? readLevel(replaced, Number(ilvl) || 0) : { ...base };
        const startOverride = parseNumber(attr(first(override, "w:startOverride"), "w:val"));
        if (startOverride != null) {
          next.start = startOverride;
        }
        copied.set(ilvl, next);
      }
      for (const [ilvl, level] of copied) {
        numbering.setLevel(numId, ilvl, level);
      }
    }
    return numbering;
  }
}

function readLevel(lvl: Element, ilvl: number): NumberingLevel {
  const rPr = first(lvl, "w:rPr");
  const fonts = first(rPr, "w:rFonts");
  const legal = first(lvl, "w:isLgl");
  const ind = first(first(lvl, "w:pPr"), "w:ind");
  const indent = ind ? readIndent(ind) : {};
  return {
    start: parseNumber(attr(first(lvl, "w:start"), "w:val")) ?? 1,
    numFmt: attr(first(lvl, "w:numFmt"), "w:val") ?? "decimal",
    lvlText: attr(first(lvl, "w:lvlText"), "w:val") ?? "",
    lvlJc: attr(first(lvl, "w:lvlJc"), "w:val"),
    legal: legal != null && attr(legal, "w:val") !== "0" && attr(legal, "w:val") !== "false",
    suff: attr(first(lvl, "w:suff"), "w:val"),
    font: attr(fonts, "w:ascii") || attr(fonts, "w:hAnsi"),
    ilvl,
    leftTwip: indent.leftTwip,
    leftChars: indent.leftChars,
    rightTwip: indent.rightTwip,
    rightChars: indent.rightChars,
    firstLineTwip: indent.firstLineTwip,
    firstLineChars: indent.firstLineChars,
    hangingTwip: indent.hangingTwip,
    hangingChars: indent.hangingChars,
  };
}
