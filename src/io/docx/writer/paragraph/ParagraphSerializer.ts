import type { Paragraph } from "../../../../model/block/Paragraph";
import type { TocMark } from "../../../../model/toc/Toc";
import { escapeXml } from "../../ooxml/XmlEscape";
import type { PartAssets } from "../package/PartAssets";
import { RunSerializer } from "../run/RunSerializer";
import { TableSerializer } from "../table/TableSerializer";
import { paragraphPropertiesXml } from "./ParagraphPropertiesWriter";

export class ParagraphSerializer {
  private readonly runs = new RunSerializer();
  private tables: TableSerializer | null = null;

  constructor(private readonly assets?: PartAssets) {}

  serialize(paragraph: Paragraph, sectPr = ""): string {
    if (paragraph.isTable) {
      return paragraph.table ? this.tableSerializer().serialize(paragraph.table) : "";
    }
    const pPr = withSectPr(paragraphPropertiesXml(paragraph.attrs), sectPr);
    const marks = bookmarkXml(paragraph);
    const runs = paragraph.toc ? this.tocRuns(paragraph, paragraph.toc) : this.bodyRuns(paragraph);
    return `<w:p>${pPr}${marks.start}${runs}${marks.end}</w:p>`;
  }

  private bodyRuns(paragraph: Paragraph): string {
    return paragraph.blocks
      .map((block) => {
        const run = this.runs.serialize(block, this.assets);
        if (!run || (block.field !== "PAGE" && block.field !== "NUMPAGES" && block.field !== "SECTIONPAGES")) {
          return run;
        }
        const instr = block.field === "PAGE" ? " PAGE " : block.field === "NUMPAGES" ? " NUMPAGES " : " SECTIONPAGES ";
        return `<w:fldSimple w:instr="${instr}">${run}</w:fldSimple>`;
      })
      .join("");
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
