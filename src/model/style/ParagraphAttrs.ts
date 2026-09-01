import type { TitleSerial } from "./Numbering";

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
  titleSerial?: TitleSerial;
}

export function mergeParagraphAttrs(
  base: ParagraphAttrs | undefined,
  override: ParagraphAttrs | undefined,
): ParagraphAttrs {
  return { ...base, ...override };
}
