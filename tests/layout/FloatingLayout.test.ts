import { describe, expect, it } from "vitest";
import type { StoryEditor } from "../../src/editor/StoryEditor";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Drawing, type DrawingAnchor } from "../../src/model/inline/Drawing";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { PageSetup } from "../../src/render/page/PageSetup";
import { HitTester, type HitContext } from "../../src/selection/HitTester";

const constraints = {
  measurer: new FallbackMeasurer(),
  contentWidth: 210, contentHeight: 100, pageWidth: 270, pageHeight: 160, leftMargin: 30, topMargin: 30,
};

function paragraph(doc: Document, text: string): Paragraph {
  const value = new Paragraph(doc.nextParagraphId());
  const block = new Block();
  block.text = text;
  value.addBlock(block);
  doc.addParagraph(value);
  return value;
}

function addDrawing(host: Paragraph, width: number, height: number, anchor?: DrawingAnchor): Drawing {
  const drawing = new Drawing();
  drawing.width = width;
  drawing.height = height;
  drawing.position = anchor ? "anchor" : "inline";
  drawing.anchorSet = anchor;
  const block = new Block();
  block.drawing = drawing;
  host.addBlock(block);
  host.hasAnchor ||= !!anchor;
  return drawing;
}

function layout(doc: Document) {
  new WordStreamBuilder().build(doc);
  return new StoryLayout().layout(doc, constraints);
}

