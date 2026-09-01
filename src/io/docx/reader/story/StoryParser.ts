import { Document } from "../../../../model/document/Document";
import type { DocumentKind } from "../../../../model/document/DocumentKind";
import { first, matchesName } from "../../ooxml/XmlQuery";
import { ParagraphParser } from "../paragraph/ParagraphParser";
import type { ParseContext } from "../ParseContext";
import { TableParser } from "../table/TableParser";

/**
 * 任意故事容器的共用解析：w:body / w:hdr / w:ftr / w:tc / w:sdtContent
 * 只认子级的 w:p 与 w:tbl，再递归同一套逻辑。
 */
export class StoryParser {
  private paragraphs = new ParagraphParser();
  private tables = new TableParser();

  parseRoot(
    root: Element | null,
    ctx: ParseContext,
    kind: DocumentKind,
    partName?: string,
  ): Document {
    const document = new Document();
    document.kind = kind;
    document.partName = partName;
    document.styles = ctx.styles;
    document.numbering = ctx.numbering;
    if (root) {
      this.parseChildren(root, ctx, document);
    }
    return document;
  }

  parseChildren(parent: Element, ctx: ParseContext, target: Document): void {
    for (const child of Array.from(parent.children)) {
      if (matchesName(child, "w:p")) {
        target.addParagraph(this.paragraphs.parse(child, ctx));
        continue;
      }
      if (matchesName(child, "w:tbl")) {
        target.addParagraph(this.tables.parse(child, ctx));
        continue;
      }
      if (matchesName(child, "w:sdt")) {
        const content = first(child, "w:sdtContent");
        if (content) {
          this.parseChildren(content, ctx, target);
        }
      }
    }
  }
}
