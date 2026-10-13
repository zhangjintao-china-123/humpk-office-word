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
    const defaults = first(doc.documentElement, "w:docDefaults");
    const pPrDefault = first(first(defaults, "w:pPrDefault"), "w:pPr");
    const rPrDefault = first(first(defaults, "w:rPrDefault"), "w:rPr");
    if (pPrDefault) {
      sheet.docDefaults = this.paragraphProperties.parse(pPrDefault, emptyCtx);
    }
    if (rPrDefault) {
      sheet.docDefaultRun = this.runProperties.parse(rPrDefault);
    }
    for (const style of children(doc.documentElement, "w:style")) {
      const styleId = attr(style, "w:styleId");
      if (!styleId) {
        continue;
      }
      const definition: StyleDefinition = {
        styleId,
        name: attr(first(style, "w:name"), "w:val"),
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
      const type = definition.type;
      const isDefault = attr(style, "w:default");
      if ((type == null || type === "paragraph") && isDefault != null && isDefault !== "0" && isDefault !== "false") {
        sheet.defaultParagraphStyleId = styleId;
      }
      sheet.add(definition);
    }
    return sheet;
  }
}
