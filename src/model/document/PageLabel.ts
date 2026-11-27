import type { Paragraph } from "../block/Paragraph";
import type { Document } from "./Document";
import type { Section } from "./Section";
import type { Line } from "../line/Line";
import { formatLevelNumber } from "../style/OutlineLabel";

export type FieldKind =
  | "PAGE"
  | "NUMPAGES"
  | "SECTIONPAGES"
  | "DATE"
  | "TIME"
  | "CREATEDATE"
  | "SAVEDATE"
  | "AUTHOR"
  | "TITLE"
  | "FILENAME"
  | "REF"
  | "PAGEREF"
  | "STYLEREF"
  | "SEQ"
  | "HYPERLINK"
  | "FORMULA"
  | "CITATION"
  | "OTHER";
export type SectionBreak = "nextPage" | "continuous" | "evenPage" | "oddPage";

export interface PageLabel {
  sectionIndex: number;
  pageInSection: number;
  pageNumber: number;
  sectionPages: number;
  totalPages: number;
  fmt?: string;
}

export interface FieldValues {
  PAGE: string;
  NUMPAGES: string;
  SECTIONPAGES: string;
}

const NAMED_FIELDS: Record<string, FieldKind> = {
  PAGE: "PAGE",
  NUMPAGES: "NUMPAGES",
  SECTIONPAGES: "SECTIONPAGES",
  DATE: "DATE",
  TIME: "TIME",
  CREATEDATE: "CREATEDATE",
  SAVEDATE: "SAVEDATE",
  AUTHOR: "AUTHOR",
  TITLE: "TITLE",
  FILENAME: "FILENAME",
  REF: "REF",
  PAGEREF: "PAGEREF",
  STYLEREF: "STYLEREF",
  SEQ: "SEQ",
  HYPERLINK: "HYPERLINK",
  CITATION: "CITATION",
};

export function fieldKind(instr: string): FieldKind | undefined {
  if (instr.trimStart().startsWith("=")) return "FORMULA";
  const token = instr.trim().split(/\s+/)[0]?.toUpperCase();
  if (!token || token === "TOC" || token === "BIBLIOGRAPHY") {
    return undefined;
  }
  return NAMED_FIELDS[token] ?? (/^[A-Z][A-Z0-9]*$/.test(token) ? "OTHER" : undefined);
}

export function isReferenceField(kind: FieldKind | undefined): boolean {
  return kind === "CITATION" || kind === "REF" || kind === "PAGEREF" || kind === "SEQ";
}

export function formatPageNumber(value: number, fmt?: string): string {
  return formatLevelNumber(Math.max(0, Math.trunc(value)), fmt || "decimal");
}

export function fieldValues(label: PageLabel): FieldValues {
  return {
    PAGE: formatPageNumber(label.pageNumber, label.fmt),
    NUMPAGES: String(label.totalPages),
    SECTIONPAGES: String(label.sectionPages),
  };
}

/** 段落上的分节符属于这一节的末尾，后面的段落进入下一节。 */
export function assignSections(document: Document): void {
  const last = Math.max(0, document.sections.length - 1);
  let index = 0;
  document.paragraphs.each((node) => {
    const paragraph = node.data;
    paragraph.sectionIndex = document.sections.length ? Math.min(index, last) : 0;
    paragraph.sectionBreak = undefined;
    if (!paragraph.attrs.endsSection || index >= last) {
      return;
    }
    paragraph.sectionBreak = paragraph.attrs.sectionBreak ?? document.sections[index]?.breakType ?? "nextPage";
    index += 1;
  });
}

export function labelPages(lines: Line[], pageHeight: number, pageCount: number, sections: Section[]): PageLabel[] {
  const count = Math.max(1, pageCount);
  const height = Math.max(1, pageHeight);
  const seen = Array.from({ length: count }, () => false);
  const indexes = Array.from({ length: count }, () => 0);
  for (const line of lines) {
    if (!line.paragraph || line.type === "page") {
      continue;
    }
    const page = Math.min(count - 1, Math.max(0, Math.floor(line.top / height)));
    if (!seen[page]) {
      indexes[page] = line.paragraph.sectionIndex ?? 0;
      seen[page] = true;
    }
  }
  for (let page = 1; page < count; page += 1) {
    if (!seen[page]) {
      indexes[page] = indexes[page - 1];
    }
  }

  const sectionPages = new Map<number, number>();
  for (const index of indexes) {
    sectionPages.set(index, (sectionPages.get(index) ?? 0) + 1);
  }

  let nextNumber = 1;
  let current = -1;
  let pageInSection = 0;
  return indexes.map((sectionIndex) => {
    const section = sections[sectionIndex];
    if (sectionIndex !== current) {
      current = sectionIndex;
      pageInSection = 1;
      if (section?.pageNumStart != null) {
        nextNumber = section.pageNumStart;
      }
    } else {
      pageInSection += 1;
    }
    const pageNumber = nextNumber;
    nextNumber += 1;
    return {
      sectionIndex,
      pageInSection,
      pageNumber,
      sectionPages: sectionPages.get(sectionIndex) ?? 1,
      totalPages: count,
      fmt: section?.pageNumFmt,
    };
  });
}

export function sectionOfParagraph(paragraph: Paragraph | undefined, sections: Section[]): Section | undefined {
  if (!sections.length) {
    return undefined;
  }
  const index = Math.min(sections.length - 1, Math.max(0, paragraph?.sectionIndex ?? 0));
  return sections[index];
}
