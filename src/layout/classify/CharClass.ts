export type CharCategory =
  | "cjk"
  | "latin"
  | "number"
  | "space"
  | "openPun"
  | "closePun"
  | "fullPun"
  | "other";

const FULL_PUN = new Set(["，", "。", "、", "；"]);
const CLOSE_PUN = new Set([
  "，",
  "。",
  "、",
  "；",
  ",",
  ".",
  "!",
  "?",
  ";",
  ":",
  ")",
  "]",
  "}",
  "）",
  "】",
  "」",
  "』",
  "》",
  "、",
  "”",
  "’",
  "'",
  '"',
]);
const OPEN_PUN = new Set(["（", "【", "「", "『", "《", "(", "[", "{", "“", "‘", "'", '"']);

export function classifyChar(char: string, code = char.codePointAt(0) ?? 0): CharCategory {
  if (char === "\n" || char === "\r") {
    return "other";
  }
  if (/\s/u.test(char)) {
    return "space";
  }
  if (FULL_PUN.has(char)) {
    return "fullPun";
  }
  if (CLOSE_PUN.has(char)) {
    return "closePun";
  }
  if (OPEN_PUN.has(char)) {
    return "openPun";
  }
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
    return "latin";
  }
  if (code >= 48 && code <= 57) {
    return "number";
  }
  if (isCjk(code)) {
    return "cjk";
  }
  return "other";
}

export function isCjk(code: number): boolean {
  return (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  );
}

export function isFullPunChar(char: string): boolean {
  return FULL_PUN.has(char);
}

export function isClosePunChar(char: string): boolean {
  return FULL_PUN.has(char) || CLOSE_PUN.has(char);
}

export function isOpenPunChar(char: string): boolean {
  return OPEN_PUN.has(char);
}

export function isEastAsiaWord(wordChar: string, code: number): boolean {
  const category = classifyChar(wordChar, code);
  return category === "cjk" || category === "fullPun" || category === "openPun" || category === "closePun";
}

export function isLatinOrNumber(wordChar: string, code: number): boolean {
  const category = classifyChar(wordChar, code);
  return category === "latin" || category === "number";
}
