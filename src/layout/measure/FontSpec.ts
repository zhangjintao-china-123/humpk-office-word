import { resolveFontFamily, type RunStyle } from "../../model/style/RunStyle";
import { DEFAULT_FONT_SIZE } from "../LayoutConstants";

const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);

/** Word 中文名在 macOS 上并不存在，需落到系统里真正有的字体。 */
const FONT_STACKS: Record<string, readonly string[]> = {
  宋体: ["STSong", "Songti SC", "SimSun", "NSimSun", "宋体", "serif"],
  黑体: ["Heiti SC", "STHeiti", "SimHei", "黑体", "sans-serif"],
  楷体: ["Kaiti SC", "STKaiti", "KaiTi", "楷体", "serif"],
  仿宋: ["STFangsong", "FangSong", "仿宋", "serif"],
  微软雅黑: ["PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "微软雅黑", "sans-serif"],
  Calibri: ["Calibri", "Carlito", "Helvetica Neue", "Arial", "sans-serif"],
};

export function fontSizeOf(style: RunStyle | undefined): number {
  return style?.fontSizePx ?? DEFAULT_FONT_SIZE;
}

export function quoteFontFamily(family: string): string {
  const name = family.trim().replace(/^["']|["']$/g, "");
  if (!name) {
    return "serif";
  }
  if (GENERIC_FAMILIES.has(name.toLowerCase())) {
    return name;
  }
  return `"${name.replace(/"/g, "")}"`;
}

export function cssFontStack(family: string): string {
  const names = FONT_STACKS[family.trim()] ?? [family];
  return names.map((name) => quoteFontFamily(name)).join(", ");
}

export function fontCss(style: RunStyle | undefined, charCode: number, size = fontSizeOf(style)): string {
  const family = style ? resolveFontFamily(style, charCode) : "Times New Roman";
  const weight = style?.bold ? "bold" : "normal";
  const italic = style?.italic ? "italic" : "normal";
  return `${italic} ${weight} ${size}px ${cssFontStack(family)}`;
}

export function fillColorOf(style: RunStyle | undefined): string {
  return style?.color ?? "#111111";
}
