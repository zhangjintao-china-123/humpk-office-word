import type { Document } from "../../model/document/Document";
import { Line } from "../../model/line/Line";
import type { Table, TableCell } from "../../model/table/Table";
import { WordStreamBuilder } from "../../model/flatten/WordStreamBuilder";
import { MIN_ROW_HEIGHT } from "../LayoutConstants";
import type { LayoutConstraints } from "../LayoutConstraints";
import { cellDocumentHeight, cellInsets, resolveColumnWidths } from "./TableMetrics";

export class TableLayouter {
  constructor(private readonly layoutCell: (document: Document, width: number) => Line[]) {}

  layout(table: Table, constraints: LayoutConstraints): void {
    const widths = resolveColumnWidths(table, constraints.contentWidth);
    table.columnWidths = widths;
    const words = new WordStreamBuilder();
    const rowHeights = table.rows.map((row) => (row.heightRule === "exact" && row.height > 0 ? row.height : MIN_ROW_HEIGHT));

    for (const row of table.rows) {
      for (const cell of row.cells) {
        const width = this.cellWidth(cell, widths);
        const margin = cellInsets(table, cell);
        if (cell.document.words.length === 0) {
          words.buildStoryOnly(cell.document);
        }
        this.layoutCell(cell.document, Math.max(20, width - margin.left - margin.right));
        const content = cellDocumentHeight(cell.document);
        const spanned = Math.max(1, cell.rowSpan);
        const start = table.rows[cell.rowIndex];
        if (start?.heightRule === "exact") {
          continue;
        }
        const extra = Math.max(0, content + margin.top + margin.bottom - this.sumRange(rowHeights, cell.rowIndex, spanned));
        if (extra > 0) {
          rowHeights[cell.rowIndex] += extra;
        }
      }
    }
    table.rows.forEach((row, index) => {
      if (row.heightRule === "atLeast" && row.height > rowHeights[index]) {
        rowHeights[index] = row.height;
      }
    });
    table.rowHeights = rowHeights;
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
