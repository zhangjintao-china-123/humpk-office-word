import { describe, expect, it } from "vitest";
import { PageSetup } from "../../src/render/page/PageSetup";

describe("PageSetup", () => {
  it("默认 A4 尺寸与内容区", () => {
    const page = PageSetup.a4();
    expect(page.width).toBe(Math.round(8.27 * 96));
    expect(page.height).toBe(Math.round(11.69 * 96));
    expect(page.width).toBeGreaterThan(700);
    expect(page.height).toBeGreaterThan(1000);
    expect(page.contentWidth).toBe(page.width - page.leftMargin - page.rightMargin);
    expect(page.contentHeight).toBe(page.height - page.headerHeight - page.footerHeight);
    expect(page.contentWidth).toBeGreaterThan(0);
    expect(page.contentHeight).toBeGreaterThan(0);
  });

  it("resetA4 后可套用节的左右边距", () => {
    const page = PageSetup.a4();
    page.assign({ leftMargin: 200, rightMargin: 80, linePitchPx: 12 });
    expect(page.contentWidth).toBe(page.width - 280);
    page.resetA4();
    expect(page.leftMargin).toBe(96);
    expect(page.rightMargin).toBe(96);
    expect(page.linePitchPx).toBeUndefined();
  });

  it("stackHeight 含页间距", () => {
    const page = new PageSetup({ height: 100, pageGap: 10 });
    expect(page.stackHeight(1)).toBe(100);
    expect(page.stackHeight(3)).toBe(320);
  });

  it("正文顶边取 top 与页眉底的较大值", () => {
    const page = new PageSetup({
      height: 400,
      headerHeight: 48,
      headerFromEdge: 96,
      headerExtent: 20,
      footerHeight: 48,
      footerFromEdge: 96,
      footerExtent: 20,
    });
    expect(page.contentTop()).toBe(116);
    expect(page.headerTop()).toBe(96);
    expect(page.contentBottom()).toBe(284);
    expect(page.footerTop()).toBe(284);
    expect(page.contentHeight).toBe(168);
  });

  it("top/bottom 为负时允许与页眉页脚重叠", () => {
    const page = new PageSetup({
      height: 400,
      headerHeight: -48,
      headerFromEdge: 96,
      headerExtent: 40,
      footerHeight: -48,
      footerFromEdge: 96,
      footerExtent: 40,
    });
    expect(page.contentTop()).toBe(48);
    expect(page.contentBottom()).toBe(352);
    expect(page.footerTop()).toBe(264);
  });
});
