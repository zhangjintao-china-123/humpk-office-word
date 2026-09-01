import type { Document } from "../../../../model/document/Document";
import { ParagraphSerializer } from "../paragraph/ParagraphSerializer";

export class StorySerializer {
  private readonly paragraphs = new ParagraphSerializer();

  serializeBody(document: Document): string {
    const parts: string[] = [];
    document.paragraphs.each((node) => {
      const xml = this.paragraphs.serialize(node.data);
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
