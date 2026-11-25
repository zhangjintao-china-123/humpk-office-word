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
    const boxes = this.placeSlice(table, from, to, headerRows, originX, originY, clipTop);
    if (sliceHeight == null) {
      return boxes;
    }
    return boxes.map((box) => {
      const top = Math.max(box.y, originY);
      const bottom = Math.min(box.y + box.height, originY + sliceHeight);
      return { ...box, visibleY: top, visibleHeight: Math.max(0, bottom - top) };
    });
  }

  private placeSlice(
    table: Table,
    from: number,
    to: number,
    headerRows: number,
    originX: number,
    originY: number,
    clipTop: number,
  ): TableCellBox[] {
    if (headerRows <= 0) {
      return this.shiftY(this.boxesInSlice(table, from, to, originX, originY), clipTop);
    }
    const headerH = this.span(table.rowHeights, 0, headerRows);
    const header = this.boxesInSlice(table, 0, headerRows, originX, originY).map((box) => {
      const room = headerH - (box.y - originY);
      return { ...box, height: Math.min(box.height, Math.max(0, room)) };
    });
    const body = this.shiftY(
      this.boxesInSlice(table, from, to, originX, originY + headerH).filter((box) => box.cell.rowIndex >= from),
      clipTop,
    );
    return [...header, ...body];
  }

  private shiftY(boxes: TableCellBox[], clipTop: number): TableCellBox[] {
    if (clipTop <= 0) {
      return boxes;
    }
    return boxes.map((box) => ({ ...box, y: box.y - clipTop }));
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
