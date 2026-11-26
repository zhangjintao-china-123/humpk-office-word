import type { Document } from "../model/document/Document";
import type { Paragraph } from "../model/block/Paragraph";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { Numbering, NumberingLevel, TitleSerial } from "../model/style/Numbering";
import { formatOutlineLabel, normalizeBulletGlyph } from "../model/style/OutlineLabel";
import type { MutationPatch } from "./MutationPatch";

export interface NumberingSnap {
  paragraph: Paragraph;
  attrs: ParagraphAttrs;
}

export interface NumberingPreset {
  numFmt: string;
  lvlText: string;
  start: number;
}

export interface MultilevelLevelSpec {
  numFmt: string;
  lvlText: string;
  start: number;
  legal?: boolean;
  suff?: string;
  headingLevel?: number;
}

export interface MultilevelPreset {
  id: string;
  linkHeading?: boolean;
  levels: MultilevelLevelSpec[];
}

export interface MultilevelPreviewRow {
  ilvl: number;
  label: string;
  heading?: string;
}

export const DEFAULT_BULLET = "●";
export const PRESET_BULLETS = ["●", "○", "■", "◆", "❖", "✓", "➢", "✦"] as const;
const BULLET_CYCLE = ["●", "○", "■"] as const;

export const DEFAULT_NUMBERING: NumberingPreset = {
  numFmt: "decimal",
  lvlText: "%1.",
  start: 1,
};

export const PRESET_NUMBERINGS: readonly NumberingPreset[] = [
  { numFmt: "decimal", lvlText: "%1.", start: 1 },
  { numFmt: "decimal", lvlText: "%1)", start: 1 },
  { numFmt: "chineseCounting", lvlText: "%1、", start: 1 },
  { numFmt: "upperLetter", lvlText: "%1.", start: 1 },
  { numFmt: "chineseCounting", lvlText: "(%1)", start: 1 },
  { numFmt: "lowerLetter", lvlText: "%1)", start: 1 },
  { numFmt: "lowerRoman", lvlText: "%1.", start: 1 },
];

const NUMBERING_CYCLE: readonly { numFmt: string; pattern: string }[] = [
  { numFmt: "decimal", pattern: "." },
  { numFmt: "lowerLetter", pattern: ")" },
  { numFmt: "lowerRoman", pattern: "." },
];

const ROMAN_ALPHA_DECIMAL: readonly { numFmt: string; suffix: string }[] = [
  { numFmt: "upperRoman", suffix: "." },
  { numFmt: "upperLetter", suffix: "." },
  { numFmt: "decimal", suffix: "." },
  { numFmt: "lowerLetter", suffix: ")" },
  { numFmt: "lowerRoman", suffix: "." },
  { numFmt: "decimal", suffix: ")" },
  { numFmt: "lowerLetter", suffix: "." },
  { numFmt: "lowerRoman", suffix: ")" },
  { numFmt: "decimal", suffix: "." },
];

export const PRESET_MULTILEVELS: readonly MultilevelPreset[] = [
  {
    id: "decimal-bare",
    levels: Array.from({ length: 9 }, (_, ilvl) => ({
      numFmt: "decimal",
      lvlText: Array.from({ length: ilvl + 1 }, (__, i) => `%${i + 1}`).join("."),
      start: 1,
    })),
  },
  {
    id: "decimal-dot",
    levels: Array.from({ length: 9 }, (_, ilvl) => ({
      numFmt: "decimal",
      lvlText: `${Array.from({ length: ilvl + 1 }, (__, i) => `%${i + 1}`).join(".")}.`,
      start: 1,
    })),
  },
  {
    id: "roman-alpha-decimal",
    levels: ROMAN_ALPHA_DECIMAL.map((item, ilvl) => ({
      numFmt: item.numFmt,
      lvlText: `%${ilvl + 1}${item.suffix}`,
      start: 1,
    })),
  },
  {
    id: "article-heading",
    linkHeading: true,
    levels: [
      { numFmt: "upperRoman", lvlText: "第 %1 条", start: 1, headingLevel: 1 },
      { numFmt: "decimalZero", lvlText: "节 %1.%2", start: 1, legal: true, headingLevel: 2 },
      { numFmt: "lowerLetter", lvlText: "(%3)", start: 1, headingLevel: 3 },
      ...Array.from({ length: 6 }, (_, idx) => ({
        numFmt: idx % 2 === 0 ? "lowerRoman" : "decimal",
        lvlText: `(%${idx + 4})`,
        start: 1,
        headingLevel: idx + 4,
      })),
    ],
  },
  {
    id: "decimal-heading",
    linkHeading: true,
    levels: Array.from({ length: 9 }, (_, ilvl) => ({
      numFmt: "decimal",
      lvlText: Array.from({ length: ilvl + 1 }, (__, i) => `%${i + 1}`).join("."),
      start: 1,
      headingLevel: ilvl + 1,
    })),
  },
  {
    id: "roman-heading",
    linkHeading: true,
    levels: ROMAN_ALPHA_DECIMAL.map((item, ilvl) => ({
      numFmt: item.numFmt,
      lvlText: `%${ilvl + 1}${item.suffix}`,
      start: 1,
      headingLevel: ilvl + 1,
    })),
  },
  {
    id: "chapter-heading",
    linkHeading: true,
    levels: [
      { numFmt: "chineseCounting", lvlText: "第%1章", start: 1, headingLevel: 1 },
      ...Array.from({ length: 8 }, (_, idx) => ({
        numFmt: "none",
        lvlText: "",
        start: 1,
        headingLevel: idx + 2,
      })),
    ],
  },
];

