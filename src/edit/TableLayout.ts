import { MIN_ROW_HEIGHT } from "../layout/LayoutConstants";
import { cellDocumentHeight, cellInsets, DEFAULT_CELL_INSETS, headerRowCount } from "../layout/table/TableMetrics";
import type { Table, TableCell, TableInsets } from "../model/table/Table";
import type { TableDirection, TableFunction } from "../model/table/TableFormula";
import type { StoryRef } from "../selection/StoryRef";
import { applyColumnWidths, applyRowHeight, MIN_COLUMN_WIDTH } from "./TableResize";

export type CellHorizontal = "left" | "center" | "right";
export type CellVertical = NonNullable<TableCell["vAlign"]>;
export type TableAutoFit = "contents" | "window" | "fixed";
export type TableSelection = "cell" | "row" | "column" | "table";
export type TableCommandName =
  | "gridlines" | "draw-table" | "erase-table" | "insert-above" | "insert-below" | "insert-left" | "insert-right"
  | "delete-row" | "delete-column" | "delete-table" | "merge" | "split-cells"
  | "split-table" | "distribute-rows" | "distribute-columns" | "repeat-header";

export type TableLayoutAction =
  | { type: TableCommandName }
  | { type: "select"; scope: TableSelection }
  | { type: "align"; horizontal: CellHorizontal; vertical: CellVertical }
  | { type: "direction"; vertical: boolean }
  | { type: "split-selection"; rows: number; columns: number }
  | { type: "autofit"; mode: TableAutoFit }
  | { type: "width" | "height"; pixels: number }
  | { type: "properties"; align?: CellHorizontal; width?: number | null; heightRule?: "auto" | "atLeast" | "exact"; height: number }
  | { type: "margins"; insets: TableInsets }
  | { type: "convert"; separator: "\t" | "，" | "\n" }
  | { type: "formula"; operation: TableFunction; direction: TableDirection };

export interface TableTarget {
  table: Table;
  cells: TableCell[];
  story: StoryRef;
}

export interface TableLayoutState {
  width?: number;
  height?: number;
  rowHeight?: number;
  rowHeightRule: "auto" | "atLeast" | "exact";
  horizontal?: CellHorizontal;
  vertical?: CellVertical;
  verticalText?: boolean;
  tableAlign: CellHorizontal;
  tableWidth?: number;
  margins: TableInsets;
  gridlines: boolean;
  drawing?: "draw-table" | "erase-table";
  formula?: { operation: string; direction: string };
  splitRows: number;
  splitColumns: number;
  repeatHeader: boolean;
  disabled: string[];
}

export function tableAxes(cells: TableCell[]): { rows: number[]; columns: number[] } {
  const rows = new Set<number>();
  const columns = new Set<number>();
  for (const cell of cells) {
    for (let i = 0; i < cell.rowSpan; i += 1) rows.add(cell.rowIndex + i);
    for (let i = 0; i < cell.colSpan; i += 1) columns.add(cell.colIndex + i);
  }
  return { rows: [...rows].sort((a, b) => a - b), columns: [...columns].sort((a, b) => a - b) };
}

export function canMergeCells(cells: TableCell[]): boolean {
  if (cells.length < 2) return false;
  const { rows, columns } = tableAxes(cells);
  const area = (rows.at(-1)! - rows[0] + 1) * (columns.at(-1)! - columns[0] + 1);
  return cells.reduce((sum, cell) => sum + cell.rowSpan * cell.colSpan, 0) === area;
}

export function canSplitTable(table: Table, row: number): boolean {
  return !table.anchorType && row > 0 && row < table.rows.length &&
    table.rows.slice(0, row).every((item) => item.cells.every((cell) => cell.rowIndex + cell.rowSpan <= row));
}

