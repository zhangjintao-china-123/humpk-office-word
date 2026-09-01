import type { Table, TableBorder, TableBorders, TableCell } from "../../model/table/Table";
import { ptToPx } from "../../shared/units";

export type TableEdge = "top" | "left" | "bottom" | "right";

const NONE = new Set(["nil", "none"]);

/** 把 OOXML 边框换成绘制参数；无显式边框时回退到 Table Grid 的 0.5 磅黑线。 */
export class TableBorderResolve {
  static readonly DEFAULT: TableBorder = { type: "single", size: "4", color: "#000000" };

  visible(border?: TableBorder): boolean {
    return !!border?.type && !NONE.has(border.type);
  }

  widthPx(border?: TableBorder): number {
    if (!this.visible(border)) {
      return 0;
    }
    const eighths = Number(border?.size);
    const pt = Number.isFinite(eighths) && eighths > 0 ? eighths / 8 : 0.5;
    return Math.max(0.5, ptToPx(pt));
  }

  dash(border?: TableBorder): number[] {
    const type = border?.type;
    if (type === "dashed") {
      return [3, 2];
    }
    if (type === "dotted") {
      return [1, 1];
    }
    return [];
  }

  color(border?: TableBorder): string {
    return border?.color || "#000000";
  }

  cellEdge(table: Table, cell: TableCell, side: TableEdge): TableBorder | undefined {
    const own = cell.borders?.[side];
    if (own) {
      return own;
    }
    const fromTable = this.tableEdge(table, cell, side);
    if (fromTable) {
      return fromTable;
    }
    if (!table.borders) {
      return TableBorderResolve.DEFAULT;
    }
    return undefined;
  }

  diagonal(table: Table, cell: TableCell, side: "tl2br" | "tr2bl"): TableBorder | undefined {
    return cell.borders?.[side] ?? table.borders?.[side];
  }

  tableEdge(table: Table, cell: TableCell, side: TableEdge): TableBorder | undefined {
    const borders = table.borders;
    if (!borders) {
      return undefined;
    }
    if (this.isOuter(table, cell, side)) {
      return borders[side];
    }
    return side === "top" || side === "bottom" ? borders.insideH : borders.insideV;
  }

  isOuter(table: Table, cell: TableCell, side: TableEdge): boolean {
    const cols = table.columnWidths.length || table.columns.length;
    const rows = table.rows.length;
    if (side === "top") {
      return cell.rowIndex === 0;
    }
    if (side === "bottom") {
      return cell.rowIndex + Math.max(1, cell.rowSpan) >= rows;
    }
    if (side === "left") {
      return cell.colIndex === 0;
    }
    return cell.colIndex + Math.max(1, cell.colSpan) >= cols;
  }
}

export function cloneBorders(borders?: TableBorders): TableBorders | undefined {
  if (!borders) {
    return undefined;
  }
  const next: TableBorders = {};
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV", "tl2br", "tr2bl"] as const) {
    const item = borders[side];
    if (item) {
      next[side] = { ...item };
    }
  }
  return next;
}
