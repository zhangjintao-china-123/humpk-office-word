import { Document } from "../../../model/document/Document";
import { first, parseXml } from "../ooxml/XmlQuery";
import { HeaderFooterParser } from "./header-footer/HeaderFooterParser";
import type { ParseContext } from "./ParseContext";
import { StoryParser } from "./story/StoryParser";

export class DocumentParser {
  constructor(
    private readonly story: StoryParser,
    private readonly headerFooter: HeaderFooterParser,
  ) {}

  parse(xml: string, ctx: ParseContext): Document {
    const xmlDoc = parseXml(xml);
    const body = first(xmlDoc.documentElement, "w:body");
    const document = this.story.parseRoot(body, ctx, "body", "word/document.xml");
    if (body) {
      this.headerFooter.attach(body, ctx, document);
    }
    return document;
  }
}
