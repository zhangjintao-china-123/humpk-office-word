import type { NumberingLevel, TitleSerial } from "./Numbering";

const CHINESE = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const CHINESE_LEGAL = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const ZODIAC = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const CARDINALS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];
const ORDINALS = [
  "zeroth",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
];

const BULLETS: Record<number, string> = {
  0xf0b7: "•",
  0xf0a7: "▪",
  0xf076: "❖",
  0xf0d8: "➢",
  0xf0fc: "✓",
  0xf0a8: "▫",
  0xf06e: "■",
  0xf06c: "●",
  0xf0b2: "✦",
  0x00b7: "·",
  0x2022: "•",
  0x25cf: "●",
  0x25cb: "○",
  0x25a0: "■",
  0x25a1: "□",
  0x25c6: "◆",
  0x2013: "–",
  0x2014: "—",
};

export function formatLevelNumber(value: number, numFmt: string | undefined): string {
  const n = Math.trunc(value);
  const fmt = (numFmt ?? "decimal").toLowerCase();
  switch (fmt) {
    case "bullet":
    case "none":
      return "";
    case "decimalzero":
      return String(Math.max(0, n)).padStart(2, "0");
    case "upperroman":
      return roman(n).toUpperCase();
    case "lowerroman":
      return roman(n).toLowerCase();
    case "upperletter":
      return alpha(n, true);
    case "lowerletter":
      return alpha(n, false);
    case "ordinal":
      return ordinalSuffix(n);
    case "cardinaltext":
      return CARDINALS[n] ?? String(n);
    case "ordinaltext":
      return ORDINALS[n] ?? ordinalSuffix(n);
    case "chinesecounting":
    case "chinesecountingthousand":
    case "japanesecounting":
    case "taiwanesecounting":
    case "ideographtraditionalcounting":
      return chinese(n, CHINESE, ["", "十", "百", "千", "万"]);
    case "chineselegalsimplified":
    case "taiwanesedigital":
      return chinese(n, CHINESE_LEGAL, ["", "拾", "佰", "仟", "万"]);
    case "ideographdigital":
    case "japanesedigitaltenthousand":
    case "koreandigital":
      return ideographDigits(n, CHINESE);
    case "ideographtraditional":
      return cycle(n, STEMS);
    case "ideographzodiac":
      return cycle(n, ZODIAC);
    case "decimalenclosedcircle":
    case "decimalenclosedcirclechinese":
      return enclosed(n, 0x2460, 20) ?? `(${n})`;
    case "decimalenclosedparen":
      return enclosed(n, 0x2474, 20) ?? `(${n})`;
    case "decimalenclosedfullstop":
      return `${n}.`;
    case "hex":
      return n.toString(16).toUpperCase();
    default:
      return String(n);
  }
}

export function formatOutlineLabel(
  level: NumberingLevel,
  ilvl: number,
  serial: number,
  parents: number[],
  parentFmts: string[],
): string {
  if (level.numFmt === "none") {
    return "";
  }
  if (level.numFmt === "bullet") {
    return bulletSymbol(level.lvlText, level.font) + suffix(level.suff);
  }
  const text = level.lvlText || `%${ilvl + 1}`;
  const body = text.replace(/%([1-9])/g, (_, digit: string) => {
    const index = Number(digit) - 1;
    const value = index === ilvl ? serial : (parents[index] ?? 0);
    const fmt = level.legal
      ? index === ilvl && level.numFmt === "decimalZero"
        ? "decimalZero"
        : "decimal"
      : index === ilvl
        ? level.numFmt
        : (parentFmts[index] ?? "decimal");
    return formatLevelNumber(value, fmt);
  });
  return body + suffix(level.suff);
}

export function outlineLabelWidth(label: string, fontSize: number): number {
  let width = 0;
  for (const char of label) {
    const code = char.codePointAt(0) ?? 0;
    width += code > 255 ? fontSize : fontSize * 0.6;
  }
  return width;
}

function suffix(suff: string | undefined): string {
  if (suff === "nothing") {
    return "";
  }
  if (suff === "space") {
    return " ";
  }
  return " ";
}

export function normalizeBulletGlyph(text: string, font?: string): string {
  return bulletSymbol(text, font);
}

function bulletSymbol(text: string, font: string | undefined): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "•";
  }
  const mapped = [...trimmed]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      const known = BULLETS[code];
      if (known) {
        return known;
      }
      const wingding = (font ?? "").toLowerCase().includes("wingding") || (font ?? "").toLowerCase() === "symbol";
      if (wingding && code >= 0xf000 && code <= 0xf0ff) {
        return "•";
      }
      return char;
    })
    .join("");
  return mapped || "•";
}

function cycle(value: number, items: string[]): string {
  if (value <= 0) {
    return items[0] ?? "";
  }
  return items[(value - 1) % items.length] ?? "";
}

function enclosed(value: number, start: number, count: number): string | undefined {
  if (value < 1 || value > count) {
    return undefined;
  }
  return String.fromCodePoint(start + value - 1);
}

function alpha(value: number, upper: boolean): string {
  if (value <= 0) {
    return upper ? "A" : "a";
  }
  let rest = value;
  let text = "";
  const base = upper ? 65 : 97;
  while (rest > 0) {
    rest -= 1;
    text = String.fromCharCode(base + (rest % 26)) + text;
    rest = Math.floor(rest / 26);
  }
  return text;
}

function roman(value: number): string {
  if (value <= 0) {
    return "";
  }
  const pairs: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let rest = value;
  let text = "";
  for (const [amount, glyph] of pairs) {
    while (rest >= amount) {
      text += glyph;
      rest -= amount;
    }
  }
  return text;
}

function ordinalSuffix(value: number): string {
  const mod = value % 100;
  if (mod >= 11 && mod <= 13) {
    return `${value}th`;
  }
  const last = value % 10;
  if (last === 1) {
    return `${value}st`;
  }
  if (last === 2) {
    return `${value}nd`;
  }
  if (last === 3) {
    return `${value}rd`;
  }
  return `${value}th`;
}

function ideographDigits(value: number, digits: string[]): string {
  if (value <= 0) {
    return digits[0] ?? "";
  }
  return String(value)
    .split("")
    .map((digit) => digits[Number(digit)] ?? digit)
    .join("");
}

function chinese(value: number, digits: string[], units: string[]): string {
  if (value <= 0) {
    return digits[0] ?? "";
  }
  if (value < 10) {
    return digits[value] ?? String(value);
  }
  if (value < 20 && units[1]) {
    return `${units[1]}${value === 10 ? "" : digits[value % 10]}`;
  }
  if (value >= 10000) {
    const wan = Math.floor(value / 10000);
    const rest = value % 10000;
    const tail = rest === 0 ? "" : `${rest < 1000 ? digits[0] : ""}${chinese(rest, digits, units)}`;
    return `${chinese(wan, digits, units)}${units[4] ?? "万"}${tail}`;
  }
  let rest = value;
  let text = "";
  let zero = false;
  for (let power = 3; power >= 0; power -= 1) {
    const unit = 10 ** power;
    const digit = Math.floor(rest / unit);
    rest %= unit;
    if (digit === 0) {
      zero = text.length > 0;
      continue;
    }
    if (zero) {
      text += digits[0];
      zero = false;
    }
    text += `${digits[digit]}${power > 0 ? units[power] : ""}`;
  }
  return text;
}

export function labelOf(serial: TitleSerial): string {
  return serial.label;
}
