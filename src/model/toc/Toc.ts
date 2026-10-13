import { Block } from "../block/Block";
import { Paragraph } from "../block/Paragraph";
import type { Document } from "../document/Document";
import type { StyleSheet } from "../style/StyleSheet";

/** 目录段落：标题、条目或域结束标记。 */
export interface TocMark {
  role: "start" | "entry" | "end";
  maxLevel: number;
  level: number;
  targetId: number;
  targetBookmark: string;
  page: number;
}

/** 读入时从域指令和超链接上摘下来的信息，绑定后再用。 */
export interface TocHint {
  instruction: string;
  fieldEnd: boolean;
  anchor?: string;
}

export interface TocHeading {
  paragraph: Paragraph;
  level: number;
  text: string;
}

const TOC_TITLE = "目录";

export function headingLevelFromName(name: string | undefined): number | undefined {
  if (!name) {
    return undefined;
  }
  const match = name.trim().match(/^(?:heading|标题)\s*([1-9])$/i);
  return match ? Number(match[1]) : undefined;
}

export function tocStyleLevel(styleId?: string, name?: string): number | undefined {
  const match = `${styleId ?? ""} ${name ?? ""}`.match(/\btoc\s*([1-9])\b/i);
  return match ? Number(match[1]) : undefined;
}

export function tocInstructionLevel(instr: string): number | null {
  const trimmed = instr.trim();
  if (!/^TOC\b/i.test(trimmed)) {
    return null;
  }
  const range = trimmed.match(/\\o\s*"(\d+)\s*-\s*(\d+)"/i);
  if (!range) {
    return 3;
  }
  const max = Number(range[2]);
  return max >= 1 && max <= 9 ? max : 3;
}

export function outlineLevelOf(paragraph: Paragraph, styles: StyleSheet): number | undefined {
  if (paragraph.isTable || paragraph.toc) {
    return undefined;
  }
  const level = paragraph.attrs.outlineLevel;
  if (level != null && level >= 1 && level <= 9) {
    return level;
  }
  const styleId = paragraph.attrs.styleId;
  if (!styleId) {
    return undefined;
  }
  return headingLevelFromName(styles.get(styleId)?.name) ?? headingLevelFromName(styleId);
}

export function headingText(paragraph: Paragraph): string {
  const label = paragraph.attrs.titleSerial?.label ?? "";
  return `${label}${paragraph.getFullText()}`.replace(/\s+/g, " ").trim();
}

export function collectHeadings(document: Document, maxLevel: number): TocHeading[] {
  const found: TocHeading[] = [];
  document.paragraphs.each((node) => {
    const paragraph = node.data;
    const level = outlineLevelOf(paragraph, document.styles);
    if (!level || level > maxLevel) {
      return;
    }
    const text = headingText(paragraph);
    if (!text) {
      return;
    }
    found.push({ paragraph, level, text });
  });
  return found;
}

/** 没有目录时插在 anchor 前面；已有目录则按当前标题重做条目。 */
export function syncToc(document: Document, insertBefore: Paragraph | null): void {
  ensureTocStyles(document);
  let starts = document.paragraphs.toArray().filter((paragraph) => paragraph.toc?.role === "start");
  if (!starts.length) {
    const start = makeStart(document, 3);
    if (insertBefore) {
      document.insertParagraphBefore(insertBefore, start);
    } else {
      document.addParagraph(start);
    }
    starts = [start];
  }
  for (const start of starts) {
    rebuildAround(document, start);
  }
}

export function assignTocPages(document: Document, pageHeight: number): void {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
    return;
  }
  const pages = new Map<number, number>();
  document.paragraphs.each((node) => {
    const first = node.data.lines[0];
    if (!first || node.data.toc) {
      return;
    }
    pages.set(node.data.id, Math.floor(first.top / pageHeight) + 1);
  });
  document.paragraphs.each((node) => {
    const toc = node.data.toc;
    if (!toc || toc.role !== "entry") {
      return;
    }
    const page = pages.get(toc.targetId);
    if (page) {
      toc.page = page;
    }
  });
}

/** 把读入的 TOC 域结果绑成可刷新的目录条目。 */
export function bindDocumentToc(document: Document): void {
  const bookmarks = new Map<string, Paragraph>();
  document.paragraphs.each((node) => {
    for (const name of node.data.bookmarks) {
      bookmarks.set(name, node.data);
    }
  });

  let active: number | null = null;
  document.paragraphs.each((node) => {
    const paragraph = node.data;
    const hint = paragraph.tocHint;
    const maxLevel = hint ? tocInstructionLevel(hint.instruction) : null;
    if (maxLevel != null) {
      paragraph.toc = mark("start", maxLevel, 0, 0, "");
      active = maxLevel;
      return;
    }
    if (active == null) {
      return;
    }
    if (isTocEnd(paragraph, hint)) {
      paragraph.toc = mark("end", active, 0, 0, "");
      active = null;
      return;
    }
    if (!looksLikeEntry(paragraph, hint, document.styles)) {
      active = null;
      return;
    }
    const styleName = paragraph.attrs.styleId ? document.styles.get(paragraph.attrs.styleId)?.name : undefined;
    const level = tocStyleLevel(paragraph.attrs.styleId, styleName) ?? 1;
    const anchor = hint?.anchor ?? "";
    const target = anchor ? bookmarks.get(anchor) : undefined;
    keepTitle(paragraph);
    paragraph.toc = mark("entry", active, level, target?.id ?? 0, anchor);
    applyEntryAttrs(paragraph, level);
  });
}

