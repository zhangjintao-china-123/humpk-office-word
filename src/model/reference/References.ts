import type { Paragraph } from "../block/Paragraph";
import type { Document } from "../document/Document";
import { fieldArgs } from "../field/TextLink";
import { outlineLevelOf } from "../toc/Toc";

export type CaptionKind = "Figure" | "Table";
export type CrossReferenceKind = "text" | "page";

export const CAPTION_LABELS: Record<CaptionKind, string> = { Figure: "图", Table: "表" };

export function bindBibliography(document: Document): void {
  let rows: Paragraph[] | undefined;
  document.paragraphs.each(({ data }) => {
    if (/^BIBLIOGRAPHY\b/i.test(data.tocHint?.instruction.trim() ?? "")) rows = [];
    if (!rows) return;
    rows.push(data);
    if (data.tocHint?.fieldEnd) {
      const title = rows[0].getPreParagraph();
      if (title?.getFullText() === "参考文献") title.bibliography = { start: false, end: false };
      rows.forEach((row, index) => { row.bibliography = { start: index === 0, end: row === data }; });
      rows = undefined;
    }
  });
}

export function captionKind(paragraph: Paragraph): CaptionKind | undefined {
  for (const block of paragraph.blocks) {
    if (block.field !== "SEQ") continue;
    const name = fieldArgs(block.fieldInstr ?? "").args[0]?.toLowerCase();
    if (name === "figure" || name === "图") return "Figure";
    if (name === "table" || name === "表") return "Table";
  }
  return undefined;
}

export function referenceTargets(document: Document) {
  const counts: Record<CaptionKind, number> = { Figure: 0, Table: 0 };
  return document.paragraphs.toArray().flatMap((paragraph) => {
    if (paragraph.toc || paragraph.bibliography || paragraph.isTable) return [];
    const caption = captionKind(paragraph);
    if (!caption && !outlineLevelOf(paragraph, document.styles) && !paragraph.bookmarks.some((name) => !name.startsWith("_"))) return [];
    if (caption) counts[caption] += 1;
    const text = paragraph.blocks
      .filter((block) => !block.commentRef && !block.footnoteId && !block.endnoteId && block.revision?.kind !== "del")
      .map((block) => caption && block.field === "SEQ" ? String(counts[caption]) : block.text)
      .join("").trim();
    return text ? [{ paragraph, caption, text }] : [];
  });
}
