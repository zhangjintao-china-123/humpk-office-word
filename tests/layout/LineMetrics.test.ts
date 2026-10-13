import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Word } from "../../src/model/inline/Word";
import { Line } from "../../src/model/line/Line";
import { LineMetrics } from "../../src/layout/line/LineMetrics";
import { LINE_HEIGHT_RATIO } from "../../src/layout/LayoutConstants";
import { twipToPx } from "../../src/shared/units";

const metrics = new LineMetrics();

function paragraph(line?: string, lineRule?: string): Paragraph {
  const item = new Paragraph(1);
  if (line != null) {
    item.attrs.line = line;
  }
  if (lineRule) {
    item.attrs.lineRule = lineRule;
  }
  return item;
}

describe("LineMetrics 行距", () => {
  it("auto 按字号 × 倍数，360 为 1.5 倍，不夹到网格 21px", () => {
    const font = 18.666;
    const height = metrics.lineHeight(paragraph("360", "auto"), font);
    expect(height).toBeCloseTo(font * LINE_HEIGHT_RATIO * 1.5, 5);
    expect(height).toBeGreaterThan(font);
    expect(height).not.toBe(21 * 1.5);
  });

  it("auto 480 为 2 倍行距", () => {
    const font = 18.666;
    expect(metrics.lineHeight(paragraph("480", "auto"), font)).toBeCloseTo(font * LINE_HEIGHT_RATIO * 2, 5);
  });

  it("auto 允许小于 1 倍（例如 0.8）", () => {
    const font = 14;
    expect(metrics.lineHeight(paragraph("192", "auto"), font)).toBeCloseTo(font * LINE_HEIGHT_RATIO * 0.8, 5);
  });

  it("exact 使用 twip，不随字号放大", () => {
    expect(metrics.lineHeight(paragraph("240", "exact"), 28)).toBeCloseTo(twipToPx(240), 5);
  });

  it("atLeast 用字面 twip，自动行高按单倍", () => {
    const font = 18.666;
    const single = font * LINE_HEIGHT_RATIO;
    expect(metrics.lineHeight(paragraph("360", "atLeast"), font)).toBeCloseTo(Math.max(twipToPx(360), single), 5);
    expect(metrics.lineHeight(paragraph("100", "atLeast"), font)).toBeCloseTo(single, 5);
  });

  it("网格上 14 磅占 2 行，1.5 倍行距不生效", () => {
    const withGrid = new LineMetrics();
    withGrid.gridPitchPx = twipToPx(312);
    const height = withGrid.lineHeight(paragraph("360", "auto"), 18.666);
    expect(height).toBeCloseTo(twipToPx(312) * 2, 5);
    expect(height).not.toBeCloseTo(twipToPx(312) * 1.5, 5);
  });

  it("小四在 15.6 磅网格上只占一行", () => {
    const withGrid = new LineMetrics();
    withGrid.gridPitchPx = twipToPx(312);
    expect(withGrid.lineHeight(paragraph("240", "auto"), 16)).toBeCloseTo(twipToPx(312), 5);
  });

  it("网格上小字号仍可用 1.5 倍", () => {
    const withGrid = new LineMetrics();
    withGrid.gridPitchPx = twipToPx(312);
    expect(withGrid.lineHeight(paragraph("360", "auto"), 14)).toBeCloseTo(twipToPx(312) * 1.5, 5);
  });

  it("beforeLines / afterLines 优先于绝对 twip，单位用网格行距", () => {
    const withGrid = new LineMetrics();
    withGrid.gridPitchPx = twipToPx(312);
    const item = paragraph();
    item.attrs.before = "240";
    item.attrs.beforeLines = "100";
    item.attrs.after = "480";
    item.attrs.afterLines = "200";
    expect(withGrid.beforeHeight(item, true)).toBeCloseTo(twipToPx(312), 5);
    expect(withGrid.afterHeight(item, true)).toBeCloseTo(twipToPx(312) * 2, 5);
  });

  it("beforeAutospacing 忽略 before，按一行单位", () => {
    const item = paragraph();
    item.attrs.before = "2400";
    item.attrs.beforeAutospacing = "1";
    expect(metrics.beforeHeight(item, true)).toBeCloseTo(14 * LINE_HEIGHT_RATIO, 5);
  });

  it("段间距取较大值，不叠加", () => {
    const first = paragraph();
    const second = paragraph();
    first.attrs.after = "240";
    second.attrs.before = "80";
    expect(metrics.collapsedGap(first, second, twipToPx(240), twipToPx(80))).toBeCloseTo(twipToPx(240), 5);
  });

  it("同样式 contextualSpacing 时段间距为 0", () => {
    const first = paragraph();
    const second = paragraph();
    first.attrs.styleId = "Normal";
    second.attrs.styleId = "Normal";
    first.attrs.contextualSpacing = "1";
    first.attrs.after = "240";
    second.attrs.before = "240";
    expect(metrics.collapsedGap(first, second, twipToPx(240), twipToPx(240))).toBe(0);
  });

  it("默认按基线排，居中才把字放在行框中间", () => {
    expect(metrics.contentOffset(40, 20, undefined)).toBe(0);
    expect(metrics.contentOffset(40, 20, "center")).toBeCloseTo(10, 5);
    expect(metrics.contentOffset(20, 30, "bottom")).toBeCloseTo(-10, 5);
  });

  it("左缩进认磅，悬挂缩进让首行往回退", () => {
    const item = paragraph();
    item.attrs.leftTwip = 420;
    item.attrs.hangingTwip = 420;
    expect(metrics.leftBlank(item, false, null)).toBeCloseTo(twipToPx(420), 5);
    expect(metrics.leftBlank(item, true, null)).toBeCloseTo(0, 5);
  });

  it("字符缩进按字号，不按固定 14 像素", () => {
    const item = paragraph();
    item.attrs.firstLineChars = 200;
    const block = new Block();
    block.style = { fontSizePx: 21.333 };
    const word = new Word();
    word.block = block;
    expect(metrics.leftBlank(item, true, word)).toBeCloseTo(42.666, 2);
  });

  it("相邻段 collapse 后间距只留较大者", () => {
    const first = paragraph();
    const second = paragraph();
    first.attrs.after = "240";
    second.attrs.before = "80";
    const a = new Line();
    const b = new Line();
    a.paragraph = first;
    b.paragraph = second;
    a.isLast = true;
    b.isFirst = true;
    a.afterHeight = twipToPx(240);
    b.beforeHeight = twipToPx(80);
    a.height = 20 + a.afterHeight;
    b.height = 20 + b.beforeHeight;
    metrics.collapseAdjacent([a, b]);
    expect(a.afterHeight).toBe(0);
    expect(b.beforeHeight).toBeCloseTo(twipToPx(240), 5);
    expect(a.height).toBeCloseTo(20, 5);
    expect(b.height).toBeCloseTo(20 + twipToPx(240), 5);
  });
});
