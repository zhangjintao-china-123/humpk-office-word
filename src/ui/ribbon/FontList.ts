import { cssFontStack } from "../../layout/measure/FontSpec";

/** Word 开始菜单里常见的中文字体，加上 macOS 上能用的别名。 */
export const CHINESE_FONTS = [
  "宋体",
  "新宋体",
  "黑体",
  "楷体",
  "仿宋",
  "微软雅黑",
  "等线",
  "等线 Light",
  "华文宋体",
  "华文黑体",
  "华文楷体",
  "华文仿宋",
  "华文中宋",
  "华文细黑",
  "华文行楷",
  "华文隶书",
  "华文琥珀",
  "华文新魏",
  "幼圆",
  "隶书",
  "方正舒体",
  "方正姚体",
  "苹方",
  "冬青黑体",
  "PingFang SC",
  "Songti SC",
  "Heiti SC",
  "Kaiti SC",
  "Hiragino Sans GB",
  "Hiragino Mincho ProN",
  "STSong",
  "STKaiti",
  "STFangsong",
  "STHeiti",
  "Yuanti SC",
  "Xingkai SC",
  "Libian SC",
  "Wawati SC",
  "Hannotate SC",
  "HanziPen SC",
  "Lantinghei SC",
  "Baoli SC",
] as const;

export const LATIN_FONTS = [
  "Times New Roman",
  "Times",
  "Georgia",
  "Cambria",
  "Palatino",
  "Palatino Linotype",
  "Garamond",
  "Baskerville",
  "Cochin",
  "Didot",
  "Arial",
  "Arial Black",
  "Arial Unicode MS",
  "Calibri",
  "Aptos",
  "Helvetica",
  "Helvetica Neue",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Century Gothic",
  "Gill Sans",
  "Futura",
  "Optima",
  "Segoe UI",
  "Franklin Gothic Medium",
  "Comic Sans MS",
  "Impact",
  "Courier New",
  "Courier",
  "Consolas",
  "Menlo",
  "Monaco",
  "Andale Mono",
  "Lucida Grande",
  "Lucida Console",
] as const;

const LISTED = new Set<string>([...CHINESE_FONTS, ...LATIN_FONTS]);

export function isListedFont(name: string): boolean {
  return LISTED.has(name);
}

export function fontSelectMarkup(): string {
  return `<optgroup label="中文字体">${optionMarkup(CHINESE_FONTS)}</optgroup><optgroup label="西文字体">${optionMarkup(LATIN_FONTS)}</optgroup>`;
}

function optionMarkup(fonts: readonly string[]): string {
  return fonts
    .map((font) => {
      const label = escapeAttr(font);
      return `<option value="${label}" style="font-family:${escapeAttr(cssFontStack(font))}">${label}</option>`;
    })
    .join("");
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
