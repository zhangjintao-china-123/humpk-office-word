import { describe, expect, it } from "vitest";
import { CanvasMeasurer } from "../../src/layout/measure/CanvasMeasurer";
import { cssFontStack, fontCss, quoteFontFamily } from "../../src/layout/measure/FontSpec";
import type { Draw } from "../../src/render/canvas/Draw";

describe("fontCss", () => {
  it("带空格的字体名加引号，避免 canvas 字号回退", () => {
    expect(quoteFontFamily("Times New Roman")).toBe('"Times New Roman"');
    expect(fontCss({ wAscii: "Times New Roman" }, 65)).toContain('"Times New Roman"');
    expect(fontCss({ wEastAsia: "宋体" }, 0x6d4b)).toContain('"STSong"');
    expect(fontCss({ wEastAsia: "宋体" }, 0x6d4b)).toContain('"宋体"');
  });

  it("中文 Word 字体名展开为系统回退栈", () => {
    expect(cssFontStack("黑体")).toContain('"Heiti SC"');
    expect(cssFontStack("楷体")).toContain('"Kaiti SC"');
    expect(cssFontStack("仿宋")).toContain('"STFangsong"');
    expect(cssFontStack("微软雅黑")).toContain('"PingFang SC"');
    expect(cssFontStack("Arial")).toBe('"Arial"');
  });
});

describe("CanvasMeasurer", () => {
  it("按绘制字号测宽，不再用 400px 缩放", () => {
    const fonts: string[] = [];
    const draw = {
      setFont(font: string) {
        fonts.push(font);
      },
      measureText() {
        return 12;
      },
    } as unknown as Draw;
    const width = new CanvasMeasurer(draw).measure("测", { fontSizePx: 14, wEastAsia: "宋体" }, 0x6d4b);
    expect(fonts[0]).toContain("14px");
    expect(fonts[0]).not.toContain("400px");
    expect(width).toBe(12);
  });
});
