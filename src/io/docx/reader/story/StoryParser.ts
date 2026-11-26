import { Document } from "../../../../model/document/Document";
import type { DocumentKind } from "../../../../model/document/DocumentKind";
import { isCoverTemplate, type CoverTemplateId } from "../../../../model/document/CoverPage";
import { COVER_BREAK_TAG, COVER_TAG_PREFIX } from "../../ooxml/CoverPageTag";
import { attr, first, matchesName } from "../../ooxml/XmlQuery";
import { bindDocumentToc } from "../../../../model/toc/Toc";
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
    bindDocumentToc(document);
    return document;
  }

  parseChildren(parent: Element, ctx: ParseContext, target: Document, cover?: CoverTemplateId): void {
    for (const child of Array.from(parent.children)) {
      if (matchesName(child, "w:p")) {
        const paragraph = this.paragraphs.parse(child, ctx);
        paragraph.coverTemplate = cover;
        target.addParagraph(paragraph);
        continue;
      }
      if (matchesName(child, "w:tbl")) {
        const paragraph = this.tables.parse(child, ctx);
        paragraph.coverTemplate = cover;
        target.addParagraph(paragraph);
        continue;
      }
      if (matchesName(child, "w:sdt")) {
        const content = first(child, "w:sdtContent");
        if (content) {
          const tag = attr(first(first(child, "w:sdtPr"), "w:tag"), "w:val") ?? "";
          if (cover && tag === COVER_BREAK_TAG && isCoverBreak(content)) {
            continue;
          }
          const id = tag.startsWith(COVER_TAG_PREFIX) ? tag.slice(COVER_TAG_PREFIX.length) : "";
          const frontCover = target.kind === "body" && !target.paragraphs.head && isCoverTemplate(id) ? id : undefined;
          this.parseChildren(content, ctx, target, cover ?? frontCover);
        }
      }
    }
  }
}

function isCoverBreak(content: Element): boolean {
  const paragraph = first(content, "w:p");
  return content.children.length === 1 && paragraph?.children.length === 1 && !!first(first(paragraph, "w:pPr"), "w:pageBreakBefore");
}