/** 九级十进制大纲：1、1.1、1.1.1。 */
export function ensureOutline(numbering: Numbering): string {
  for (const numId of numIds(numbering)) {
    if (isOutline(numbering, numId)) {
      return numId;
    }
  }
  const numId = nextNumId(numbering);
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    numbering.setLevel(numId, String(ilvl), outlineLevel(ilvl));
  }
  return numId;
}

/** 九级项目符号列表：第 targetIlvl 级使用指定符号，其余各级按预设循环。 */
export function ensureBullet(numbering: Numbering, symbol = DEFAULT_BULLET, targetIlvl = 0): string {
  const levelIndex = Math.min(8, Math.max(0, targetIlvl));
  const glyph = normalizeBulletGlyph(symbol) || DEFAULT_BULLET;
  for (const numId of numIds(numbering)) {
    const level = numbering.getLevel(numId, String(levelIndex));
    if (
      level?.numFmt === "bullet" &&
      normalizeBulletGlyph(level.lvlText, level.font) === glyph &&
      isBulletNumId(numbering, numId)
    ) {
      ensureBulletLevels(numbering, numId, glyph, levelIndex);
      return numId;
    }
  }
  const numId = nextNumId(numbering);
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    const lvlGlyph = ilvl === levelIndex ? glyph : bulletCycleGlyph(ilvl, glyph, levelIndex);
    numbering.setLevel(numId, String(ilvl), bulletLevel(ilvl, lvlGlyph));
  }
  return numId;
}

export function ensureBulletLevels(
  numbering: Numbering,
  numId: string,
  baseGlyph = DEFAULT_BULLET,
  baseLevel = 0,
): void {
  if (!isBulletNumId(numbering, numId)) {
    return;
  }
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    if (!numbering.getLevel(numId, String(ilvl))) {
      numbering.setLevel(numId, String(ilvl), bulletLevel(ilvl, bulletCycleGlyph(ilvl, baseGlyph, baseLevel)));
    }
  }
}

export function isBulletParagraph(
  numbering: Numbering,
  paragraph: { isTable?: boolean; attrs: ParagraphAttrs } | null | undefined,
): boolean {
  if (!paragraph || paragraph.isTable || !paragraph.attrs.numId || paragraph.attrs.numId === "0") {
    return false;
  }
  const ilvl = String(Math.min(8, Math.max(0, Number(paragraph.attrs.ilvl ?? "0") || 0)));
  const level = numbering.getLevel(paragraph.attrs.numId, ilvl);
  if (level) {
    return level.numFmt === "bullet";
  }
  return paragraph.attrs.titleSerial?.numFmt === "bullet";
}

export function bulletGlyphOf(
  numbering: Numbering,
  paragraph: { isTable?: boolean; attrs: ParagraphAttrs } | null | undefined,
): string | undefined {
  if (!isBulletParagraph(numbering, paragraph) || !paragraph) {
    return undefined;
  }
  const numId = paragraph.attrs.numId ?? "";
  const ilvl = String(Math.min(8, Math.max(0, Number(paragraph.attrs.ilvl ?? "0") || 0)));
  const level = numbering.getLevel(numId, ilvl) ?? paragraph.attrs.titleSerial;
  if (!level) {
    return undefined;
  }
  return normalizeBulletGlyph(level.lvlText, level.font) || DEFAULT_BULLET;
}

