import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Line } from "../../src/model/line/Line";
import { Word } from "../../src/model/inline/Word";
import { LinkedNode } from "../../src/model/list/LinkedList";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { Paginator } from "../../src/layout/page/Paginator";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { TableLayouter } from "../../src/layout/table/TableLayouter";
import { resolveColumnWidths, tableOffset } from "../../src/layout/table/TableMetrics";

describe("表格宽度和对齐", () => {
  it("百分比表宽把网格列放大到版心", () => {
    const table = grid([100, 100]);
    table.width = { type: "pct", value: 100 };
    expect(resolveColumnWidths(table, 400)).toEqual([200, 200]);
  });

  it("固定表宽按比例收拢列", () => {
    const table = grid([200, 200]);
    table.width = { type: "dxa", value: 300 };
    expect(resolveColumnWidths(table, 600)).toEqual([150, 150]);
  });

  it("居中和靠右按表宽留出左边空白", () => {
    const table = grid([100, 100]);
    table.columnWidths = [100, 100];
    table.align = "center";
    expect(tableOffset(table, 400)).toBe(100);
    table.align = "right";
    expect(tableOffset(table, 400)).toBe(200);
    table.align = "left";
    table.indent = { type: "dxa", value: 24 };
    expect(tableOffset(table, 400)).toBe(24);
  });

  it("排版后居中表的行带着左边空白", () => {
    const table = grid([80]);
    table.align = "center";
    const document = new Document();
    const holder = new Paragraph(1);
    holder.isTable = true;
    holder.table = table;
    document.addParagraph(holder);
    new WordStreamBuilder().buildStoryOnly(document);
    const lines = new StoryLayout().layout(document, {
      contentWidth: 200,
      contentHeight: 400,
      measurer: new FallbackMeasurer(),
      paginate: false,
    });
    expect(lines[0].leftBlankWidth).toBe(60);
  });
});

describe("表格行高", () => {
  it("固定行高不被内容撑开，最小值会抬高空行", () => {
    const exact = grid([100]);
    exact.rows[0].heightRule = "exact";
    exact.rows[0].height = 48;
    const atLeast = grid([100]);
    atLeast.rows[0].heightRule = "atLeast";
    atLeast.rows[0].height = 80;
    const layouter = new TableLayouter(() => {
      const line = new Line();
      line.height = 30;
      return [line];
    });
    layouter.layout(exact, { contentWidth: 200, contentHeight: 400, measurer: new FallbackMeasurer() });
    layouter.layout(atLeast, { contentWidth: 200, contentHeight: 400, measurer: new FallbackMeasurer() });
    expect(exact.rowHeights[0]).toBe(48);
    expect(atLeast.rowHeights[0]).toBe(80);
  });
});

describe("表格标题行跨页", () => {
  it("下一页切片在正文行前重复标题行", () => {
    const table = new Table();
    table.rowHeights = [30, 40, 40, 40];
    table.rows = table.rowHeights.map((_, index) => {
      const row = new TableRow();
      row.header = index === 0;
      return row;
    });
    const word = new Word();
    word.kind = "table";
    word.table = table;
    const line = new Line();
    line.type = "table";
    line.startNode = new LinkedNode(word);
    line.height = 150;
    const placed = new Paginator().paginate([line], 100);
    expect(placed.map((item) => [item.tableRowFrom, item.tableRowTo, item.tableHeaderRows, item.height, item.top])).toEqual([
      [0, 2, 0, 70, 0],
      [2, 3, 1, 70, 100],
      [3, 4, 1, 70, 200],
    ]);
  });
});

function grid(widths: number[]): Table {
  const table = new Table();
  table.columns = widths.map((width) => {
    const column = new TableColumn();
    column.width = width;
    return column;
  });
  const row = new TableRow();
  widths.forEach((_, index) => {
    const cell = new TableCell(new Document());
    cell.rowIndex = 0;
    cell.colIndex = index;
    const paragraph = new Paragraph(1);
    paragraph.addBlock(new Block());
    cell.document.addParagraph(paragraph);
    row.cells.push(cell);
  });
  table.rows = [row];
  return table;
}
