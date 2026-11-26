import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { StoryPainter } from "../../src/render/story/StoryPainter";
import type { Draw } from "../../src/render/canvas/Draw";

describe("StoryPainter 编辑标记与中文版式绘制", () => {
  it("开启 showMarks 时绘制空格点、制表符箭头和回车符，并正确绘制中文版式与段落底纹边框", () => {
    const document = new Document();
    const p = new Paragraph(1);
    p.attrs.shading = { val: "clear", color: "auto", fill: "E7E6E6" };
    p.attrs.borderBottom = { val: "single", sz: "8", color: "000000", space: "4" };

    const b1 = new Block();
    b1.text = "A \tB";
    const b2 = new Block();
    b2.text = "双行合一";
    b2.asianLayout = { kind: "twoInOne", brackets: "round" };

    p.addBlock(b1);
    p.addBlock(b2);
    document.addParagraph(p);
    new WordStreamBuilder().build(document);

    const lines = new StoryLayout().layout(document, {
      contentWidth: 400,
      contentHeight: 600,
      leftMargin: 40,
      pageWidth: 480,
      measurer: new FallbackMeasurer(),
      paginate: true,
    });

    const ops: string[] = [];
    const draw = {
      save: () => ops.push("save"),
      restore: () => ops.push("restore"),
      translate: () => undefined,
      scale: () => undefined,
      setFill: () => undefined,
      setStroke: () => undefined,
      setLineDash: () => undefined,
      fillRect: () => ops.push("fillRect"),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      arcTo: () => undefined,
      ellipse: () => ops.push("ellipse"),
      closePath: () => undefined,
      fill: () => ops.push("fill"),
      stroke: () => ops.push("stroke"),
      setFont: () => undefined,
      measureText: (t: string) => t.length * 8,
      fillText: (t: string) => ops.push(`text:${t}`),
      strokeRect: () => undefined,
      rect: () => undefined,
      clip: () => undefined,
      drawImage: () => undefined,
    } as unknown as Draw;

    const painter = new StoryPainter();
    painter.paintLine(draw, lines[0], 0, 0, 1, {
      values: { PAGE: "1", NUMPAGES: "1", SECTIONPAGES: "1" },
      text: new Map(),
      showMarks: true,
    });

    // 段落底纹与边框
    expect(ops).toContain("fillRect");
    expect(ops).toContain("stroke");
    // 空格点（ellipse + fill）
    expect(ops).toContain("ellipse");
    // 中文版式括号与两行文字
    expect(ops).toContain("text:(");
    expect(ops).toContain("text:双行");
    expect(ops).toContain("text:合一");
    expect(ops).toContain("text:)");
  });
});
