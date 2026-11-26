import type { Paragraph } from "../../../../model/block/Paragraph";
import type { Document } from "../../../../model/document/Document";
import { coverTemplate, leadingCover } from "../../../../model/document/CoverPage";
import { COVER_BREAK_TAG, COVER_TAG_PREFIX } from "../../ooxml/CoverPageTag";
import { escapeXml } from "../../ooxml/XmlEscape";
import type { PartAssets } from "../package/PartAssets";
import { ParagraphSerializer } from "../paragraph/ParagraphSerializer";

export class StorySerializer {
  private readonly paragraphs: ParagraphSerializer;

  constructor(assets?: PartAssets) {
    this.paragraphs = new ParagraphSerializer(assets);
  }

  serializeBody(document: Document, sectPrFor?: (paragraph: Paragraph) => string): string {
    const cover = document.kind === "body" ? leadingCover(document) : [];
    const serialize = (paragraph: Paragraph): string => this.paragraphs.serialize(paragraph, sectPrFor?.(paragraph) ?? "");
    const body = document.paragraphs.toArray().slice(cover.length).map(serialize).join("") || "<w:p/>";
    const id = cover[0]?.coverTemplate;
    if (!id) {
      return body;
    }
    // Word uses an ordinary page break; the editor lays out the cover boundary itself.
    const separator = '<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:snapToGrid w:val="0"/></w:pPr></w:p>';
    const alias = `<w:alias w:val="${escapeXml(coverTemplate(id).name)}"/>`;
    return taggedBlock(COVER_TAG_PREFIX + id, cover.map(serialize).join("") + taggedBlock(COVER_BREAK_TAG, separator), alias) + body;
  }
}

function taggedBlock(tag: string, content: string, properties = ""): string {
  return `<w:sdt><w:sdtPr>${properties}<w:tag w:val="${escapeXml(tag)}"/></w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`;
}
