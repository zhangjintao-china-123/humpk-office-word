export type AsianLayoutKind = "tatechuyoko" | "combine" | "twoInOne" | "fitWidth";

export type AsianBrackets = "none" | "round" | "square" | "angle" | "curly";

export interface AsianLayoutSpec {
  kind: AsianLayoutKind;
  brackets?: AsianBrackets;
  /** 「调整宽度」目标宽度（像素）。 */
  fitWidthPx?: number;
  /** 「纵横混排」是否适应行宽压缩。 */
  compress?: boolean;
}

export const ASIAN_BRACKET_OPTIONS: Array<{ value: AsianBrackets; label: string; pair: [string, string] }> = [
  { value: "none", label: "无", pair: ["", ""] },
  { value: "round", label: "( )", pair: ["(", ")"] },
  { value: "square", label: "[ ]", pair: ["[", "]"] },
  { value: "angle", label: "< >", pair: ["<", ">"] },
  { value: "curly", label: "{ }", pair: ["{", "}"] },
];

export function asianBracketPair(brackets: AsianBrackets | undefined): [string, string] {
  return ASIAN_BRACKET_OPTIONS.find((item) => item.value === brackets)?.pair ?? ["", ""];
}

export function splitAsianTwoLines(text: string): [string, string] {
  const chars = Array.from(text);
  if (chars.length <= 1) {
    return [text, ""];
  }
  const split = Math.ceil(chars.length / 2);
  return [chars.slice(0, split).join(""), chars.slice(split).join("")];
}

export function asianLayoutLabel(kind: AsianLayoutKind): string {
  switch (kind) {
    case "tatechuyoko":
      return "纵横混排";
    case "combine":
      return "合并字符";
    case "twoInOne":
      return "双行合一";
    case "fitWidth":
      return "调整宽度";
  }
}
