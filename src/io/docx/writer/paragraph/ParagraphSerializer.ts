import type { Block } from "../../../../model/block/Block";
import type { Paragraph } from "../../../../model/block/Paragraph";
import { sameLink, type TextLink } from "../../../../model/field/TextLink";
import { enclosedShapeSymbol } from "../../../../model/inline/EnclosedChar";
import { sameIds, sameRevision, type RevisionMark } from "../../../../model/review/Review";
import type { TocMark } from "../../../../model/toc/Toc";
import { pxToPt } from "../../../../shared/units";
import { escapeXml } from "../../ooxml/XmlEscape";
import type { PartAssets } from "../package/PartAssets";
import type { commentBoundaries } from "../review/ReviewSerializer";
import { RunSerializer } from "../run/RunSerializer";
import { TableSerializer } from "../table/TableSerializer";
import { paragraphPropertiesXml } from "./ParagraphPropertiesWriter";

export class ParagraphSerializer {
  private readonly runs = new RunSerializer();
  private tables: TableSerializer | null = null;

  constructor(private readonly comments: ReturnType<typeof commentBoundaries>, private readonly assets?: PartAssets) {}

  serialize(paragraph: Paragraph, sectPr = ""): string {
    if (paragraph.isTable) {
      return paragraph.table ? this.tableSerializer().serialize(paragraph.table) : "";
    }
    const pPr = withSectPr(paragraphPropertiesXml(paragraph.attrs), sectPr);
    const marks = bookmarkXml(paragraph);
    const runs = paragraph.toc ? this.tocRuns(paragraph, paragraph.toc) : this.bodyRuns(paragraph);
    const start = paragraph.bibliography?.start ? fieldChar("begin") + instrText(" BIBLIOGRAPHY ") + fieldChar("separate") : "";
    const end = paragraph.bibliography?.end ? fieldChar("end") : "";
    return `<w:p>${pPr}${marks.start}${start}${runs}${end}${marks.end}</w:p>`;
  }

  private bodyRuns(paragraph: Paragraph): string {
    const blocks = paragraph.blocks;
    let xml = "";
    let index = 0;
    let openRevision: RevisionMark | undefined;
    const closeRevision = (): void => {
      if (!openRevision) {
        return;
      }
      xml += `</w:${openRevision.kind}>`;
      openRevision = undefined;
    };
    const markComments = (at: number, edge: "start" | "end"): void => {
      const ids = this.comments[edge].get(blocks[at]);
      if (!ids?.length) return;
      closeRevision();
      const tag = edge === "start" ? "commentRangeStart" : "commentRangeEnd";
      for (const id of ids) xml += `<w:${tag} w:id="${escapeXml(id)}"/>`;
    };
    const canJoin = (next: number): boolean => next === index ||
      (!this.comments.start.has(blocks[next]) && !this.comments.end.has(blocks[next - 1]));
    const syncRevision = (next: RevisionMark | undefined): void => {
      if (sameRevision(openRevision, next) || (!openRevision && !next)) {
        return;
      }
      closeRevision();
      if (next) {
        xml += revisionStart(next);
        openRevision = next;
      }
    };
    while (index < blocks.length) {
      const block = blocks[index];
      markComments(index - 1, "end");
      markComments(index, "start");
      if (block.commentRef || block.footnoteId || block.endnoteId) {
        closeRevision();
        xml += this.runs.serialize(block, this.assets);
        index += 1;
        continue;
      }
      syncRevision(block.revision);
      if (block.link && !paragraph.toc) {
        const parts: string[] = [];
        let next = index;
        while (
          next < blocks.length &&
          canJoin(next) &&
          sameLink(blocks[next].link, block.link) &&
          !blocks[next].field &&
          !blocks[next].footnoteId &&
          !blocks[next].endnoteId &&
          !blocks[next].commentRef &&
          sameIds(blocks[next].commentIds, block.commentIds) &&
          revisionEqual(blocks[next].revision, block.revision)
        ) {
          const run = this.runs.serialize(blocks[next], this.assets);
          if (run) {
            parts.push(run);
          }
          next += 1;
        }
        if (parts.length && block.link) {
          xml += hyperlinkXml(block.link, parts.join(""), this.assets);
        }
        index = next;
        continue;
      }
      if (block.field && block.field !== "HYPERLINK") {
        const parts: string[] = [];
        let next = index;
        while (
          next < blocks.length &&
          canJoin(next) &&
          (next === index || !blocks[next].startsField) &&
          blocks[next].field === block.field &&
          blocks[next].fieldInstr === block.fieldInstr &&
          !blocks[next].link &&
          !blocks[next].footnoteId &&
          !blocks[next].endnoteId &&
          !blocks[next].commentRef &&
          sameIds(blocks[next].commentIds, block.commentIds) &&
          revisionEqual(blocks[next].revision, block.revision)
        ) {
          const run = this.runs.serialize(blocks[next], this.assets);
          if (run) {
            parts.push(run);
          }
          next += 1;
        }
        if (parts.length) {
          xml += `<w:fldSimple w:instr="${escapeXml(fieldInstruction(block))}">${parts.join("")}</w:fldSimple>`;
        }
        index = next;
        continue;
      }
      if (block.enclosed && block.text) {
        xml += this.enclosedXml(block);
        index += 1;
        continue;
      }
      xml += this.runs.serialize(block, this.assets);
      index += 1;
    }
    markComments(index - 1, "end");
    closeRevision();
    return xml;
  }

