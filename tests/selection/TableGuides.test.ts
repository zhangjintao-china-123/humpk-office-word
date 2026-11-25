import { describe, expect, it } from "vitest";
import { Document } from "../../src/model/document/Document";
import { TableCell } from "../../src/model/table/Table";
import type { TableCellBox } from "../../src/render/table/TableGeometry";
import { guidesFromBoxes, pickGuide } from "../../src/selection/TableGuides";

function box(
  col: number,
  row: number,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<TableCellBox> = {},
): TableCellBox {
  const cell = new TableCell(new Document());
  cell.colIndex = col;
  cell.rowIndex = row;
  return { x, y, width, height, ...extra, cell };
}

describe("表格格线", () => {
  it("竖线选中线左边的列，横线选中线上面的行", () => {
    const segments = guidesFromBoxes([
      box(0, 0, 0, 0, 100, 40),
      box(1, 0, 100, 0, 80, 40),
    ]);
    expect(pickGuide(segments, 100, 20, 5)?.segment).toMatchObject({ kind: "column", index: 0 });
    expect(pickGuide(segments, 180, 20, 5)?.segment).toMatchObject({ kind: "column", index: 1 });
    expect(pickGuide(segments, 2, 20, 5)?.segment).toMatchObject({ kind: "left", index: 0 });
    expect(pickGuide(segments, 40, 40, 5)?.segment).toMatchObject({ kind: "row", index: 0 });
    expect(pickGuide(segments, 40, 20, 5)).toBeNull();
  });

  it("合并格的右缘改的是跨度里最后一列", () => {
    const cell = new TableCell(new Document());
    cell.colIndex = 0;
    cell.rowIndex = 0;
    cell.colSpan = 2;
    const segments = guidesFromBoxes([{ cell, x: 0, y: 0, width: 180, height: 40 }]);
    expect(pickGuide(segments, 180, 10, 4)?.segment).toMatchObject({ kind: "column", index: 1 });
  });

  it("被页切开、底边不在这一页的格子没有行线", () => {
    const segments = guidesFromBoxes([
      box(0, 0, 0, 0, 80, 200, { visibleY: 0, visibleHeight: 80 }),
    ]);
    expect(segments.some((segment) => segment.kind === "row")).toBe(false);
    expect(pickGuide(segments, 80, 40, 4)?.segment.kind).toBe("column");
    expect(pickGuide(segments, 40, 80, 4)).toBeNull();
  });

  it("交点上更靠近哪条线就拖哪条", () => {
    const segments = guidesFromBoxes([box(0, 0, 0, 0, 100, 40)]);
    expect(pickGuide(segments, 100, 36, 5)?.segment.kind).toBe("column");
    expect(pickGuide(segments, 96, 40, 5)?.segment.kind).toBe("row");
    expect(pickGuide(segments, 96, 36, 5)?.segment.kind).toBe("column");
  });
});
