import type { Table, TableCell } from "../../model/table/Table";

export interface TableCellBox {
  cell: TableCell;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class TableGeometry {
  boxesInSlice(table: Table, from: number, to: number, originX: number, originY: number): TableCellBox[] {
    const boxes: TableCellBox[] = [];
    const widths = table.columnWidths;
    const heights = table.rowHeights;
    const sliceEnd = to || table.rows.length;

    for (const row of table.rows) {
      for (const cell of row.cells) {
        const start = cell.rowIndex;
        const end = start + Math.max(1, cell.rowSpan);
        if (end <= from || start >= sliceEnd) {
          continue;
        }
        boxes.push({
          cell,
          x: originX + this.offsetX(widths, cell.colIndex),
          y: originY + this.offsetY(heights, from, start),
          width: this.span(widths, cell.colIndex, cell.colSpan),
          height: this.span(heights, start, Math.max(1, cell.rowSpan)),
        });
      }
    }
    return boxes;
  }

  sliceHeight(table: Table, from: number, to: number): number {
    return this.span(table.rowHeights, from, Math.max(0, to - from));
  }

  private offsetX(widths: number[], colIndex: number): number {
    return this.span(widths, 0, colIndex);
  }

  private offsetY(heights: number[], sliceFrom: number, rowIndex: number): number {
    if (rowIndex >= sliceFrom) {
      return this.span(heights, sliceFrom, rowIndex - sliceFrom);
    }
    return -this.span(heights, rowIndex, sliceFrom - rowIndex);
  }

  private span(sizes: number[], start: number, count: number): number {
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      sum += sizes[start + i] ?? 0;
    }
    return sum;
  }
}
