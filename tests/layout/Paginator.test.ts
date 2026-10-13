import { describe, expect, it } from "vitest";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Line } from "../../src/model/line/Line";
import { Paginator } from "../../src/layout/page/Paginator";

describe("段落分页", () => {
  it("页顶去掉段前距", () => {
    const paragraph = new Paragraph(1);
    const line = textLine(paragraph, { first: true, last: true, height: 40, before: 12 });
    const placed = new Paginator().paginate([line], 100);
    expect(placed[0].top).toBe(0);
    expect(placed[0].beforeHeight).toBe(0);
    expect(placed[0].height).toBe(28);
  });

  it("段前分页把该段推到下一页", () => {
    const first = new Paragraph(1);
    const second = new Paragraph(2);
    second.attrs.pageBreakBefore = "1";
    const lines = [
      textLine(first, { first: true, last: true, height: 30 }),
      textLine(second, { first: true, last: true, height: 30 }),
    ];
    const placed = new Paginator().paginate(lines, 100);
    expect(placed[1].top).toBe(100);
  });

  it("段中不分页时整段挪到下一页", () => {
    const lead = new Paragraph(1);
    const body = new Paragraph(2);
    body.attrs.keepLines = "1";
    const lines = [
      textLine(lead, { first: true, last: true, height: 30 }),
      textLine(body, { first: true, last: false, height: 40 }),
      textLine(body, { first: false, last: true, height: 40 }),
    ];
    const placed = new Paginator().paginate(lines, 100);
    expect(placed[1].top).toBe(100);
    expect(placed[2].top).toBe(140);
  });

  it("与下段同页时，放不下就把上一段一起推下去", () => {
    const lead = new Paragraph(1);
    const heading = new Paragraph(2);
    heading.attrs.keepNext = "1";
    const body = new Paragraph(3);
    const lines = [
      textLine(lead, { first: true, last: true, height: 40 }),
      textLine(heading, { first: true, last: true, height: 30 }),
      textLine(body, { first: true, last: true, height: 40 }),
    ];
    const placed = new Paginator().paginate(lines, 100);
    expect(placed[1].top).toBe(100);
    expect(placed[2].top).toBe(130);
  });
});

function textLine(
  paragraph: Paragraph,
  opts: { first: boolean; last: boolean; height: number; before?: number },
): Line {
  const line = new Line();
  line.paragraph = paragraph;
  line.isFirst = opts.first;
  line.isLast = opts.last;
  line.beforeHeight = opts.before ?? 0;
  line.height = opts.height;
  line.fullHeight = opts.height;
  return line;
}
