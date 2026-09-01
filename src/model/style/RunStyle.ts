export interface RunStyle {
  fontFamily?: string;
  fontSizePx?: number;
  fontSizeHalfPoint?: number;
  color?: string;
  backgroundColor?: string;
  highlight?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: string;
  strike?: "single" | "double";
  wHint?: string;
  wAscii?: string;
  wEastAsia?: string;
  wCs?: string;
  wHAnsi?: string;
}

export function defaultFontFamily(kind: "ascii" | "hAnsi" | "eastAsia" | "cs"): string {
  if (kind === "eastAsia") {
    return "宋体";
  }
  return "Times New Roman";
}

export function resolveFontFamily(style: RunStyle, charCode: number): string {
  if (style.wHint) {
    const hinted =
      style.wHint === "eastAsia"
        ? style.wEastAsia
        : style.wHint === "cs"
          ? style.wCs
          : style.wAscii;
    if (hinted) {
      return hinted;
    }
  }
  if (style.fontFamily) {
    return style.fontFamily;
  }
  if (charCode <= 127) {
    return style.wAscii ?? defaultFontFamily("ascii");
  }
  if (charCode >= 160 && charCode <= 255) {
    return style.wHAnsi ?? defaultFontFamily("hAnsi");
  }
  return style.wEastAsia ?? defaultFontFamily("eastAsia");
}

export function mergeRunStyle(base: RunStyle | undefined, override: RunStyle | undefined): RunStyle {
  return { ...base, ...override };
}
