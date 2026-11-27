import { describe, expect, it } from "vitest";
import { Document } from "../../src/model/document/Document";
import { Table, TableCell, TableRow } from "../../src/model/table/Table";
import { TableGeometry } from "../../src/render/table/TableGeometry";

describe("TableGeometry", () => {
  it("竖向合并格子在跨页切片里从上方伸出", () => {
    const table = new Table();
    table.columnWidths = [40, 50];
    table.rowHeights = [20, 20, 20];
    const row = new TableRow();
    const cell = new TableCell(new Document());
    cell.colIndex = 0;
    cell.rowIndex = 0;
    cell.rowSpan = 3;
    row.cells.push(cell);
    table.rows.push(row);

    const boxes = new TableGeometry().boxesInSlice(table, 1, 3, 10, 100);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].x).toBe(10);
    expect(boxes[0].y).toBe(80);
    expect(boxes[0].width).toBe(40);
    expect(boxes[0].height).toBe(60);
  });

  it("同一行跨页时格子上移，露出来的范围停在这一片里", () => {
    const table = new Table();
    table.columnWidths = [40];
    table.rowHeights = [200];
    const row = new TableRow();
    const cell = new TableCell(new Document());
    row.cells.push(cell);
    table.rows.push(row);

    const boxes = new TableGeometry().boxesForSlice(table, 0, 1, 0, 10, 100, 80, 50);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].y).toBe(20);
    expect(boxes[0].height).toBe(200);
    expect(boxes[0].visibleY).toBe(100);
    expect(boxes[0].visibleHeight).toBe(50);
  });

  it("切片高度是可见行高之和", () => {
    const table = new Table();
    table.rowHeights = [10, 15, 20];
    expect(new TableGeometry().sliceHeight(table, 1, 3)).toBe(35);
  });

  it("重复标题和表身分别裁剪，跨行合并格保留续页部分", () => {
    const table = new Table();
    table.columnWidths = [50];
    table.rowHeights = [20, 40, 150];
    table.rows = table.rowHeights.map(() => new TableRow());
    const header = new TableCell(new Document());
    const merged = new TableCell(new Document());
    merged.rowIndex = 1;
    merged.rowSpan = 2;
    table.rows[0].cells = [header];
    table.rows[1].cells = [merged];
    const boxes = new TableGeometry().boxesForSlice(table, 2, 3, 1, 0, 100, 30, 90);
    expect(boxes).toMatchObject([
      { cell: header, y: 100, visibleY: 100, visibleHeight: 20 },
      { cell: merged, y: 50, height: 190, visibleY: 120, visibleHeight: 70 },
    ]);
  });
});
