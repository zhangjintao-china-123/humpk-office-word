import type { Document } from "../model/document/Document";
import type { Paragraph } from "../model/block/Paragraph";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { Numbering, NumberingLevel, TitleSerial } from "../model/style/Numbering";
import { formatOutlineLabel } from "../model/style/OutlineLabel";
import type { MutationPatch } from "./MutationPatch";

export interface NumberingSnap {
  paragraph: Paragraph;
  attrs: ParagraphAttrs;
}

/** 九级十进制大纲：1、1.1、1.1.1。 */
export function ensureOutline(numbering: Numbering): string {
  for (const numId of numIds(numbering)) {
    if (isOutline(numbering, numId)) {
      return numId;
    }
  }
  let max = 0;
  for (const numId of numIds(numbering)) {
    const value = Number(numId);
    if (Number.isFinite(value)) {
      max = Math.max(max, value);
    }
  }
  const numId = String(max + 1);
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    numbering.setLevel(numId, String(ilvl), outlineLevel(ilvl));
  }
  return numId;
}

export function definedDepth(numbering: Numbering, numId: string): number {
  let max = -1;
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    if (numbering.getLevel(numId, String(ilvl))) {
      max = ilvl;
    }
  }
  return max;
}

/** 按文档顺序重算编号。返回需要重排的正文段落，格内变化会带上所在表。 */
export function renumberStory(document: Document): Paragraph[] {
  const counters = new Map<string, number>();
  const changed = new Set<Paragraph>();
  walkStory(document, (paragraph) => {
    const next = numberedAttrs(document, paragraph, counters);
    if (next === paragraph.attrs) {
      return;
    }
    paragraph.attrs = next;
    paragraph.changed = true;
    changed.add(paragraph);
  });
  return layoutTargets(document, changed);
}

export function refreshNumbering(document: Document, patch: MutationPatch): void {
  if (!patch.createdParagraphs.length && !patch.removedParagraphs.length) {
    return;
  }
  const touched =
    usesNumbering(document) ||
    patch.createdParagraphs.some((item) => numbered(item.paragraph)) ||
    patch.removedParagraphs.some((item) => numbered(item.paragraph));
  if (!touched) {
    return;
  }
  const before = takeSnapshot(document);
  const dirty = renumberStory(document);
  const snaps: NumberingSnap[] = [];
  for (const [paragraph, attrs] of before) {
    if (fingerprint(attrs) !== fingerprint(paragraph.attrs)) {
      snaps.push({ paragraph, attrs });
    }
  }
  if (!snaps.length) {
    return;
  }
  patch.numberingBefore = snaps;
  for (const paragraph of dirty) {
    if (!patch.impact.dirty.includes(paragraph)) {
      patch.impact.dirty.push(paragraph);
    }
  }
}

export function restoreNumbering(snaps: NumberingSnap[] | undefined): Paragraph[] {
  if (!snaps?.length) {
    return [];
  }
  for (const snap of snaps) {
    snap.paragraph.attrs = cloneAttrs(snap.attrs);
    snap.paragraph.changed = true;
  }
  return snaps.map((snap) => snap.paragraph);
}

export function cloneAttrs(attrs: ParagraphAttrs): ParagraphAttrs {
  return {
    ...attrs,
    titleSerial: attrs.titleSerial ? { ...attrs.titleSerial } : undefined,
    tabs: attrs.tabs?.map((stop) => ({ ...stop })),
  };
}

export function clearNumbering(attrs: ParagraphAttrs, numbering: Numbering): ParagraphAttrs {
  const level =
    attrs.numId && attrs.numId !== "0" ? numbering.getLevel(attrs.numId, attrs.ilvl ?? "0") : undefined;
  const next = { ...attrs };
  delete next.numId;
  delete next.ilvl;
  delete next.titleSerial;
  if (level?.leftTwip != null && next.leftTwip === level.leftTwip) {
    delete next.leftTwip;
  }
  if (level?.hangingTwip != null && next.hangingTwip === level.hangingTwip) {
    delete next.hangingTwip;
  }
  return next;
}

export function withLevelIndent(attrs: ParagraphAttrs, level: NumberingLevel): ParagraphAttrs {
  const next = { ...attrs };
  if (level.leftTwip != null) {
    next.leftTwip = level.leftTwip;
  }
  if (level.hangingTwip != null) {
    next.hangingTwip = level.hangingTwip;
  }
  return next;
}

function outlineLevel(ilvl: number): NumberingLevel {
  return {
    start: 1,
    numFmt: "decimal",
    lvlText: Array.from({ length: ilvl + 1 }, (_, index) => `%${index + 1}`).join("."),
    lvlJc: "left",
    suff: "space",
    ilvl,
    leftTwip: 420 * (ilvl + 1),
    hangingTwip: 420,
  };
}

