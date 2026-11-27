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
    const vertical: TableCell[] = [];

    for (const row of table.rows) {
      for (const cell of row.cells) {
        const width = this.cellWidth(cell, widths);
        const margin = cellInsets(table, cell);
        if (cell.document.words.length === 0) {
          words.buildStoryOnly(cell.document);
        }
        if (cell.textDirection) {
          vertical.push(cell);
          continue;
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
    for (const cell of vertical) {
      const row = table.rows[cell.rowIndex];
      if (row.heightRule === "exact") continue;
      const margin = cellInsets(table, cell);
      const current = this.sumRange(rowHeights, cell.rowIndex, cell.rowSpan);
      const width = this.cellWidth(cell, widths);
      const available = row.height > 0 ? current : Math.max(current, Math.min(constraints.contentHeight, width * 2));
      const laid = this.layoutCell(cell.document, Math.max(20, available - margin.top - margin.bottom));
      const advance = laid.reduce((max, line) => Math.max(max, line.totalCharWidth + line.leftBlankWidth), 0);
      rowHeights[cell.rowIndex] += Math.max(0, advance + margin.top + margin.bottom - current);
    }
    for (const cell of vertical) {
      const margin = cellInsets(table, cell);
      const height = this.sumRange(rowHeights, cell.rowIndex, cell.rowSpan);
      this.layoutCell(cell.document, Math.max(20, height - margin.top - margin.bottom));
    }
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