export function inspectTableLayout(target: TableTarget, gridlines: boolean): TableLayoutState {
  const { table, cells } = target;
  const { rows, columns } = tableAxes(cells);
  const cell = cells[0];
  const row = table.rows[rows[0]];
  const horizontal = common(cells.flatMap((item) => item.document.paragraphs.toArray()
    .filter((p) => !p.isTable).map((p) => horizontalAlign(p.attrs.textAlign))));
  const vertical = common(cells.map((item) => item.vAlign ?? "top"));
  const repeatHeader = rows[0] === 0 && (rows.at(-1) ?? 0) < headerRowCount(table);
  const disabled: string[] = [];
  if (!canMergeCells(cells)) disabled.push("merge");
  if (cells.length !== 1) disabled.push("split-selection");
  if (cells.length !== 1) disabled.push("formula");
  if (cells.some((item) => item.document.paragraphs.each(({ data }) => data.isTable || data.blocks.some((block) => !!block.drawing)))) {
    disabled.push("direction:vertical");
  }
  if (!canSplitTable(table, rows[0])) disabled.push("split-table");
  if (rows.length >= table.rows.length) disabled.push("delete-row");
  if (columns.length >= table.columnWidths.length) disabled.push("delete-column");
  if (table.rows.length < 2) disabled.push("distribute-rows");
  if (table.columnWidths.length < 2) disabled.push("distribute-columns");
  if (rows[0] !== 0 || !canRepeatHeader(table, (rows.at(-1) ?? 0) + 1)) disabled.push("repeat-header");
  if (table.rows.length - headerRowCount(table) < 2 || table.rows.some((item) => item.cells.some((c) => c.rowSpan > 1))) {
    disabled.push("sort");
  }
  if (table.anchorType) disabled.push("convert", "delete-table");
  return {
    width: common(columns.map((i) => table.columnWidths[i])),
    height: common(rows.map((i) => table.rowHeights[i])),
    rowHeight: row?.height || undefined,
    rowHeightRule: row?.heightRule ?? "auto",
    horizontal,
    vertical,
    verticalText: common(cells.map((item) => !!item.textDirection)),
    tableAlign: horizontalAlign(table.align) ?? "left",
    tableWidth: table.columnWidths.reduce((sum, width) => sum + width, 0),
    margins: table.cellMargin ?? DEFAULT_CELL_INSETS,
    gridlines,
    formula: cells.length === 1 ? formulaPreset(cell) : undefined,
    splitRows: cell.rowSpan,
    splitColumns: cell.colSpan > 1 || cell.rowSpan > 1 ? cell.colSpan : 2,
    repeatHeader,
    disabled,
  };
}

export function applyTableDimensions(target: TableTarget, action: TableLayoutAction, availableWidth: number): boolean {
  const { table, cells } = target;
  const { rows, columns } = tableAxes(cells);
  switch (action.type) {
    case "width":
      if (!positive(action.pixels)) return false;
      applyColumnWidths(table, table.columnWidths.map((width, i) => columns.includes(i) ? Math.max(MIN_COLUMN_WIDTH, action.pixels) : width));
      break;
    case "height":
      if (!positive(action.pixels)) return false;
      for (const i of rows) applyRowHeight(table, i, Math.max(MIN_ROW_HEIGHT, action.pixels));
      break;
    case "distribute-columns": {
      const chosen = columns.length > 1 ? columns : table.columnWidths.map((_, i) => i);
      const mean = average(chosen.map((i) => table.columnWidths[i]));
      applyColumnWidths(table, table.columnWidths.map((width, i) => chosen.includes(i) ? mean : width));
      break;
    }
    case "distribute-rows": {
      const chosen = rows.length > 1 ? rows : table.rows.map((_, i) => i);
      let height = average(chosen.map((i) => table.rowHeights[i]));
      for (const i of chosen) {
        for (const cell of table.rows[i].cells) {
          const margin = cellInsets(table, cell);
          const content = cellDocumentHeight(cell.document) + margin.top + margin.bottom;
          height = Math.max(height, content / cell.rowSpan);
        }
      }
      for (const i of chosen) applyRowHeight(table, i, height);
      break;
    }
    case "autofit":
      applyColumnWidths(table, action.mode === "contents" ? contentWidths(table, availableWidth) : table.columnWidths);
      table.layout = action.mode === "fixed" ? "fixed" : "autofit";
      if (action.mode === "window") {
        table.width = { type: "pct", value: 100 };
        table.indent = undefined;
      }
      break;
    case "align":
      for (const cell of cells) {
        cell.vAlign = action.vertical;
        cell.document.paragraphs.each(({ data }) => {
          if (!data.isTable) {
            data.attrs = { ...data.attrs, textAlign: action.horizontal };
            data.changed = true;
          }
        });
      }
      break;
    case "direction":
      for (const cell of cells) cell.textDirection = action.vertical ? "tbRlV" : undefined;
      break;
    case "margins":
      if (!Object.values(action.insets).every((n) => Number.isFinite(n) && n >= 0)) return false;
      table.cellMargin = { ...action.insets };
      for (const cell of cells) cell.margin = undefined;
      break;
    case "properties": {
      if (!action.align && action.width === undefined && !action.heightRule) return false;
      if ((action.width != null && !positive(action.width))
        || (action.heightRule && action.heightRule !== "auto" && !positive(action.height))) return false;
      if (action.align) table.align = action.align;
      const width = action.width;
      if (width === null) {
        table.width = undefined;
      } else if (width !== undefined) {
        const total = table.columnWidths.reduce((sum, width) => sum + width, 0);
        if (total > 0 && Math.abs(total - width) >= 0.5) {
          applyColumnWidths(table, table.columnWidths.map((column) => column * (width / total)));
        }
      }
      if (action.heightRule) {
        for (const i of rows) {
          table.rows[i].heightRule = action.heightRule;
          table.rows[i].height = action.heightRule === "auto" ? 0 : action.height;
        }
      }
      break;
    }
    case "repeat-header": {
      const count = (rows.at(-1) ?? 0) + 1;
      const clear = count <= headerRowCount(table);
      if (rows[0] !== 0 || (!clear && !canRepeatHeader(table, count))) return false;
      table.rows.forEach((row, i) => { row.header = !clear && i < count; });
      break;
    }
    default:
      return false;
  }
  return true;
}

