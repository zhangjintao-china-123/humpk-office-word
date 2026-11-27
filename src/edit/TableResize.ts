import type { Paragraph } from "../model/block/Paragraph";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import { TableColumn, type Table, type TableCell, type TableInsets, type TableLength, type TableRow } from "../model/table/Table";
import { MIN_ROW_HEIGHT } from "../layout/LayoutConstants";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

/** 再窄就放不下一个字，也盖不住单元格左右边距。 */
export const MIN_COLUMN_WIDTH = 28;

export interface TableMetricSnap {
  width?: TableLength;
  indent?: TableLength;
  align?: string;
  layout?: Table["layout"];
  columns: number[];
  cells: { cell: TableCell; width?: TableLength }[];
  rows: { row: TableRow; height: number; heightRule?: TableRow["heightRule"] }[];
  alignment?: {
    cells: { cell: TableCell; vAlign: TableCell["vAlign"] }[];
    paragraphs: { paragraph: Paragraph; attrs: ParagraphAttrs }[];
  };
  margins?: { table?: TableInsets; cells: { cell: TableCell; margin?: TableInsets }[] };
  headers?: boolean[];
  directions?: { cell: TableCell; textDirection: TableCell["textDirection"] }[];
}

export type ColumnResizeMode = "move" | "pair" | "share" | "left";

export function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

export function sameWidths(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((width, index) => nearlyEqual(width, b[index] ?? 0));
}

export function snapTableMetrics(table: Table, option?: "align" | "margins" | "repeat-header" | "direction"): TableMetricSnap {
  const snap: TableMetricSnap = {
    width: copyLength(table.width),
    indent: copyLength(table.indent),
    align: table.align,
    layout: table.layout,
    columns: table.columns.map((column) => column.width),
    cells: table.rows.flatMap((row) => row.cells.map((cell) => ({ cell, width: copyLength(cell.width) }))),
    rows: table.rows.map((row) => ({ row, height: row.height, heightRule: row.heightRule })),
  };
  if (option === "align") {
    snap.alignment = {
      cells: snap.cells.map(({ cell }) => ({ cell, vAlign: cell.vAlign })),
      paragraphs: snap.cells.flatMap(({ cell }) => cell.document.paragraphs.toArray()
        .filter((paragraph) => !paragraph.isTable)
        .map((paragraph) => ({ paragraph, attrs: paragraph.attrs }))),
    };
  } else if (option === "margins") {
    snap.margins = { table: table.cellMargin, cells: snap.cells.map(({ cell }) => ({ cell, margin: cell.margin })) };
  } else if (option === "repeat-header") {
    snap.headers = table.rows.map((row) => row.header);
  } else if (option === "direction") {
    snap.directions = snap.cells.map(({ cell }) => ({ cell, textDirection: cell.textDirection }));
  }
  return snap;
}

export function restoreTableMetrics(table: Table, snap: TableMetricSnap): void {
  table.width = copyLength(snap.width);
  table.indent = copyLength(snap.indent);
  table.align = snap.align;
  table.layout = snap.layout;
  table.columns = snap.columns.map((width) => {
    const column = new TableColumn();
    column.width = width;
    return column;
  });
  for (const item of snap.cells) {
    item.cell.width = copyLength(item.width);
  }
  for (const item of snap.rows) {
    item.row.height = item.height;
    item.row.heightRule = item.heightRule;
  }
  for (const { cell, vAlign } of snap.alignment?.cells ?? []) cell.vAlign = vAlign;
  for (const { paragraph, attrs } of snap.alignment?.paragraphs ?? []) {
    if (paragraph.attrs !== attrs) {
      paragraph.attrs = attrs;
      paragraph.changed = true;
    }
  }
  if (snap.margins) {
    table.cellMargin = snap.margins.table;
    for (const { cell, margin } of snap.margins.cells) cell.margin = margin;
  }
  snap.headers?.forEach((header, i) => { table.rows[i].header = header; });
  for (const { cell, textDirection } of snap.directions ?? []) cell.textDirection = textDirection;
}

/**
 * 竖线拖动。move 只改线左边的列，右边各列原样跟着平移。
 * pair 是按住 Shift：和右边那一列对调宽度，表的总宽不动。
 * share 是按住 Ctrl：线右边的列按原比例分掉剩下的宽度，总宽不动。
 * left 拖表的左外框：左缘跟着走，第一列反向变化，右边的列停在原地。
 */
export function resizedColumns(
  widths: number[],
  index: number,
  delta: number,
  mode: ColumnResizeMode,
  indent: number,
): { widths: number[]; indent: number } {
  if (!widths.length || index < 0 || index >= widths.length) {
    return { widths: widths.slice(), indent };
  }
  if (mode === "left") {
    const edge = movedLeftEdge(widths[0] ?? MIN_COLUMN_WIDTH, indent, delta);
    const next = widths.slice();
    next[0] = edge.width;
    return { widths: next, indent: edge.indent };
  }
  if (mode === "pair" && index < widths.length - 1) {
    return { widths: pairedColumn(widths, index, delta), indent };
  }
  if (mode === "share" && index < widths.length - 1) {
    return { widths: sharedColumn(widths, index, delta), indent };
  }
  return { widths: movedColumn(widths, index, delta), indent };
}

