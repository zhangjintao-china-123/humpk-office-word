import type { Paragraph } from "../../../../model/block/Paragraph";
import type { Document } from "../../../../model/document/Document";
import type { PartAssets } from "../package/PartAssets";
import { ParagraphSerializer } from "../paragraph/ParagraphSerializer";

export class StorySerializer {
  private readonly paragraphs: ParagraphSerializer;

  constructor(assets?: PartAssets) {
    this.paragraphs = new ParagraphSerializer(assets);
  }

  serializeBody(document: Document, sectPrFor?: (paragraph: Paragraph) => string): string {
    const parts: string[] = [];
    document.paragraphs.each((node) => {
      const xml = this.paragraphs.serialize(node.data, sectPrFor?.(node.data) ?? "");
      if (xml) {
        parts.push(xml);
      }
    });
    if (!parts.length) {
      parts.push("<w:p/>");
    }
    return parts.join("");
  }
}
