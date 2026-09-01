import { Numbering, type NumberingLevel } from "../../../model/style/Numbering";
import { parseNumber } from "../../../shared/units";
import { attr, children, first, parseXml } from "../ooxml/XmlQuery";

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
        levels.set(ilvl, {
          start: parseNumber(attr(first(lvl, "w:start"), "w:val")) ?? 1,
          numFmt: attr(first(lvl, "w:numFmt"), "w:val") ?? "decimal",
          lvlText: attr(first(lvl, "w:lvlText"), "w:val") ?? "",
          lvlJc: attr(first(lvl, "w:lvlJc"), "w:val"),
        });
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
      for (const [ilvl, level] of levels) {
        numbering.setLevel(numId, ilvl, level);
      }
    }
    return numbering;
  }
}
