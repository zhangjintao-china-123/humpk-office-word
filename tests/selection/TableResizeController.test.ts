import { describe, expect, it } from "vitest";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { applyColumnWidths, applyRowHeight, restoreTableMetrics } from "../../src/edit/TableResize";
import { TableResizeController } from "../../src/selection/TableResizeController";
import type { TableGuide } from "../../src/selection/TableGuides";

function hostTable(): Table {
  const table = new Table();
  table.width = { type: "pct", value: 100 };
  table.columns = [100, 80].map((width) => {
    const column = new TableColumn();
    column.width = width;
    return column;
  });
  table.columnWidths = [100, 80];
  table.rowHeights = [40];
  const row = new TableRow();
  const cell = new TableCell(new Document());
  row.cells = [cell];
  table.rows = [row];
  return table;
}

function guide(table: Table, kind: TableGuide["kind"], index = 0): TableGuide {
  const paragraph = new Paragraph(1);
  paragraph.isTable = true;
  paragraph.table = table;
  return {
    table,
    story: { slot: "body" },
    paragraph,
    kind,
    index,
    size: kind === "row" ? 40 : table.columnWidths[index] ?? 0,
    widths: table.columnWidths.slice(),
    indent: kind === "left" ? 20 : 0,
  };
}

function dispatch(el: HTMLElement, type: string, x: number, y: number, extra: PointerEventInit = {}): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1, ...extra }));
}

function mount(source: TableGuide) {
  const el = document.createElement("div");
  const calls: string[] = [];
  const controller = new TableResizeController({
    clientToWorld: (x, y) => ({ x, y }),
    zoom: () => 1,
    guideAt: (x, y) => {
      if (source.kind === "row") {
        return Math.abs(y - 80) <= 5 ? source : null;
      }
      return Math.abs(x - 100) <= 5 ? source : null;
    },
    previewColumns: (item, widths, indent, adjustIndent) => {
      applyColumnWidths(item.table, widths, adjustIndent ? indent : undefined);
      calls.push("preview");
    },
    previewRow: (item, height) => {
      applyRowHeight(item.table, item.index, height);
      item.table.rowHeights[item.index] = Math.max(item.size, height);
      calls.push("preview");
    },
    commit: () => calls.push("commit"),
    revert: (item, before) => {
      restoreTableMetrics(item.table, before);
      calls.push("revert");
    },
  });
  controller.attach(el);
  return { el, calls, controller };
}

describe("TableResizeController", () => {
  it("点在格线上不开始选字，松开后记下这次调整", () => {
    const source = guide(hostTable(), "column");
    const { el, calls } = mount(source);
    let bubbled = false;
    el.addEventListener("pointerdown", () => {
      bubbled = true;
    });
    dispatch(el, "pointerdown", 10, 20);
    expect(bubbled).toBe(true);
    bubbled = false;
    dispatch(el, "pointerdown", 100, 20);
    expect(bubbled).toBe(false);
    dispatch(el, "pointermove", 150, 20);
    dispatch(el, "pointerup", 150, 20);
    expect(calls).toEqual(["preview", "commit"]);
    expect(source.table.columns[0].width).toBe(150);
    expect(source.table.columns[1].width).toBe(80);
    expect(el.style.cursor).toBe("");
  });

  it("按住 Shift 拖动时总宽不变", () => {
    const source = guide(hostTable(), "column");
    const { el } = mount(source);
    dispatch(el, "pointerdown", 100, 20);
    dispatch(el, "pointermove", 130, 20, { shiftKey: true });
    dispatch(el, "pointerup", 130, 20);
    expect(source.table.columnWidths).toEqual([130, 50]);
  });

  it("拖回原处不记入撤销", () => {
    const source = guide(hostTable(), "column");
    const { el, calls } = mount(source);
    dispatch(el, "pointerdown", 100, 20);
    dispatch(el, "pointermove", 140, 20);
    dispatch(el, "pointermove", 100, 20);
    dispatch(el, "pointerup", 100, 20);
    expect(calls).toEqual(["preview", "preview", "revert"]);
    expect(source.table.width).toEqual({ type: "pct", value: 100 });
  });

  it("拖横线加高上面那一行，往上拖不进内容时松开后恢复", () => {
    const source = guide(hostTable(), "row");
    const { el, calls } = mount(source);
    dispatch(el, "pointerdown", 20, 80);
    dispatch(el, "pointermove", 20, 110);
    dispatch(el, "pointerup", 20, 110);
    expect(source.table.rows[0].height).toBe(70);
    expect(source.table.rows[0].heightRule).toBe("atLeast");
    expect(calls.at(-1)).toBe("commit");

    const shrink = guide(hostTable(), "row");
    const again = mount(shrink);
    dispatch(again.el, "pointerdown", 20, 80);
    dispatch(again.el, "pointermove", 20, 40);
    dispatch(again.el, "pointerup", 20, 40);
    expect(again.calls).toContain("revert");
    expect(shrink.table.rows[0].heightRule).toBeUndefined();
  });

  it("拖动中按 Esc 恢复", () => {
    const source = guide(hostTable(), "column");
    const { el, calls } = mount(source);
    dispatch(el, "pointerdown", 100, 20);
    dispatch(el, "pointermove", 160, 20);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    dispatch(el, "pointerup", 160, 20);
    expect(calls).toEqual(["preview", "revert"]);
    expect(source.table.width?.type).toBe("pct");
  });

  it("靠近格线时换成调整光标", () => {
    const source = guide(hostTable(), "row");
    const { el } = mount(source);
    dispatch(el, "pointermove", 20, 80);
    expect(el.style.cursor).toBe("row-resize");
    dispatch(el, "pointermove", 20, 20);
    expect(el.style.cursor).toBe("");
  });
});
