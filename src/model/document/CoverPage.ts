import type { Paragraph } from "../block/Paragraph";
import type { Document } from "./Document";

export interface CoverLineStyle {
  size: number;
  color?: string;
  fill?: string;
  align?: "center" | "right";
  bold?: boolean;
  before?: number;
  after?: number;
  inset?: number;
  rule?: { side: "top" | "bottom" | "left"; color: string; weight: number };
}

interface CoverTemplate {
  name: string;
  label: string;
  serif?: boolean;
  lines: [CoverLineStyle, CoverLineStyle, CoverLineStyle, CoverLineStyle, CoverLineStyle];
}

export const COVER_TEMPLATES = {
  clarity: {
    name: "清简", label: "文档",
    lines: [
      { size: 12, color: "#52667C", bold: true, rule: { side: "bottom", color: "#B3C3D5", weight: 1 } },
      { size: 36, color: "#243954", bold: true, before: 115 },
      { size: 16, color: "#52667C", before: 9 },
      { size: 12, bold: true, before: 255 },
      { size: 11, color: "#52667C", before: 8 },
    ],
  },
  grove: {
    name: "青墨", label: "项目文档",
    lines: [
      { size: 12, color: "#245B4B", bold: true, align: "right" },
      { size: 35, color: "#153D31", bold: true, inset: 18, before: 86, fill: "#DDEDE4", rule: { side: "left", color: "#49836D", weight: 4 } },
      { size: 15, color: "#245B4B", inset: 18, before: 16 },
      { size: 12, bold: true, inset: 18, before: 230 },
      { size: 11, color: "#527568", inset: 18, before: 7 },
    ],
  },
  folio: {
    name: "书页", label: "文稿", serif: true,
    lines: [
      { size: 12, color: "#866348", align: "center", rule: { side: "top", color: "#C5A483", weight: 1 } },
      { size: 36, color: "#3B2D29", align: "center", before: 140 },
      { size: 15, color: "#7A5841", align: "center", before: 13, rule: { side: "bottom", color: "#C5A483", weight: 1 } },
      { size: 12, align: "center", before: 173 },
      { size: 11, color: "#866348", align: "center", before: 8 },
    ],
  },
  tide: {
    name: "潮汐", label: "工作报告",
    lines: [
      { size: 12, color: "#215874", bold: true, rule: { side: "top", color: "#397594", weight: 3 } },
      { size: 34, color: "#FFFFFF", fill: "#235573", bold: true, align: "center", before: 94 },
      { size: 15, color: "#215874", fill: "#DBEBF3", align: "center", after: 10 },
      { size: 12, bold: true, align: "right", before: 235 },
      { size: 11, color: "#215874", align: "right", before: 8 },
    ],
  },
  ember: {
    name: "暖调", label: "方案",
    lines: [
      { size: 12, color: "#804427", bold: true, align: "right", rule: { side: "bottom", color: "#D09168", weight: 2 } },
      { size: 35, color: "#432E28", bold: true, align: "right", before: 106 },
      { size: 15, color: "#804427", align: "right", before: 12 },
      { size: 12, color: "#6E3822", fill: "#F4E1D3", bold: true, align: "center", before: 248 },
      { size: 11, color: "#804427", align: "center", before: 8 },
    ],
  },
  graphite: {
    name: "石墨", label: "简报",
    lines: [
      { size: 12, color: "#FFFFFF", fill: "#333E4C", bold: true, align: "center" },
      { size: 34, color: "#262D38", bold: true, inset: 24, before: 77 },
      { size: 16, color: "#5F6D7F", inset: 24, before: 8, rule: { side: "left", color: "#8798A8", weight: 2 } },
      { size: 12, bold: true, inset: 24, before: 261 },
      { size: 11, color: "#5F6D7F", inset: 24, before: 8 },
    ],
  },
} satisfies Record<string, CoverTemplate>;

export type CoverTemplateId = keyof typeof COVER_TEMPLATES;
export const COVER_TEMPLATE_IDS = Object.keys(COVER_TEMPLATES) as CoverTemplateId[];
export const COVER_TITLE_INDEX = 1;
export const COVER_PLACEHOLDERS = ["文档标题", "文档副标题", "作者姓名", "日期"] as const;

export function isCoverTemplate(value: string): value is CoverTemplateId {
  return Object.hasOwn(COVER_TEMPLATES, value);
}

export function coverTemplate(id: CoverTemplateId): CoverTemplate {
  return COVER_TEMPLATES[id];
}

export function leadingCover(document: Document): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (let node = document.paragraphs.head; node?.data.coverTemplate; node = node.next) {
    paragraphs.push(node.data);
  }
  return paragraphs;
}
