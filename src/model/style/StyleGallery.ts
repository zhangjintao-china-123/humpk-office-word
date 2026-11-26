import { ptToPx } from "../../shared/units";
import { headingLevelFromName } from "../toc/Toc";
import type { ParagraphAttrs } from "./ParagraphAttrs";
import type { RunStyle } from "./RunStyle";
import type { StyleDefinition, StyleSheet } from "./StyleSheet";

interface GalleryStyle {
  id: string;
  name: string;
  label: string;
  type: "paragraph" | "character";
  paragraphAttrs?: ParagraphAttrs;
  runStyle?: RunStyle;
}

const size = (pt: number): RunStyle => ({ fontSizePx: ptToPx(pt), fontSizeHalfPoint: pt * 2 });
const accent = "#1F4E79";
const subdued = "#626A73";
const quoteBorder = { val: "single", sz: "6", color: "1F4E79", space: "4" };

function heading(level: number, pt: number, color: string): GalleryStyle {
  return {
    id: `Heading${level}`, name: `heading ${level}`, label: `标题 ${level}`, type: "paragraph",
    paragraphAttrs: { outlineLevel: level, before: "240", after: "120", keepNext: "1", keepLines: "1" },
    runStyle: { ...size(pt), bold: true, color },
  };
}

function paragraph(id: string, name: string, label: string, paragraphAttrs: ParagraphAttrs, runStyle?: RunStyle): GalleryStyle {
  return { id, name, label, type: "paragraph", paragraphAttrs, runStyle };
}

function character(id: string, name: string, label: string, runStyle: RunStyle): GalleryStyle {
  return { id, name, label, type: "character", runStyle };
}

export const STYLE_GALLERY = {
  normal: paragraph("Normal", "Normal", "正文", {}, { ...size(12), bold: false, color: "#111111" }),
  noSpacing: paragraph("NoSpacing", "No Spacing", "无间隔", {
    before: "0", after: "0", beforeLines: "0", afterLines: "0",
    beforeAutospacing: "0", afterAutospacing: "0", line: "240", lineRule: "auto",
  }),
  heading1: heading(1, 18, accent),
  heading2: heading(2, 16, "#2E75B6"),
  title: paragraph("Title", "Title", "标题", { after: "120", keepNext: "1" }, { ...size(26), color: "#252A30" }),
  subtitle: paragraph("Subtitle", "Subtitle", "副标题", { after: "160", keepNext: "1" }, { ...size(15), color: subdued }),
  subtleEmphasis: character("SubtleEmphasis", "Subtle Emphasis", "不明显强调", { italic: true, color: subdued }),
  emphasis: character("Emphasis", "Emphasis", "强调", { italic: true }),
  intenseEmphasis: character("IntenseEmphasis", "Intense Emphasis", "明显强调", { italic: true, bold: true, color: accent }),
  strong: character("Strong", "Strong", "要点", { bold: true }),
  quote: paragraph("Quote", "Quote", "引用", { before: "160", after: "160", textAlign: "center" }, { italic: true, color: subdued }),
  intenseQuote: paragraph("IntenseQuote", "Intense Quote", "明显引用", {
    before: "240", after: "240", leftTwip: 540, rightTwip: 540, textAlign: "center",
    borderTop: quoteBorder, borderBottom: quoteBorder,
  }, { italic: true, color: accent }),
  subtleReference: character("SubtleReference", "Subtle Reference", "不明显参考", { smallCaps: true, color: subdued }),
  intenseReference: character("IntenseReference", "Intense Reference", "明显参考", { smallCaps: true, bold: true, color: accent }),
  bookTitle: character("BookTitle", "Book Title", "书籍标题", { bold: true, italic: true, smallCaps: true }),
  listParagraph: paragraph("ListParagraph", "List Paragraph", "列表段落", { leftTwip: 720, contextualSpacing: "1" }),
  tocHeading: paragraph("TOCHeading", "TOC Heading", "TOC 标题", { before: "240", after: "120", keepNext: "1" }, { ...size(18), bold: true, color: accent }),
  heading3: heading(3, 14, "#5B9BD5"),
};

export type GalleryStyleKey = keyof typeof STYLE_GALLERY;
export const GALLERY_STYLE_KEYS = Object.keys(STYLE_GALLERY) as GalleryStyleKey[];

export function isGalleryStyle(value: string): value is GalleryStyleKey {
  return Object.hasOwn(STYLE_GALLERY, value);
}

export function findGalleryStyle(sheet: StyleSheet, key: GalleryStyleKey): StyleDefinition | undefined {
  const preset = STYLE_GALLERY[key];
  const matchesType = (style: StyleDefinition): boolean => (style.type ?? "paragraph") === preset.type;
  const exact = sheet.get(preset.id);
  if (exact && matchesType(exact)) {
    return exact;
  }
  const named = sheet.list().find((style) => matchesType(style) && matchesPreset(preset, style.styleId, style.name));
  const defaultId = key === "normal" ? sheet.defaultParagraphStyleId : undefined;
  return named ?? (defaultId ? sheet.get(defaultId) : undefined);
}

export function ensureGalleryStyle(sheet: StyleSheet, key: GalleryStyleKey): StyleDefinition {
  const found = findGalleryStyle(sheet, key);
  if (found) {
    return found;
  }
  const { id, name, type, paragraphAttrs, runStyle } = STYLE_GALLERY[key];
  let styleId = id;
  for (let suffix = 1; sheet.get(styleId); suffix += 1) {
    styleId = `${id}${suffix}`;
  }
  const basedOn = type === "paragraph" && key !== "normal" ? findGalleryStyle(sheet, "normal")?.styleId : undefined;
  const definition = { styleId, name, type, basedOn, paragraphAttrs, runStyle };
  sheet.add(definition);
  return definition;
}

export function activeParagraphStyle(sheet: StyleSheet, attrs: ParagraphAttrs | undefined): GalleryStyleKey | undefined {
  const id = attrs?.styleId ?? attrs?.resolvedStyleId ?? sheet.defaultParagraphStyleId;
  return id ? matchingKey(sheet, id, "paragraph") ?? (id === sheet.defaultParagraphStyleId ? "normal" : undefined) : "normal";
}

export function activeCharacterStyle(sheet: StyleSheet, id: string | undefined): GalleryStyleKey | undefined {
  return id ? matchingKey(sheet, id, "character") : undefined;
}

function matchingKey(sheet: StyleSheet, id: string, type: GalleryStyle["type"]): GalleryStyleKey | undefined {
  const name = sheet.get(id)?.name;
  return GALLERY_STYLE_KEYS.find((key) => STYLE_GALLERY[key].type === type && matchesPreset(STYLE_GALLERY[key], id, name));
}

function matchesPreset(preset: GalleryStyle, id: string, name?: string): boolean {
  const level = preset.paragraphAttrs?.outlineLevel;
  return [id, name].some((candidate) => {
    if (!candidate) {
      return false;
    }
    const normalized = candidate.replace(/\s+/g, "").toLowerCase();
    return normalized === preset.id.toLowerCase() || normalized === preset.label.replace(/\s+/g, "").toLowerCase()
      || (level != null && headingLevelFromName(candidate) === level);
  });
}
