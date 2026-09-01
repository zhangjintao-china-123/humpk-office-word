import { describe, expect, it } from "vitest";
import { Document } from "../../src/model/document/Document";
import { Table, TableCell, TableRow } from "../../src/model/table/Table";
import { TableBorderResolve } from "../../src/render/table/TableBorderResolve";

function cell(row: number, col: number): TableCell {
  const item = new TableCell(new Document());
  item.rowIndex = row;
  item.colIndex = col;
  return item;
}

function table(rows: number, cols: number): Table {
  const next = new Table();
  next.columnWidths = Array.from({ length: cols }, () => 80);
  for (let r = 0; r < rows; r += 1) {
    const row = new TableRow();
    for (let c = 0; c < cols; c += 1) {
      row.cells.push(cell(r, c));
    }
    next.rows.push(row);
  }
  return next;
}

describe("TableBorderResolve", () => {
  const resolve = new TableBorderResolve();

  it("无显式边框时用 0.5 磅默认格线", () => {
    const grid = table(1, 1);
    const border = resolve.cellEdge(grid, grid.rows[0].cells[0], "top");
    expect(resolve.visible(border)).toBe(true);
    expect(resolve.widthPx(border)).toBeCloseTo(96 / 72 / 2, 5);
  });

  it("sz 为磅的 1/8，24 即 3 磅", () => {
    expect(resolve.widthPx({ type: "single", size: "24", color: "#000" })).toBeCloseTo((24 / 8) * (96 / 72), 5);
    expect(resolve.visible({ type: "nil" })).toBe(false);
    expect(resolve.widthPx({ type: "none", size: "24" })).toBe(0);
  });

  it("单元格覆盖表级边框，内侧走 insideH/insideV", () => {
    const grid = table(2, 2);
    grid.borders = {
      top: { type: "single", size: "24", color: "#111111" },
      insideH: { type: "single", size: "4", color: "#FF0000" },
    };
    const top = grid.rows[0].cells[0];
    const bottom = grid.rows[1].cells[0];
    expect(resolve.cellEdge(grid, top, "top")?.size).toBe("24");
    expect(resolve.cellEdge(grid, top, "bottom")?.color).toBe("#FF0000");
    expect(resolve.cellEdge(grid, bottom, "top")?.color).toBe("#FF0000");
    top.borders = { top: { type: "single", size: "8", color: "#00FF00" } };
    expect(resolve.cellEdge(grid, top, "top")?.color).toBe("#00FF00");
  });
});
