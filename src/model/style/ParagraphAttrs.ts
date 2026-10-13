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

export interface ParagraphShading {
  val?: string;
  color?: string;
  fill?: string;
}

export interface ParagraphAttrs {
  firstLineChars?: number;
  firstLineTwip?: number;
  hangingChars?: number;
  hangingTwip?: number;
  leftChars?: number;
  leftTwip?: number;
  rightChars?: number;
  rightTwip?: number;
  textAlign?: string;
  /** top / center / baseline / bottom / auto。exact 行距默认按基线，不居中。 */
  textAlignment?: string;
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
  keepNext?: string;
  keepLines?: string;
  pageBreakBefore?: string;
  overflowPunct?: string;
  kinsoku?: string;
  autoSpaceDE?: string;
  autoSpaceDN?: string;
  /**
   * w:wordWrap。缺省按词换行。
   * val 为 off 时才允许西文在单词中间断开，和元素名字的直觉相反。
   */
  wordWrap?: string;
  styleId?: string;
  /** 没写 w:pStyle 时套用的默认段落样式，只参与“同样式”判断，不写回。 */
  resolvedStyleId?: string;
  numId?: string;
  ilvl?: string;
  /** 大纲级别 1–9。对应 w:outlineLvl 的 0–8。 */
  outlineLevel?: number;
  titleSerial?: TitleSerial;
  tabs?: TabStop[];
  borderTop?: ParagraphBorder;
  borderLeft?: ParagraphBorder;
  borderBottom?: ParagraphBorder;
  borderRight?: ParagraphBorder;
  borderBetween?: ParagraphBorder;
  shading?: ParagraphShading;
  endsSection?: boolean;
  sectionBreak?: SectionBreak;
}

export function flagOff(value: string | undefined): boolean {
  return value === "0" || value === "off" || value === "false";
}

export function flagOn(value: string | undefined): boolean {
  return value != null && value !== "" && !flagOff(value);
}

export function mergeParagraphAttrs(
  base: ParagraphAttrs | undefined,
  override: ParagraphAttrs | undefined,
): ParagraphAttrs {
  return { ...base, ...override };
}