describe("浮动对象与文字环绕", () => {
  it("远处的浮动图不改变普通正文行宽", () => {
    const doc = new Document();
    const text = paragraph(doc, "甲".repeat(35));
    const normal = layout(doc).map((line) => line.width);
    addDrawing(text, 70, 25, { wrapType: "square", top: 900 });
    expect(layout(doc).map((line) => line.width)).toEqual(normal);
  });

  it("字符锚定的浮动物和文字使用同一次定位", () => {
    const doc = new Document();
    const host = paragraph(doc, "甲".repeat(30));
    addDrawing(host, 80, 30, { wrapType: "square", leftFrom: "character" });
    host.blocks.unshift(host.blocks.pop()!);
    const lines = layout(doc);
    expect(doc.anchors[0].x).toBe(0);
    expect(lines[0].getWord(0)?.left).toBeGreaterThanOrEqual(doc.anchors[0].wrapRight);
  });

  it("改回相同的环绕模式时重复重排不会让其他锚点漂移", () => {
    const doc = new Document();
    const first = paragraph(doc, "甲".repeat(45));
    const second = paragraph(doc, "乙".repeat(60));
    const firstDrawing = addDrawing(first, 65, 33, { wrapType: "square", left: 44 });
    addDrawing(second, 55, 46, { wrapType: "square", left: 70 });
    const snapshot = (lines: ReturnType<typeof layout>) => ({
      anchors: doc.anchors.map((anchor) => [anchor.x, anchor.y, anchor.pageIndex]),
      lines: lines.map((line) => [line.top, line.height, line.length, line.leftBlankWidth]),
    });
    const baseline = snapshot(layout(doc));
    const engine = new StoryLayout();
    firstDrawing.anchorSet!.wrapType = "nowrap";
    engine.reflow(doc, constraints, [first]);
    firstDrawing.anchorSet!.wrapType = "square";
    expect(snapshot(engine.reflow(doc, constraints, [first]))).toEqual(baseline);
  });

  it("多组上下环绕和整页宽的超高障碍都能越过", () => {
    const doc = new Document();
    const host = paragraph(doc, "正文");
    for (const top of [0, 19, 38]) {
      addDrawing(host, 80, 18, { wrapType: "nowrap", topFrom: "margin", top });
    }
    expect(layout(doc)[0].top).toBe(56);
    addDrawing(host, 220, 3600, { wrapType: "tight", topFrom: "margin", top: 0 });
    const remaining = layout(doc);
    expect(remaining[0].top).toBe(100);
    expect(remaining[0].getWord(0)?.char).toBe("正");
  });

  it("使用行内图片撑高后的实际行高检查障碍", () => {
    const doc = new Document();
    const host = paragraph(doc, "甲");
    const inline = addDrawing(host, 90, 58);
    addDrawing(host, 80, 28, { wrapType: "square", left: 30, topFrom: "margin", top: 24 });
    const lines = layout(doc);
    const line = lines.find((item) => Array.from({ length: item.length }, (_, i) => item.getWord(i)).some((word) => word?.drawing === inline))!;
    const word = Array.from({ length: line.length }, (_, i) => line.getWord(i)).find((value) => value?.drawing === inline)!;
    expect(line.top >= 52 || word.left + inline.width <= 30 || word.left >= 110).toBe(true);
  });

  it("共享对象归属页，第二页页顶的对象仍可命中", () => {
    const doc = new Document();
    paragraph(doc, "第一页");
    const p = paragraph(doc, "第二页");
    p.attrs.pageBreakBefore = "1";
    const topAligned = addDrawing(p, 22, 10, { wrapType: "none", left: 20, topFrom: "page", topAlign: "top" });
    const offsetZero = addDrawing(p, 22, 10, { wrapType: "none", left: 60, topFrom: "page", top: 0 });
    const lines = layout(doc);
    expect(doc.anchors.map(({ pageIndex, y }) => [pageIndex, y])).toEqual([[1, 70], [1, 70]]);

    const pageSetup = new PageSetup({ width: 270, height: 160, leftMargin: 30, rightMargin: 30, headerHeight: 30, footerHeight: 30 });
    const ctx: HitContext = { pageSetup, origins: [{ x: 0, y: 0 }, { x: 0, y: 180 }], body: { lines, document: doc } as StoryEditor };
    expect(new HitTester().pictureAt(52, 183, ctx)?.drawing).toBe(topAligned);
    expect(new HitTester().pictureAt(92, 183, ctx)?.drawing).toBe(offsetZero);
  });

  it("旋转更新四周环绕的外框，隐藏对象释放文字避让区", () => {
    const doc = new Document();
    const host = paragraph(doc, "甲".repeat(30));
    const drawing = addDrawing(host, 160, 20, { wrapType: "square", topFrom: "margin" });
    expect(layout(doc)[0].leftBlankWidth).toBe(160);
    drawing.rotation = 90;
    expect(layout(doc)[0].leftBlankWidth).toBe(0);
    expect(doc.anchors[0].wrapLeft).toBeCloseTo(70);
    expect(doc.anchors[0].wrapRight).toBeCloseTo(90);
    drawing.hidden = true;
    expect(layout(doc)[0].width).toBe(210);
  });

  it("浮动表格逐页切分和重复表头，每页正文按表身与文字间距避让", () => {
    const doc = new Document();
    const table = new Table();
    const column = new TableColumn();
    column.width = 75;
    table.columns = [column];
    table.anchorType = "relative";
    table.anchorSet = { leftFrom: "margin", topFrom: "page", top: 12, distRight: 10 };
    for (const [index, height] of [20, 230].entries()) {
      const row = new TableRow();
      const cell = new TableCell(new Document());
      cell.rowIndex = index;
      paragraph(cell.document, index ? "表身" : "表头");
      row.header = index === 0;
      row.heightRule = "exact";
      row.height = height;
      row.cells.push(cell);
      table.rows.push(row);
    }
    const tableHost = new Paragraph(1);
    tableHost.table = table;
    tableHost.isTable = tableHost.hasAnchor = true;
    doc.addParagraph(tableHost);
    paragraph(doc, "正文".repeat(85));
    const lines = layout(doc);
    const pieces = lines.filter((line) => line.type === "table");
    expect(pieces.map((line) => line.pageIndex)).toEqual([0, 0, 1, 2]);
    expect(pieces[0].top).toBe(-18);
    expect(pieces.at(-1)?.tableHeaderRows).toBe(1);
    expect(lines.find((line) => !line.type)?.leftBlankWidth).toBe(85);
    expect(lines.some((line) => !line.type && line.top >= 100 && line.top < 200 && line.leftBlankWidth === 85)).toBe(true);
  });
});
