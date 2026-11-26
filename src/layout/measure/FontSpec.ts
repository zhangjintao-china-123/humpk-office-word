import { resolveFontFamily, type RunStyle } from "../../model/style/RunStyle";
import { DEFAULT_FONT_SIZE } from "../LayoutConstants";

const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);

/** Word 中文名在 macOS 上并不存在，需落到系统里真正有的字体。 */
const FONT_STACKS: Record<string, readonly string[]> = {
  宋体: ["STSong", "Songti SC", "SimSun", "NSimSun", "宋体", "serif"],
  新宋体: ["NSimSun", "SimSun", "STSong", "Songti SC", "新宋体", "serif"],
  黑体: ["Heiti SC", "STHeiti", "SimHei", "黑体", "sans-serif"],
  楷体: ["Kaiti SC", "STKaiti", "KaiTi", "楷体", "serif"],
  仿宋: ["STFangsong", "FangSong", "仿宋", "serif"],
  微软雅黑: ["Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "微软雅黑", "sans-serif"],
  等线: ["DengXian", "PingFang SC", "Source Han Sans SC", "Noto Sans SC", "等线", "sans-serif"],
  "等线 Light": ["DengXian Light", "PingFang SC", "等线 Light", "sans-serif"],
  华文宋体: ["STSong", "Songti SC", "华文宋体", "serif"],
  华文黑体: ["STHeiti", "Heiti SC", "华文黑体", "sans-serif"],
  华文楷体: ["STKaiti", "Kaiti SC", "华文楷体", "serif"],
  华文仿宋: ["STFangsong", "FangSong", "华文仿宋", "serif"],
  华文中宋: ["STZhongsong", "Songti SC", "华文中宋", "serif"],
  华文细黑: ["STXihei", "Heiti SC", "PingFang SC", "华文细黑", "sans-serif"],
  华文行楷: ["STXingkai", "Xingkai SC", "华文行楷", "cursive"],
  华文隶书: ["STLiti", "Libian SC", "华文隶书", "serif"],
  华文琥珀: ["STHupo", "华文琥珀", "cursive"],
  华文新魏: ["STXinwei", "华文新魏", "cursive"],
  幼圆: ["YouYuan", "Yuanti SC", "幼圆", "sans-serif"],
  隶书: ["LiSu", "Libian SC", "STLiti", "隶书", "serif"],
  方正舒体: ["FZShuTi", "STXingkai", "Xingkai SC", "方正舒体", "cursive"],
  方正姚体: ["FZYaoTi", "方正姚体", "sans-serif"],
  苹方: ["PingFang SC", "苹方", "sans-serif"],
  冬青黑体: ["Hiragino Sans GB", "冬青黑体", "sans-serif"],
  Calibri: ["Calibri", "Carlito", "Helvetica Neue", "Arial", "sans-serif"],
  Aptos: ["Aptos", "Calibri", "Carlito", "Helvetica Neue", "Arial", "sans-serif"],
  Cambria: ["Cambria", "Caladea", "Georgia", "serif"],
  "Segoe UI": ["Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
  Consolas: ["Consolas", "Menlo", "Monaco", "monospace"],
  "Courier New": ["Courier New", "Courier", "monospace"],
};

export function fontSizeOf(style: RunStyle | undefined): number {
  return style?.fontSizePx ?? DEFAULT_FONT_SIZE;
}

/** 上下标画成大约 65% 的字号，行高仍按原字号。 */
export function glyphSizeOf(style: RunStyle | undefined): number {
  const full = fontSizeOf(style);
  if (style?.vertAlign === "superscript" || style?.vertAlign === "subscript") {
    return full * 0.65;
  }
  return full;
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

export function fontCss(style: RunStyle | undefined, charCode: number, size = glyphSizeOf(style)): string {
  const family = style ? resolveFontFamily(style, charCode) : "Times New Roman";
  const weight = style?.bold ? "bold" : "normal";
  const italic = style?.italic ? "italic" : "normal";
  const smallCaps = style?.smallCaps ? "small-caps " : "";
  return `${italic} ${smallCaps}${weight} ${size}px ${cssFontStack(family)}`;
}

export function fillColorOf(style: RunStyle | undefined): string {
  return style?.color ?? "#111111";
}