export function resizedRow(start: number, delta: number): number {
  return Math.max(MIN_ROW_HEIGHT, start + delta);
}

/** 把拖完的宽度写成 dxa，下次排版才不会按表格总宽再摊回去。 */
export function applyColumnWidths(table: Table, widths: number[], indent?: number): void {
  table.columns = widths.map((width) => {
    const column = new TableColumn();
    column.width = width;
    return column;
  });
  table.columnWidths = widths.slice();
  const total = widths.reduce((sum, width) => sum + width, 0);
  table.width = { type: "dxa", value: total };
  if (indent != null) {
    table.align = "left";
    table.indent = { type: "dxa", value: Math.max(0, indent) };
  }
  for (const row of table.rows) {
    for (const cell of row.cells) {
      cell.width = { type: "dxa", value: spanWidth(widths, cell.colIndex, cell.colSpan) };
    }
  }
}

/** exact 保持固定高度；其余改成至少这么高，内容更高时仍由内容撑开。 */
export function applyRowHeight(table: Table, index: number, height: number): void {
  const row = table.rows[index];
  if (!row) {
    return;
  }
  row.height = height;
  if (row.heightRule !== "exact") {
    row.heightRule = "atLeast";
  }
}

export class TableMetricCommand implements EditCommand {
  constructor(
    private readonly ctx: EditContext,
    private readonly table: Table,
    private readonly story: StoryRef,
    private readonly paragraph: Paragraph,
    private readonly before: TableMetricSnap,
    private readonly after: TableMetricSnap,
  ) {}

  do(): void {
    restoreTableMetrics(this.table, this.after);
    this.finish();
  }

  undo(): void {
    restoreTableMetrics(this.table, this.before);
    this.finish();
  }

  private finish(): void {
    const impact = new EditImpact(this.story, [this.paragraph]);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }
}

function movedColumn(start: number[], index: number, delta: number): number[] {
  const next = start.slice();
  next[index] = Math.max(MIN_COLUMN_WIDTH, (start[index] ?? MIN_COLUMN_WIDTH) + delta);
  return next;
}

function pairedColumn(start: number[], index: number, delta: number): number[] {
  const next = start.slice();
  const roomRight = (start[index + 1] ?? MIN_COLUMN_WIDTH) - MIN_COLUMN_WIDTH;
  const roomLeft = (start[index] ?? MIN_COLUMN_WIDTH) - MIN_COLUMN_WIDTH;
  const grow = Math.min(Math.max(delta, -roomLeft), Math.max(0, roomRight));
  next[index] = (start[index] ?? MIN_COLUMN_WIDTH) + grow;
  next[index + 1] = (start[index + 1] ?? MIN_COLUMN_WIDTH) - grow;
  return next;
}

function sharedColumn(start: number[], index: number, delta: number): number[] {
  const right = start.slice(index + 1);
  const rightSum = right.reduce((sum, width) => sum + width, 0);
  const maxGrow = rightSum - MIN_COLUMN_WIDTH * right.length;
  const minGrow = MIN_COLUMN_WIDTH - (start[index] ?? MIN_COLUMN_WIDTH);
  const grow = Math.min(Math.max(delta, minGrow), Math.max(0, maxGrow));
  const next = start.slice();
  next[index] = (start[index] ?? MIN_COLUMN_WIDTH) + grow;
  const distributed = fitColumns(right, rightSum - grow);
  for (let i = 0; i < distributed.length; i += 1) {
    next[index + 1 + i] = distributed[i];
  }
  return next;
}

function movedLeftEdge(width: number, indent: number, delta: number): { width: number; indent: number } {
  const maxMove = width - MIN_COLUMN_WIDTH;
  const minMove = -Math.max(0, indent);
  const move = Math.min(Math.max(delta, minMove), Math.max(0, maxMove));
  return { width: width - move, indent: Math.max(0, indent) + move };
}

function fitColumns(start: number[], total: number): number[] {
  const count = start.length;
  if (!count) {
    return [];
  }
  const minSum = MIN_COLUMN_WIDTH * count;
  const goal = Math.max(minSum, total);
  const flex = start.map((width) => Math.max(0, width - MIN_COLUMN_WIDTH));
  const flexSum = flex.reduce((sum, width) => sum + width, 0);
  const extra = goal - minSum;
  if (flexSum <= 0) {
    const each = goal / count;
    return start.map(() => each);
  }
  return flex.map((width) => MIN_COLUMN_WIDTH + (extra * width) / flexSum);
}

function spanWidth(widths: number[], start: number, span: number): number {
  let total = 0;
  for (let index = 0; index < Math.max(1, span); index += 1) {
    total += widths[start + index] ?? 0;
  }
  return total;
}

function copyLength(length: TableLength | undefined): TableLength | undefined {
  return length ? { type: length.type, value: length.value } : undefined;
}
