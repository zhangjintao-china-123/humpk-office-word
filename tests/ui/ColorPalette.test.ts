import { describe, expect, it } from "vitest";
import { mixColor, normalizeColor, STANDARD_COLORS, textColorPaletteMarkup, THEME_BASES, themeShadeRows } from "../../src/ui/ribbon/ColorPalette";

describe("ColorPalette", () => {
  it("按 Word 排成自动、主题颜色、标准色和更多颜色", () => {
    const markup = textColorPaletteMarkup();
    expect(markup).toContain("自动");
    expect(markup).toContain("主题颜色");
    expect(markup).toContain("标准色");
    expect(markup).toContain("更多颜色");
    expect(markup).toContain('data-color="auto"');
    expect(markup).toContain(`data-color="${THEME_BASES[0]}"`);
    expect(markup).toContain(`data-color="${STANDARD_COLORS[0]}"`);
  });

  it("主题色带 5 档深浅，自动色归一成 auto", () => {
    expect(themeShadeRows()).toHaveLength(5);
    expect(themeShadeRows()[0]).toHaveLength(10);
    expect(mixColor("#000000", 0.5)).toBe("#808080");
    expect(normalizeColor(undefined)).toBe("auto");
    expect(normalizeColor("auto")).toBe("auto");
    expect(normalizeColor("#ff0000")).toBe("#FF0000");
  });
});
