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
  if (isLatinLetter(char, code)) {
    return "latin";
  }
  if (isAsciiDigit(char, code)) {
    return "number";
  }
  if (isCjk(code) || isFullwidthForm(code)) {
    return "cjk";
  }
  return "other";
}

/** 西文字母，含带音符的拉丁字母。全角英文字母不在这里。 */
export function isLatinLetter(char: string, code = char.codePointAt(0) ?? 0): boolean {
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
    return true;
  }
  if (code >= 0x00c0 && code <= 0x024f) {
    return true;
  }
  return code >= 0x1e00 && code <= 0x1eff;
}

export function isAsciiDigit(char: string, code = char.codePointAt(0) ?? 0): boolean {
  return code >= 48 && code <= 57;
}

function isFullwidthForm(code: number): boolean {
  return code >= 0xff01 && code <= 0xff60;
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

/** 汉字和全角字符。半角标点、西文字母不算东亚，宽度也不撑成整字。 */
export function isEastAsiaWord(wordChar: string, code: number): boolean {
  if (isCjk(code) || isFullwidthForm(code)) {
    return true;
  }
  return FULL_PUN.has(wordChar);
}

export function isLatinOrNumber(wordChar: string, code: number): boolean {
  const category = classifyChar(wordChar, code);
  return category === "latin" || category === "number";
}