function rebuildAround(document: Document, start: Paragraph): void {
  const maxLevel = start.toc?.maxLevel || 3;
  let node = start.node?.next ?? null;
  while (node) {
    const role = node.data.toc?.role;
    if (role !== "entry" && role !== "end") {
      break;
    }
    const next = node.next;
    document.removeParagraph(node.data);
    node = next;
  }
  const headings = collectHeadings(document, maxLevel);
  let after = start;
  for (const heading of headings) {
    const bookmark = ensureBookmark(heading.paragraph);
    const entry = makeEntry(document, heading, maxLevel, bookmark);
    document.insertParagraphAfter(after, entry);
    after = entry;
  }
  document.insertParagraphAfter(after, makeEnd(document, maxLevel));
}

function makeStart(document: Document, maxLevel: number): Paragraph {
  const paragraph = new Paragraph(document.nextParagraphId());
  const block = new Block();
  block.text = TOC_TITLE;
  block.style = { bold: true, color: "#1F4E79", fontSizePx: 22, fontFamily: "黑体", wEastAsia: "黑体", wAscii: "黑体" };
  paragraph.addBlock(block);
  paragraph.attrs = { textAlign: "center", snapToGrid: "0", widowControl: "0" };
  paragraph.toc = mark("start", maxLevel, 0, 0, "");
  return paragraph;
}

function makeEntry(document: Document, heading: TocHeading, maxLevel: number, bookmark: string): Paragraph {
  const paragraph = new Paragraph(document.nextParagraphId());
  const block = new Block();
  block.text = heading.text;
  block.style = { color: "#0563C1" };
  paragraph.addBlock(block);
  applyEntryAttrs(paragraph, heading.level);
  paragraph.toc = mark("entry", maxLevel, heading.level, heading.paragraph.id, bookmark);
  return paragraph;
}

function makeEnd(document: Document, maxLevel: number): Paragraph {
  const paragraph = new Paragraph(document.nextParagraphId());
  paragraph.addBlock(new Block());
  paragraph.attrs = { snapToGrid: "0", widowControl: "0" };
  paragraph.toc = mark("end", maxLevel, 0, 0, "");
  return paragraph;
}

function mark(role: TocMark["role"], maxLevel: number, level: number, targetId: number, targetBookmark: string): TocMark {
  return { role, maxLevel, level, targetId, targetBookmark, page: 0 };
}

function ensureBookmark(paragraph: Paragraph): string {
  const existing = paragraph.bookmarks.find((name) => name.startsWith("_Toc"));
  if (existing) {
    return existing;
  }
  const name = `_Toc${paragraph.id}`;
  paragraph.bookmarks.push(name);
  return name;
}

function ensureTocStyles(document: Document): void {
  for (let level = 1; level <= 9; level += 1) {
    const styleId = `TOC${level}`;
    if (document.styles.get(styleId)) {
      continue;
    }
    document.styles.add({ styleId, name: `toc ${level}`, type: "paragraph" });
  }
}

function applyEntryAttrs(paragraph: Paragraph, level: number): void {
  paragraph.attrs.leftChars = (level - 1) * 200;
  paragraph.attrs.rightChars = 500;
  paragraph.attrs.snapToGrid = "0";
  paragraph.attrs.widowControl = "0";
  if (!paragraph.attrs.styleId) {
    paragraph.attrs.styleId = `TOC${level}`;
  }
}

function looksLikeEntry(paragraph: Paragraph, hint: TocHint | undefined, styles: StyleSheet): boolean {
  const styleName = paragraph.attrs.styleId ? styles.get(paragraph.attrs.styleId)?.name : undefined;
  if (tocStyleLevel(paragraph.attrs.styleId, styleName)) {
    return true;
  }
  return !!hint?.anchor;
}

function isTocEnd(paragraph: Paragraph, hint: TocHint | undefined): boolean {
  if (!hint?.fieldEnd || hint.anchor) {
    return false;
  }
  if (hasInstruction(hint.instruction, "TOC") || hasInstruction(hint.instruction, "PAGEREF")) {
    return false;
  }
  return paragraph.getFullText().trim() === "";
}

function hasInstruction(instruction: string, name: string): boolean {
  return instruction.split(/\s+/).some((token) => token.toUpperCase() === name);
}

function keepTitle(paragraph: Paragraph): void {
  const parts: string[] = [];
  for (const block of paragraph.blocks) {
    const tab = block.text.indexOf("\t");
    if (tab >= 0) {
      parts.push(block.text.slice(0, tab));
      break;
    }
    parts.push(block.text);
  }
  const title = parts.join("").replace(/\s+/g, " ").trim();
  const style = paragraph.blocks.find((block) => block.text && !block.text.includes("\t"))?.style ?? {};
  const block = new Block();
  block.text = title;
  block.style = style;
  paragraph.blocks = [block];
}
