import { describe, expect, it } from "vitest";
import { TableBorderApplier } from "../../src/edit/TableBorderApplier";
import { Document } from "../../src/model/document/Document";
import { Table, TableCell, TableRow } from "../../src/model/table/Table";

function grid(rows: number, cols: number): { table: Table; cells: TableCell[] } {
  const table = new Table();
  table.columnWidths = Array.from({ length: cols }, () => 60);
  const cells: TableCell[] = [];
  for (let r = 0; r < rows; r += 1) {
    const row = new TableRow();
    for (let c = 0; c < cols; c += 1) {
      const cell = new TableCell(new Document());
      cell.rowIndex = r;
      cell.colIndex = c;
      row.cells.push(cell);
      cells.push(cell);
    }
    table.rows.push(row);
  }
  return { table, cells };
}

describe("TableBorderApplier", () => {
  const applier = new TableBorderApplier();
  const pen = { type: "single", size: "24", color: "#C00000" };

  it("外侧框线只改选区外沿，内部横线改共享横边", () => {
    const { table, cells } = grid(2, 2);
    applier.apply(cells, table, "outside", pen);
    expect(cells[0].borders?.top?.size).toBe("24");
    expect(cells[0].borders?.left?.color).toBe("#C00000");
    expect(cells[0].borders?.bottom).toBeUndefined();
    expect(cells[0].borders?.right).toBeUndefined();
    expect(cells[3].borders?.bottom?.size).toBe("24");
    expect(cells[3].borders?.right?.size).toBe("24");

    applier.apply(cells, table, "insideH", { type: "single", size: "4", color: "#000000" });
    expect(cells[0].borders?.bottom?.size).toBe("4");
    expect(cells[2].borders?.top?.size).toBe("4");
    expect(cells[0].borders?.right).toBeUndefined();
  });

  it("无框线清掉四边和对角线", () => {
    const { table, cells } = grid(1, 1);
    applier.apply(cells, table, "all", pen);
    applier.apply(cells, table, "tl2br", pen);
    applier.apply(cells, table, "none", pen);
    expect(cells[0].borders?.top?.type).toBe("nil");
    expect(cells[0].borders?.tl2br?.type).toBe("nil");
  });

  it("单边已是当前粗细时再点一次则关掉", () => {
    const { table, cells } = grid(1, 1);
    applier.apply(cells, table, "bottom", pen);
    expect(cells[0].borders?.bottom?.size).toBe("24");
    applier.apply(cells, table, "bottom", pen);
    expect(cells[0].borders?.bottom?.type).toBe("nil");
  });
});
