import type { Document } from "../../model/document/Document";
import { Line } from "../../model/line/Line";
import type { Table, TableCell } from "../../model/table/Table";
import { WordStreamBuilder } from "../../model/flatten/WordStreamBuilder";
import { CELL_PAD, MIN_ROW_HEIGHT } from "../LayoutConstants";
import type { LayoutConstraints } from "../LayoutConstraints";

export class TableLayouter {
  constructor(private readonly layoutCell: (document: Document, width: number) => Line[]) {}

  layout(table: Table, constraints: LayoutConstraints): void {
    const widths = this.resolveColumns(table, constraints.contentWidth);
    table.columnWidths = widths;
    const words = new WordStreamBuilder();
    const rowHeights = table.rows.map(() => MIN_ROW_HEIGHT);

    for (const row of table.rows) {
      for (const cell of row.cells) {
        const width = this.cellWidth(cell, widths);
        if (cell.document.words.length === 0) {
          words.buildStoryOnly(cell.document);
        }
        const lines = this.layoutCell(cell.document, Math.max(20, width - CELL_PAD * 2));
        const content = lines.reduce((sum, line) => sum + line.height, 0);
        const spanned = Math.max(1, cell.rowSpan);
        const extra = Math.max(0, content + CELL_PAD * 2 - this.sumRange(rowHeights, cell.rowIndex, spanned));
        if (extra > 0) {
          rowHeights[cell.rowIndex] += extra;
        }
      }
    }
    table.rowHeights = rowHeights;
  }

  private resolveColumns(table: Table, contentWidth: number): number[] {
    if (table.columns.length === 0) {
      return [contentWidth];
    }
    const raw = table.columns.map((column) => column.width);
    const total = raw.reduce((sum, width) => sum + width, 0);
    if (total <= 0) {
      return raw.map(() => contentWidth / raw.length);
    }
    if (total <= contentWidth) {
      return raw;
    }
    const scale = contentWidth / total;
    return raw.map((width) => width * scale);
  }

  private cellWidth(cell: TableCell, widths: number[]): number {
    let width = 0;
    for (let i = 0; i < cell.colSpan; i += 1) {
      width += widths[cell.colIndex + i] ?? 0;
    }
    return width;
  }

  private sumRange(heights: number[], start: number, count: number): number {
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      sum += heights[start + i] ?? 0;
    }
    return sum;
  }
}