function isOutline(numbering: Numbering, numId: string): boolean {
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    const level = numbering.getLevel(numId, String(ilvl));
    const expect = Array.from({ length: ilvl + 1 }, (_, index) => `%${index + 1}`).join(".");
    if (!level || level.numFmt !== "decimal" || level.lvlText !== expect) {
      return false;
    }
  }
  return true;
}

function numIds(numbering: Numbering): string[] {
  return [...new Set(numbering.entries().map((entry) => entry.numId))];
}

function numberedAttrs(document: Document, paragraph: Paragraph, counters: Map<string, number>): ParagraphAttrs {
  const numId = paragraph.attrs.numId;
  if (!numId || numId === "0") {
    if (!paragraph.attrs.titleSerial) {
      return paragraph.attrs;
    }
    const next = { ...paragraph.attrs };
    delete next.titleSerial;
    return next;
  }
  const ilvl = Math.min(8, Math.max(0, Number(paragraph.attrs.ilvl ?? "0") || 0));
  const level = document.numbering.getLevel(numId, String(ilvl));
  if (!level) {
    return paragraph.attrs;
  }
  for (let deeper = ilvl + 1; deeper <= 8; deeper += 1) {
    counters.delete(`${numId}#${deeper}`);
  }
  const key = `${numId}#${ilvl}`;
  const serial = counters.has(key) ? (counters.get(key) ?? level.start) + 1 : level.start;
  counters.set(key, serial);
  const parents: number[] = [];
  const parentFmts: string[] = [];
  const titleSerial: TitleSerial = { ...level, ilvl, serial, label: "" };
  for (let index = 0; index < ilvl; index += 1) {
    const parent = document.numbering.getLevel(numId, String(index));
    const value = counters.get(`${numId}#${index}`) ?? parent?.start ?? 1;
    parents[index] = value;
    parentFmts[index] = parent?.numFmt ?? "decimal";
    titleSerial[`lvl_${index}`] = value;
  }
  titleSerial.label = formatOutlineLabel(level, ilvl, serial, parents, parentFmts);
  const current = paragraph.attrs.titleSerial;
  if (current?.label === titleSerial.label && current.serial === serial && paragraph.attrs.ilvl === String(ilvl)) {
    return paragraph.attrs;
  }
  return { ...paragraph.attrs, ilvl: String(ilvl), titleSerial };
}

export function forEachStoryParagraph(document: Document, visit: (paragraph: Paragraph) => void): void {
  walkStory(document, visit);
}

function walkStory(document: Document, visit: (paragraph: Paragraph) => void): void {
  document.paragraphs.each((node) => {
    const paragraph = node.data;
    if (paragraph.isTable && paragraph.table) {
      for (const row of paragraph.table.rows) {
        for (const cell of row.cells) {
          walkStory(cell.document, visit);
        }
      }
      return;
    }
    visit(paragraph);
  });
}

function layoutTargets(document: Document, changed: Set<Paragraph>): Paragraph[] {
  const dirty: Paragraph[] = [];
  document.paragraphs.each((node) => {
    const paragraph = node.data;
    if (changed.has(paragraph)) {
      dirty.push(paragraph);
    }
    if (paragraph.isTable && paragraph.table && tableHits(paragraph, changed)) {
      paragraph.changed = true;
      if (!dirty.includes(paragraph)) {
        dirty.push(paragraph);
      }
    }
  });
  return dirty;
}

function tableHits(paragraph: Paragraph, changed: Set<Paragraph>): boolean {
  for (const row of paragraph.table?.rows ?? []) {
    for (const cell of row.cells) {
      let hit = false;
      cell.document.paragraphs.each((node) => {
        if (changed.has(node.data)) {
          hit = true;
        }
      });
      if (hit || tableNested(cell.document, changed)) {
        return true;
      }
    }
  }
  return false;
}

function tableNested(document: Document, changed: Set<Paragraph>): boolean {
  let hit = false;
  document.paragraphs.each((node) => {
    if (node.data.isTable && tableHits(node.data, changed)) {
      hit = true;
    }
  });
  return hit;
}

function usesNumbering(document: Document): boolean {
  let found = false;
  walkStory(document, (paragraph) => {
    if (numbered(paragraph)) {
      found = true;
    }
  });
  return found;
}

function numbered(paragraph: Paragraph): boolean {
  return !!paragraph.attrs.numId && paragraph.attrs.numId !== "0";
}

function takeSnapshot(document: Document): Map<Paragraph, ParagraphAttrs> {
  const snaps = new Map<Paragraph, ParagraphAttrs>();
  walkStory(document, (paragraph) => {
    snaps.set(paragraph, cloneAttrs(paragraph.attrs));
  });
  return snaps;
}

function fingerprint(attrs: ParagraphAttrs): string {
  return JSON.stringify({
    numId: attrs.numId ?? "",
    ilvl: attrs.ilvl ?? "",
    label: attrs.titleSerial?.label ?? "",
    serial: attrs.titleSerial?.serial ?? 0,
    leftTwip: attrs.leftTwip ?? null,
    hangingTwip: attrs.hangingTwip ?? null,
  });
}
