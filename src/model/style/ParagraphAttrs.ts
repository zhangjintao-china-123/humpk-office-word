import type { SectionBreak } from "../document/PageLabel";
import type { TitleSerial } from "./Numbering";

export interface TabStop {
  /** 距版心左边的像素。 */
  posPx: number;
  val: "left" | "center" | "right" | "decimal";
  leader?: string;
}

export interface ParagraphBorder {
  val?: string;
  sz?: string;
  color?: string;
  space?: string;
}

export interface ParagraphAttrs {
  firstLineChars?: number;
  leftChars?: number;
  rightChars?: number;
  firstLineTwip?: number;
  textAlign?: string;
  line?: string;
  lineRule?: string;
  beforeLines?: string;
  afterLines?: string;
  before?: string;
  after?: string;
  beforeAutospacing?: string;
  afterAutospacing?: string;
  contextualSpacing?: string;
  snapToGrid?: string;
  widowControl?: string;
  styleId?: string;
  numId?: string;
  ilvl?: string;
  /** 大纲级别 1–9。对应 w:outlineLvl 的 0–8。 */
  outlineLevel?: number;
  titleSerial?: TitleSerial;
  tabs?: TabStop[];
  borderBottom?: ParagraphBorder;
  endsSection?: boolean;
  sectionBreak?: SectionBreak;
}

export function mergeParagraphAttrs(
  base: ParagraphAttrs | undefined,
  override: ParagraphAttrs | undefined,
): ParagraphAttrs {
  return { ...base, ...override };
}
