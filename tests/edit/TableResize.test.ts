import { describe, expect, it } from "vitest";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Line } from "../../src/model/line/Line";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { MIN_ROW_HEIGHT } from "../../src/layout/LayoutConstants";
import { TableLayouter } from "../../src/layout/table/TableLayouter";
import { resolveColumnWidths } from "../../src/layout/table/TableMetrics";
import {
  applyColumnWidths,
  applyRowHeight,
  MIN_COLUMN_WIDTH,
  resizedColumns,
  resizedRow,
  restoreTableMetrics,
  snapTableMetrics,
  TableMetricCommand,
} from "../../src/edit/TableResize";
import type { EditContext } from "../../src/edit/EditContext";

function table(): Table {
  const next = new Table();
  next.width = { type: "pct", value: 100 };
  next.columns = [100, 80].map((width) => {
    const column = new TableColumn();
    column.width = width;
    return column;
  });
  next.columnWidths = [100, 80];
  const row = new TableRow();
  const left = new TableCell(new Document());
  left.colIndex = 0;
  left.width = { type: "pct", value: 40 };
  const right = new TableCell(new Document());
  right.colIndex = 1;
  row.cells = [left, right];
  next.rows = [row];
  next.rowHeights = [40];
  return next;
}

describe("表格拖动尺寸", () => {
  it("拖竖线只加宽左边的列，右边的列保持原宽", () => {
    const next = resizedColumns([100, 80, 60], 0, 30, "move", 0);
    expect(next.widths).toEqual([130, 80, 60]);
    expect(resizedColumns([100, 80], 0, -1000, "move", 0).widths[0]).toBe(MIN_COLUMN_WIDTH);
  });

  it("按住 Shift 和右边一列对调，总宽不变", () => {
    expect(resizedColumns([100, 80], 0, 20, "pair", 0).widths).toEqual([120, 60]);
    expect(resizedColumns([100, 80], 0, 1000, "pair", 0).widths).toEqual([152, MIN_COLUMN_WIDTH]);
  });

  it("按住 Ctrl 时右边各列按比例分掉剩余宽度", () => {
    const next = resizedColumns([100, 60, 40], 0, 20, "share", 12);
    expect(next.indent).toBe(12);
    expect(next.widths[0]).toBe(120);
    expect(next.widths[1] + next.widths[2]).toBeCloseTo(80);
    expect(next.widths[1]).toBeGreaterThan(next.widths[2]);
  });

  it("拖左外框时第一列和缩进对向变化，右缘不动", () => {
    const wider = resizedColumns([100, 80], 0, -40, "left", 10);
    expect(wider).toEqual({ widths: [110, 80], indent: 0 });
    const narrower = resizedColumns([100, 80], 0, 30, "left", 10);
    expect(narrower).toEqual({ widths: [70, 80], indent: 40 });
    expect(narrower.indent + narrower.widths[0] + narrower.widths[1]).toBe(10 + 100 + 80);
  });

  it("拖横线得到的行高不低于最小行高", () => {
    expect(resizedRow(40, 15)).toBe(55);
    expect(resizedRow(40, -100)).toBe(MIN_ROW_HEIGHT);
  });

  it("写回列宽后排版不再按百分比摊开", () => {
    const host = table();
    const before = snapTableMetrics(host);
    applyColumnWidths(host, [140, 80]);
    const resolved = resolveColumnWidths(host, 400);
    expect(resolved).toEqual([140, 80]);
    expect(host.rows[0].cells[0].width).toEqual({ type: "dxa", value: 140 });
    restoreTableMetrics(host, before);
    expect(host.width).toEqual({ type: "pct", value: 100 });
    expect(host.rows[0].cells[0].width).toEqual({ type: "pct", value: 40 });
    expect(host.columns[0].width).toBe(100);
  });

  it("行高至少为拖到的高度，精确行保持精确", () => {
    const host = table();
    const layouter = new TableLayouter(() => {
      const line = new Line();
      line.height = 30;
      return [line];
    });
    applyRowHeight(host, 0, 70);
    layouter.layout(host, { contentWidth: 400, contentHeight: 800, measurer: { measure: () => 0 } } as never);
    expect(host.rows[0].heightRule).toBe("atLeast");
    expect(host.rowHeights[0]).toBe(70);

    host.rows[0].heightRule = "exact";
    applyRowHeight(host, 0, 24);
    layouter.layout(host, { contentWidth: 400, contentHeight: 800, measurer: { measure: () => 0 } } as never);
    expect(host.rows[0].heightRule).toBe("exact");
    expect(host.rowHeights[0]).toBe(24);
  });

  it("撤销恢复拖动前的宽度", () => {
    const host = table();
    const paragraph = new Paragraph(1);
    const before = snapTableMetrics(host);
    applyColumnWidths(host, [140, 80]);
    const after = snapTableMetrics(host);
    restoreTableMetrics(host, before);
    const applied: string[] = [];
    const ctx = {
      relayout: { apply: () => applied.push("layout") },
      afterEdit: () => applied.push("edit"),
    } as unknown as EditContext;
    const command = new TableMetricCommand(ctx, host, { slot: "body" }, paragraph, before, after);
    command.do();
    expect(host.columns[0].width).toBe(140);
    command.undo();
    expect(host.columns[0].width).toBe(100);
    expect(host.width).toEqual({ type: "pct", value: 100 });
    expect(applied).toEqual(["layout", "edit", "layout", "edit"]);
  });
});