export function tablePlainText(table: Table, separator: string): string {
  return table.rows.map((row) => {
    const columns = Array<string>(table.columnWidths.length).fill("");
    for (const cell of row.cells) {
      columns[cell.colIndex] = cell.document.paragraphs.toArray()
        .map((p) => p.table ? tablePlainText(p.table, separator) : p.getFullText()).join("\n");
    }
    return columns.join(separator);
  }).join("\n");
}

function canRepeatHeader(table: Table, count: number): boolean {
  return count < table.rows.length && table.rows.slice(0, count)
    .every((row) => row.cells.every((cell) => cell.rowIndex + cell.rowSpan <= count));
}

function formulaPreset(cell: TableCell): { operation: string; direction: string } {
  const first = cell.document.words.head?.data.block;
  const match = first?.fieldInstr?.match(/^=\s*(\w+)\((\w+)\)$/i);
  return match
    ? { operation: match[1].toUpperCase(), direction: match[2].toUpperCase() }
    : { operation: "SUM", direction: cell.rowIndex > 0 ? "ABOVE" : "LEFT" };
}

function contentWidths(table: Table, availableWidth: number): number[] {
  const widths = table.columnWidths.map(() => MIN_COLUMN_WIDTH);
  for (const row of table.rows) {
    for (const cell of row.cells) {
      let line = 0;
      let widest = 0;
      cell.document.words.each(({ data }) => {
        if (data.isEnterChar() || data.char === "\v") {
          widest = Math.max(widest, line);
          line = 0;
        } else if (data.kind === "table" && data.table) {
          widest = Math.max(widest, data.table.columnWidths.reduce((sum, width) => sum + width, 0));
        } else {
          line += data.width;
        }
      });
      const margin = cellInsets(table, cell);
      const wanted = Math.max(widest, line) + margin.left + margin.right + 2;
      const indexes = Array.from({ length: cell.colSpan }, (_, i) => cell.colIndex + i);
      const existing = indexes.reduce((sum, i) => sum + widths[i], 0);
      const extra = Math.max(0, wanted - existing) / indexes.length;
      for (const i of indexes) widths[i] += extra;
    }
  }
  const total = widths.reduce((sum, width) => sum + width, 0);
  const minimum = widths.length * MIN_COLUMN_WIDTH;
  if (total <= availableWidth || total === minimum) return widths;
  const ratio = Math.max(0, availableWidth - minimum) / (total - minimum);
  return widths.map((width) => MIN_COLUMN_WIDTH + (width - MIN_COLUMN_WIDTH) * ratio);
}

function horizontalAlign(value: string | undefined): CellHorizontal | undefined {
  if (value === "center") return "center";
  if (value === "right" || value === "end") return "right";
  if (value === "left" || value === "start" || !value) return "left";
  return undefined;
}

function common<T>(values: T[]): T | undefined {
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
