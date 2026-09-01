import { attr, children, parseXml } from "../ooxml/XmlQuery";

export class RelationshipParser {
  parse(xml: string | undefined): Map<string, string> {
    const map = new Map<string, string>();
    if (!xml) {
      return map;
    }
    const doc = parseXml(xml);
    const root = doc.documentElement;
    for (const item of children(root, "Relationship")) {
      const id = attr(item, "Id");
      const target = attr(item, "Target");
      if (id && target) {
        map.set(id, target);
      }
    }
    return map;
  }
}