  private enclosedXml(block: Block): string {
    const spec = block.enclosed!;
    const symbol = spec.symbol || enclosedShapeSymbol(spec.shape);
    const baseHalf =
      block.style.fontSizeHalfPoint != null
        ? Math.round(block.style.fontSizeHalfPoint)
        : block.style.fontSizePx != null
          ? Math.round(pxToPt(block.style.fontSizePx) * 2)
          : 22;
    const symbolHalf = spec.mode === "enlarge" ? Math.round(baseHalf * 1.45) : baseHalf;
    const textHalf = spec.mode === "enlarge" ? baseHalf : Math.max(10, Math.round(baseHalf * 0.6));
    const symbolRPr = this.runs.propertiesOf({ ...block.style, fontSizeHalfPoint: symbolHalf, fontSizePx: undefined });
    const textRPr = this.runs.propertiesOf({ ...block.style, fontSizeHalfPoint: textHalf, fontSizePx: undefined });
    const symExpr = spec.mode === "enlarge" ? `\\s\\do 1(${symbol})` : symbol;
    return [
      fieldChar("begin"),
      `<w:r>${symbolRPr}<w:instrText xml:space="preserve">${escapeXml(` eq \\o\\ac(${symExpr},`)}</w:instrText></w:r>`,
      `<w:r>${textRPr}<w:instrText xml:space="preserve">${escapeXml(block.text)}</w:instrText></w:r>`,
      `<w:r>${symbolRPr}<w:instrText xml:space="preserve">)</w:instrText></w:r>`,
      fieldChar("separate"),
      fieldChar("end"),
    ].join("");
  }

  private tocRuns(paragraph: Paragraph, toc: TocMark): string {
    if (toc.role === "end") {
      return fieldChar("end");
    }
    if (toc.role === "start") {
      const max = toc.maxLevel || 3;
      return `${fieldChar("begin")}${instrText(` TOC \\o "1-${max}" \\h \\z \\u `)}${fieldChar("separate")}${this.bodyRuns(paragraph)}`;
    }
    const title = this.bodyRuns(paragraph);
    const page = toc.page > 0 ? String(toc.page) : "";
    const inner = `${title}<w:r><w:tab/></w:r><w:r><w:t>${escapeXml(page)}</w:t></w:r>`;
    if (!toc.targetBookmark) {
      return inner;
    }
    return `<w:hyperlink w:anchor="${escapeXml(toc.targetBookmark)}">${inner}</w:hyperlink>`;
  }

  private tableSerializer(): TableSerializer {
    this.tables ??= new TableSerializer(this);
    return this.tables;
  }
}

function fieldInstruction(block: Block): string {
  if (block.fieldInstr) {
    return block.fieldInstr;
  }
  return ` ${block.field ?? "QUOTE"} `;
}

function hyperlinkXml(link: TextLink, inner: string, assets?: PartAssets): string {
  const anchor = link.anchor ? ` w:anchor="${escapeXml(link.anchor)}"` : "";
  if (link.url) {
    const id = assets?.hyperlink(link.url);
    const rel = id ? ` r:id="${id}"` : "";
    return `<w:hyperlink${rel}${anchor}>${inner}</w:hyperlink>`;
  }
  return `<w:hyperlink${anchor}>${inner}</w:hyperlink>`;
}

function revisionEqual(a: RevisionMark | undefined, b: RevisionMark | undefined): boolean {
  if (!a && !b) {
    return true;
  }
  return sameRevision(a, b);
}

function revisionStart(mark: RevisionMark): string {
  const author = mark.author ? ` w:author="${escapeXml(mark.author)}"` : "";
  const date = mark.date ? ` w:date="${escapeXml(mark.date)}"` : "";
  return `<w:${mark.kind} w:id="${escapeXml(mark.id)}"${author}${date}>`;
}

function fieldChar(type: "begin" | "separate" | "end"): string {
  return `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;
}

function instrText(value: string): string {
  return `<w:r><w:instrText xml:space="preserve">${escapeXml(value)}</w:instrText></w:r>`;
}

function withSectPr(pPr: string, sectPr: string): string {
  if (!sectPr) {
    return pPr;
  }
  if (!pPr) {
    return `<w:pPr>${sectPr}</w:pPr>`;
  }
  return pPr.replace("</w:pPr>", `${sectPr}</w:pPr>`);
}

function bookmarkXml(paragraph: Paragraph): { start: string; end: string } {
  const start = paragraph.bookmarks
    .map((name, index) => `<w:bookmarkStart w:id="${paragraph.id * 10 + index}" w:name="${escapeXml(name)}"/>`)
    .join("");
  const end = paragraph.bookmarks
    .map((_, index) => `<w:bookmarkEnd w:id="${paragraph.id * 10 + index}"/>`)
    .join("");
  return { start, end };
}