export function documentBullets(numbering: Numbering, document?: Document): string[] {
  const result: string[] = [];
  const push = (glyph: string | undefined): void => {
    if (glyph && !result.includes(glyph)) {
      result.push(glyph);
    }
  };
  if (document) {
    walkStory(document, (paragraph) => {
      push(bulletGlyphOf(document.numbering, paragraph));
    });
  }
  for (const entry of numbering.entries()) {
    if (entry.level.numFmt === "bullet" && entry.ilvl === "0") {
      push(normalizeBulletGlyph(entry.level.lvlText, entry.level.font));
    }
  }
  return result;
}

/** 九级编号列表：第 targetIlvl 级使用指定编号格式，其余各级按预设循环。 */
export function ensureNumbering(
  numbering: Numbering,
  preset: Partial<NumberingPreset> = {},
  targetIlvl = 0,
): string {
  const levelIndex = Math.min(8, Math.max(0, targetIlvl));
  const numFmt = preset.numFmt || DEFAULT_NUMBERING.numFmt;
  const rawPattern = preset.lvlText || DEFAULT_NUMBERING.lvlText;
  const start = Math.max(1, Math.trunc(preset.start ?? DEFAULT_NUMBERING.start));
  const targetText = bindLevelToken(rawPattern, levelIndex);
  for (const numId of numIds(numbering)) {
    if (isOutline(numbering, numId) || isBulletNumId(numbering, numId) || isCascadingOutline(numbering, numId)) {
      continue;
    }
    const level = numbering.getLevel(numId, String(levelIndex));
    if (
      level &&
      level.numFmt === numFmt &&
      level.lvlText === targetText &&
      level.start === start
    ) {
      ensureNumberingLevels(numbering, numId);
      return numId;
    }
  }
  const numId = nextNumId(numbering);
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    if (ilvl === levelIndex) {
      numbering.setLevel(numId, String(ilvl), numberingLevel(ilvl, numFmt, targetText, start));
    } else {
      const fallback = NUMBERING_CYCLE[ilvl % NUMBERING_CYCLE.length];
      numbering.setLevel(
        numId,
        String(ilvl),
        numberingLevel(ilvl, fallback.numFmt, `%${ilvl + 1}${fallback.pattern}`, 1),
      );
    }
  }
  return numId;
}

export function ensureNumberingLevels(numbering: Numbering, numId: string): void {
  if (isBulletNumId(numbering, numId) || isOutline(numbering, numId)) {
    return;
  }
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    if (!numbering.getLevel(numId, String(ilvl))) {
      const fallback = NUMBERING_CYCLE[ilvl % NUMBERING_CYCLE.length];
      numbering.setLevel(
        numId,
        String(ilvl),
        numberingLevel(ilvl, fallback.numFmt, `%${ilvl + 1}${fallback.pattern}`, 1),
      );
    }
  }
}

export function isNumberedListParagraph(
  numbering: Numbering,
  paragraph: { isTable?: boolean; attrs: ParagraphAttrs } | null | undefined,
): boolean {
  if (!paragraph || paragraph.isTable || !paragraph.attrs.numId || paragraph.attrs.numId === "0") {
    return false;
  }
  if (
    isBulletParagraph(numbering, paragraph) ||
    isOutline(numbering, paragraph.attrs.numId) ||
    activeMultilevelPresetId(numbering, paragraph) != null
  ) {
    return false;
  }
  return !!numbering.getLevel(paragraph.attrs.numId, paragraph.attrs.ilvl ?? "0") || !!paragraph.attrs.titleSerial;
}

export function numberingPresetOf(
  numbering: Numbering,
  paragraph: { isTable?: boolean; attrs: ParagraphAttrs } | null | undefined,
): NumberingPreset | undefined {
  if (!isNumberedListParagraph(numbering, paragraph) || !paragraph) {
    return undefined;
  }
  const numId = paragraph.attrs.numId ?? "";
  const ilvl = String(Math.min(8, Math.max(0, Number(paragraph.attrs.ilvl ?? "0") || 0)));
  const level = numbering.getLevel(numId, ilvl) ?? paragraph.attrs.titleSerial;
  if (!level) {
    return undefined;
  }
  return normalizeNumberingPreset(level);
}

export function documentNumberings(numbering: Numbering, document?: Document): NumberingPreset[] {
  const result: NumberingPreset[] = [];
  const seen = new Set<string>();
  const push = (preset: NumberingPreset | undefined): void => {
    if (!preset) {
      return;
    }
    const key = numberingPresetKey(preset);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(preset);
  };
  if (document) {
    walkStory(document, (paragraph) => {
      push(numberingPresetOf(document.numbering, paragraph));
    });
  }
  for (const entry of numbering.entries()) {
    if (
      entry.ilvl === "0" &&
      entry.level.numFmt !== "bullet" &&
      entry.level.numFmt !== "none" &&
      !isOutline(numbering, entry.numId)
    ) {
      push(normalizeNumberingPreset(entry.level));
    }
  }
  return result;
}

