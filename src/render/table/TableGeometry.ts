import type { Table, TableCell } from "../../model/table/Table";

export interface TableCellBox {
  cell: TableCell;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 这一页版心里实际露出来的顶边。格子本身可以高出这一片，用来接着画后面的字。 */
  visibleY?: number;
  visibleHeight?: number;
}

export function cellVisibleRect(box: TableCellBox): { x: number; y: number; width: number; height: number } {
  return {
    x: box.x,
    y: box.visibleY ?? box.y,
    width: box.width,
    height: box.visibleHeight ?? box.height,
  };
}

export function clipCellBox(box: TableCellBox, top: number, bottom: number): TableCellBox | null {
  const visible = cellVisibleRect(box);
  const visibleY = Math.max(visible.y, top);
  const visibleHeight = Math.min(visible.y + visible.height, bottom) - visibleY;
  return visibleHeight > 0 ? { ...box, visibleY, visibleHeight } : null;
}

export class TableGeometry {
  boxesForSlice(
    table: Table,
    from: number,
    to: number,
    headerRows: number,
    originX: number,
    originY: number,
    clipTop = 0,
    sliceHeight?: number,
  ): TableCellBox[] {
    const bottom = originY + (sliceHeight ?? Infinity);
    const bodyTop = originY + this.sliceHeight(table, 0, headerRows);
    const clip = (boxes: TableCellBox[], top: number, end: number) =>
      boxes.map((box) => clipCellBox(box, top, end)).filter((box) => box !== null);
    const header = headerRows ? clip(this.boxesInSlice(table, 0, headerRows, originX, originY), originY, Math.min(bodyTop, bottom)) : [];
    const body = clip(this.boxesInSlice(table, from, to, originX, bodyTop - clipTop), bodyTop, bottom);
    return [...header, ...body];
  }

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
