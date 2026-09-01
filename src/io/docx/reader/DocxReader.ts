import { Document } from "../../../model/document/Document";
import { HeaderFooterResolver } from "../../../layout/page/HeaderFooterResolver";
import { DocxPackage } from "../ooxml/DocxPackage";
import { DocumentParser } from "./DocumentParser";
import { HeaderFooterParser } from "./header-footer/HeaderFooterParser";
import { NumberingParser } from "./NumberingParser";
import { ParseContext } from "./ParseContext";
import { RelationshipParser } from "./RelationshipParser";
import { StoryParser } from "./story/StoryParser";
import { SettingsParser } from "./SettingsParser";
import { StyleParser } from "./StyleParser";

export class DocxReader {
  private relationships = new RelationshipParser();
  private styles = new StyleParser();
  private numbering = new NumberingParser();
  private story = new StoryParser();
  private documents = new DocumentParser(this.story, new HeaderFooterParser(this.story));
  private settings = new SettingsParser();

  async read(data: ArrayBuffer): Promise<Document> {
    const pack = await DocxPackage.open(data);
    return this.readPackage(pack);
  }

  readPackage(pack: DocxPackage): Document {
    const ctx = new ParseContext(pack);
    ctx.relationships = this.relationships.parse(pack.xml("word/_rels/document.xml.rels"));
    ctx.styles = this.styles.parse(pack.xml("word/styles.xml"));
    ctx.numbering = this.numbering.parse(pack.xml("word/numbering.xml"));
    ctx.storyParser = this.story;

    const documentXml = pack.xml("word/document.xml");
    if (!documentXml) {
      throw new Error("docx 缺少 word/document.xml");
    }
    const document = this.documents.parse(documentXml, ctx);
    const settings = this.settings.parse(pack.xml("word/settings.xml"));
    document.adjustLineHeightInTable = settings.adjustLineHeightInTable;
    document.evenAndOddHeaders = settings.evenAndOddHeaders;
    HeaderFooterResolver.inherit(document);
    return document;
  }
}