export function normalizeNumberingPreset(preset: { numFmt?: string; lvlText?: string; start?: number }): NumberingPreset {
  const numFmt = preset.numFmt || DEFAULT_NUMBERING.numFmt;
  const lvlText = bindLevelToken(preset.lvlText || "%1.", 0);
  const start = Math.max(1, Math.trunc(preset.start ?? 1));
  return { numFmt, lvlText, start };
}

export function numberingPresetKey(preset: { numFmt?: string; lvlText?: string; start?: number }): string {
  const norm = normalizeNumberingPreset(preset);
  return `${norm.numFmt}|${norm.lvlText}|${norm.start}`;
}

export function numberingSamples(preset: { numFmt?: string; lvlText?: string; start?: number }): string[] {
  const norm = normalizeNumberingPreset(preset);
  const level: NumberingLevel = {
    start: norm.start,
    numFmt: norm.numFmt,
    lvlText: norm.lvlText,
    suff: "nothing",
    ilvl: 0,
  };
  return [0, 1, 2].map((offset) => formatOutlineLabel(level, 0, norm.start + offset, [], []));
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

function numberingLevel(ilvl: number, numFmt: string, lvlText: string, start = 1): NumberingLevel {
  return {
    start,
    numFmt,
    lvlText,
    lvlJc: "left",
    suff: "space",
    ilvl,
    leftTwip: 420 * (ilvl + 1),
    hangingTwip: 420,
  };
}

function bindLevelToken(lvlText: string, targetIlvl: number): string {
  const token = `%${targetIlvl + 1}`;
  if (/%[1-9]/.test(lvlText)) {
    return lvlText.replace(/%[1-9]/g, token);
  }
  return `${token}${lvlText}`;
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

export function ensureMultilevel(numbering: Numbering, levels: readonly MultilevelLevelSpec[]): string {
  const normalized = normalizeMultilevelSpecs(levels);
  for (const numId of numIds(numbering)) {
    if (multilevelMatches(numbering, numId, normalized)) {
      return numId;
    }
  }
  const numId = nextNumId(numbering);
  normalized.forEach((spec, ilvl) => {
    numbering.setLevel(numId, String(ilvl), {
      start: spec.start,
      numFmt: spec.numFmt,
      lvlText: spec.lvlText,
      legal: spec.legal,
      lvlJc: "left",
      suff: spec.suff ?? (spec.numFmt === "none" ? "nothing" : "space"),
      ilvl,
      leftTwip: spec.numFmt === "none" ? 0 : 420 * (ilvl + 1),
      hangingTwip: spec.numFmt === "none" ? 0 : 420,
    });
  });
  return numId;
}

export function multilevelPresetById(id: string | undefined): MultilevelPreset | undefined {
  return id ? PRESET_MULTILEVELS.find((item) => item.id === id) : undefined;
}

export function multilevelSamples(
  levels: readonly MultilevelLevelSpec[],
  linkHeading = false,
): MultilevelPreviewRow[] {
  const normalized = normalizeMultilevelSpecs(levels);
  const parents = normalized.map((item) => item.start);
  const parentFmts = normalized.map((item) => item.numFmt);
  return [0, 1, 2].map((ilvl) => {
    const spec = normalized[ilvl];
    const level: NumberingLevel = {
      start: spec.start,
      numFmt: spec.numFmt,
      lvlText: spec.lvlText,
      legal: spec.legal,
      suff: "nothing",
      ilvl,
    };
    return {
      ilvl,
      label: formatOutlineLabel(level, ilvl, spec.start, parents, parentFmts),
      heading: linkHeading || spec.headingLevel ? `标题 ${spec.headingLevel ?? ilvl + 1}` : undefined,
    };
  });
}

export function currentListPreview(
  numbering: Numbering,
  paragraph: { isTable?: boolean; attrs: ParagraphAttrs } | null | undefined,
): MultilevelPreviewRow[] | undefined {
  if (!paragraph || paragraph.isTable || !paragraph.attrs.numId || paragraph.attrs.numId === "0") {
    return undefined;
  }
  const numId = paragraph.attrs.numId;
  const lvl0 = numbering.getLevel(numId, "0") ?? paragraph.attrs.titleSerial;
  if (!lvl0) {
    return undefined;
  }
  const levels: NumberingLevel[] = [0, 1, 2].map((ilvl) => {
    const found = numbering.getLevel(numId, String(ilvl));
    if (found) {
      return found;
    }
    if (lvl0.numFmt === "bullet") {
      return bulletLevel(ilvl, BULLET_CYCLE[ilvl % BULLET_CYCLE.length]);
    }
    const fallback = NUMBERING_CYCLE[ilvl % NUMBERING_CYCLE.length];
    return numberingLevel(ilvl, fallback.numFmt, `%${ilvl + 1}${fallback.pattern}`, 1);
  });
  const parents = levels.map((item) => item.start);
  const parentFmts = levels.map((item) => item.numFmt);
  return levels.map((level, ilvl) => ({
    ilvl,
    label: formatOutlineLabel({ ...level, suff: "nothing" }, ilvl, level.start, parents, parentFmts),
  }));
}

export function activeMultilevelPresetId(
  numbering: Numbering,
  paragraph: { isTable?: boolean; attrs: ParagraphAttrs } | null | undefined,
): string | undefined {
  if (!paragraph || paragraph.isTable || !paragraph.attrs.numId || paragraph.attrs.numId === "0") {
    return undefined;
  }
  const numId = paragraph.attrs.numId;
  for (const preset of PRESET_MULTILEVELS) {
    if (multilevelMatches(numbering, numId, normalizeMultilevelSpecs(preset.levels))) {
      return preset.id;
    }
  }
  return undefined;
}

export function isMultilevelParagraph(
  numbering: Numbering,
  paragraph: { isTable?: boolean; attrs: ParagraphAttrs } | null | undefined,
): boolean {
  return activeMultilevelPresetId(numbering, paragraph) != null;
}

function normalizeMultilevelSpecs(levels: readonly MultilevelLevelSpec[]): MultilevelLevelSpec[] {
  return Array.from({ length: 9 }, (_, ilvl) => {
    const src = levels[ilvl] ?? levels.at(-1) ?? { numFmt: "decimal", lvlText: `%${ilvl + 1}.`, start: 1 };
    const start = Math.max(1, Math.trunc(src.start || 1));
    const numFmt = src.numFmt || "decimal";
    const lvlText = numFmt === "none" ? "" : src.lvlText ?? `%${ilvl + 1}.`;
    return {
      numFmt,
      lvlText,
      start,
      legal: !!src.legal,
      suff: src.suff,
      headingLevel: src.headingLevel,
    };
  });
}

function multilevelMatches(numbering: Numbering, numId: string, levels: MultilevelLevelSpec[]): boolean {
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    const existing = numbering.getLevel(numId, String(ilvl));
    const expected = levels[ilvl];
    if (
      !existing ||
      existing.numFmt !== expected.numFmt ||
      existing.lvlText !== expected.lvlText ||
      existing.start !== expected.start ||
      Boolean(existing.legal) !== Boolean(expected.legal)
    ) {
      return false;
    }
  }
  return true;
}

function isCascadingOutline(numbering: Numbering, numId: string): boolean {
  const lvl1 = numbering.getLevel(numId, "1");
  return !!lvl1 && /%1/.test(lvl1.lvlText);
}

export function isOutlineNumId(numbering: Numbering, numId: string): boolean {
  return isOutline(numbering, numId);
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

function nextNumId(numbering: Numbering): string {
  let max = 0;
  for (const numId of numIds(numbering)) {
    const value = Number(numId);
    if (Number.isFinite(value)) {
      max = Math.max(max, value);
    }
  }
  return String(max + 1);
}

function bulletLevel(ilvl: number, glyph: string): NumberingLevel {
  return {
    start: 1,
    numFmt: "bullet",
    lvlText: glyph,
    lvlJc: "left",
    suff: "space",
    ilvl,
    leftTwip: 420 * (ilvl + 1),
    hangingTwip: 420,
  };
}

function bulletCycleGlyph(ilvl: number, baseGlyph: string, baseLevel: number): string {
  const baseIndex = BULLET_CYCLE.indexOf(baseGlyph as (typeof BULLET_CYCLE)[number]);
  if (baseIndex >= 0) {
    const offset = ((ilvl - baseLevel) % BULLET_CYCLE.length + BULLET_CYCLE.length) % BULLET_CYCLE.length;
    return BULLET_CYCLE[(baseIndex + offset) % BULLET_CYCLE.length];
  }
  return BULLET_CYCLE[ilvl % BULLET_CYCLE.length];
}

function isBulletNumId(numbering: Numbering, numId: string): boolean {
  let hasBullet = false;
  for (let ilvl = 0; ilvl <= 8; ilvl += 1) {
    const level = numbering.getLevel(numId, String(ilvl));
    if (!level) {
      continue;
    }
    if (level.numFmt !== "bullet") {
      return false;
    }
    hasBullet = true;
  }
  return hasBullet;
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
