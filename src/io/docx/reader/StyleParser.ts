import { StyleSheet, type StyleDefinition } from "../../../model/style/StyleSheet";
import { attr, children, first, parseXml } from "../ooxml/XmlQuery";
import { ParagraphPropertiesParser } from "./paragraph/ParagraphPropertiesParser";
import { ParseContext } from "./ParseContext";
import { RunPropertiesParser } from "./run/RunPropertiesParser";

export class StyleParser {
  private paragraphProperties = new ParagraphPropertiesParser();
  private runProperties = new RunPropertiesParser();

  parse(xml: string | undefined): StyleSheet {
    const sheet = new StyleSheet();
    if (!xml) {
      return sheet;
    }
    const doc = parseXml(xml);
    const emptyCtx = new ParseContext();
    for (const style of children(doc.documentElement, "w:style")) {
      const styleId = attr(style, "w:styleId");
      if (!styleId) {
        continue;
      }
      const definition: StyleDefinition = {
        styleId,
        type: attr(style, "w:type"),
        basedOn: attr(first(style, "w:basedOn"), "w:val"),
      };
      const pPr = first(style, "w:pPr");
      if (pPr) {
        definition.paragraphAttrs = this.paragraphProperties.parse(pPr, emptyCtx);
      }
      const rPr = first(style, "w:rPr");
      if (rPr) {
        definition.runStyle = this.runProperties.parse(rPr);
      }
      sheet.add(definition);
    }
    return sheet;
  }
}
