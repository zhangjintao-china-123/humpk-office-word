import { describe, expect, it } from "vitest";
import { CHINESE_FONTS, LATIN_FONTS, fontSelectMarkup, isListedFont } from "../../src/ui/ribbon/FontList";

describe("FontList", () => {
  it("中西文分组都明显多于原来的 8 种", () => {
    expect(CHINESE_FONTS.length).toBeGreaterThan(20);
    expect(LATIN_FONTS.length).toBeGreaterThan(20);
    expect(isListedFont("等线")).toBe(true);
    expect(isListedFont("Georgia")).toBe(true);
    expect(isListedFont("不存在的字体")).toBe(false);
  });

  it("下拉里按中文、西文分组，选项带字体预览", () => {
    const markup = fontSelectMarkup();
    expect(markup).toContain('label="中文字体"');
    expect(markup).toContain('label="西文字体"');
    expect(markup).toContain('value="微软雅黑"');
    expect(markup).toContain('value="Times New Roman"');
    expect(markup).toContain("font-family:");
  });
});
