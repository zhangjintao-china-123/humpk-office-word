import type { Document } from "../../../model/document/Document";
import { DocxPackage } from "../ooxml/DocxPackage";
import { contentTypesXml, documentRelsXml, rootRelsXml, stylesXml, wrapDocumentXml } from "./package/DefaultParts";
import { StorySerializer } from "./story/StorySerializer";

export class DocxWriter {
  private readonly story = new StorySerializer();

  async write(document: Document): Promise<ArrayBuffer> {
    const pack = new DocxPackage();
    pack.setXml("[Content_Types].xml", contentTypesXml());
    pack.setXml("_rels/.rels", rootRelsXml());
    pack.setXml("word/document.xml", wrapDocumentXml(this.story.serializeBody(document)));
    pack.setXml("word/_rels/document.xml.rels", documentRelsXml());
    pack.setXml("word/styles.xml", stylesXml());
    return pack.generate();
  }
}
