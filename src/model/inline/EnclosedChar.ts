export type EnclosedShape = "circle" | "square" | "triangle" | "diamond";
export type EnclosedSizeMode = "shrink" | "enlarge";

export interface EnclosedSpec {
  shape: EnclosedShape;
  mode: EnclosedSizeMode;
  symbol?: string;
}

export const ENCLOSED_SHAPES: Array<{ shape: EnclosedShape; symbol: string; label: string }> = [
  { shape: "circle", symbol: "○", label: "圆形" },
  { shape: "square", symbol: "□", label: "正方形" },
  { shape: "triangle", symbol: "△", label: "三角形" },
  { shape: "diamond", symbol: "◇", label: "菱形" },
];

export function enclosedShapeSymbol(shape: EnclosedShape): string {
  return ENCLOSED_SHAPES.find((item) => item.shape === shape)?.symbol ?? "○";
}

export function enclosedShapeFromSymbol(symbol: string | undefined): EnclosedShape | undefined {
  const ch = symbol?.trim();
  if (!ch) {
    return undefined;
  }
  if (ch === "○" || ch === "◯" || ch === "〇") {
    return "circle";
  }
  if (ch === "□" || ch === "▢" || ch === "口") {
    return "square";
  }
  if (ch === "△" || ch === "▲") {
    return "triangle";
  }
  if (ch === "◇" || ch === "◈" || ch === "◊") {
    return "diamond";
  }
  return undefined;
}

export interface ParsedEnclosedField {
  text: string;
  spec: EnclosedSpec;
}

/** 解析 Word 的 EQ \o\ac(○,字) / EQ \o(\s\do 1(○),字) 带圈字符域指令。 */
export function parseEnclosedInstruction(
  instr: string,
  symbolFontPt?: number,
  textFontPt?: number,
): ParsedEnclosedField | null {
  const trimmed = instr.trim();
  if (!/^eq\b/i.test(trimmed)) {
    return null;
  }
  const match = /\\o(?:\\ac)?\s*\(([\s\S]*)\)/i.exec(trimmed);
  if (!match) {
    return null;
  }
  const args = splitTopArgs(match[1]);
  if (args.length < 2) {
    return null;
  }
  const firstClean = unwrapEqShift(args[0]);
  const secondClean = unwrapEqShift(args[1]);
  let shape = enclosedShapeFromSymbol(firstClean.inner);
  let text = secondClean.inner;
  let shifted = firstClean.shifted;
  if (!shape) {
    shape = enclosedShapeFromSymbol(secondClean.inner);
    text = firstClean.inner;
    shifted = secondClean.shifted;
  }
  if (!shape || !text) {
    return null;
  }
  const mode: EnclosedSizeMode =
    shifted || (symbolFontPt != null && textFontPt != null && symbolFontPt >= textFontPt * 1.35 && textFontPt >= 9)
      ? "enlarge"
      : "shrink";
  return {
    text,
    spec: {
      shape,
      mode,
      symbol: enclosedShapeSymbol(shape),
    },
  };
}

function splitTopArgs(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") {
      depth += 1;
      current += ch;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if ((ch === "," || ch === ";") && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() || parts.length) {
    parts.push(current.trim());
  }
  return parts;
}

function unwrapEqShift(arg: string): { inner: string; shifted: boolean } {
  const trimmed = arg.trim();
  const shift = /^\\s(?:\\(?:up|do)\s*\d*)\s*\(([\s\S]*)\)$/i.exec(trimmed);
  if (shift) {
    return { inner: shift[1].trim(), shifted: true };
  }
  return { inner: trimmed, shifted: false };
}
