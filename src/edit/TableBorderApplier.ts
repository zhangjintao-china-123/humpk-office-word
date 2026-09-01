import type { Table, TableBorder, TableBorderSide, TableCell } from "../model/table/Table";
import { cloneBorders, TableBorderResolve } from "../render/table/TableBorderResolve";

export type TableBorderMode =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "none"
  | "all"
  | "outside"
  | "inside"
  | "insideH"
  | "insideV"
  | "tl2br"
  | "tr2bl";

export interface TableBorderPen {
  type: string;
  size: string;
  color: string;
}

export interface TableBorderFlags {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
  outside: boolean;
  inside: boolean;
  insideH: boolean;
  insideV: boolean;
  all: boolean;
  tl2br: boolean;
  tr2bl: boolean;
}

interface CellBox {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

const NIL: TableBorder = { type: "nil" };

export class TableBorderApplier {
  private readonly resolve = new TableBorderResolve();

  apply(cells: TableCell[], table: Table, mode: TableBorderMode, pen: TableBorderPen): void {
    const flags = this.inspect(cells, table);
    const toggleOff = this.isToggle(mode) && flags[mode] && this.samePen(cells, table, mode, pen);
    const border = mode === "none" || toggleOff ? NIL : { ...pen };
    const box = this.bbox(cells);
    for (const cell of cells) {
      for (const side of this.sidesOf(cell, mode, box)) {
        cell.borders = { ...cell.borders, [side]: { ...border } };
      }
    }
  }

  private isToggle(mode: TableBorderMode): mode is "top" | "bottom" | "left" | "right" | "tl2br" | "tr2bl" {
    return mode === "top" || mode === "bottom" || mode === "left" || mode === "right" || mode === "tl2br" || mode === "tr2bl";
  }

  private samePen(
    cells: TableCell[],
    table: Table,
    mode: "top" | "bottom" | "left" | "right" | "tl2br" | "tr2bl",
    pen: TableBorderPen,
  ): boolean {
    const box = this.bbox(cells);
    return cells.every((cell) => {
      const sides = this.sidesOf(cell, mode, box);
      return sides.every((side) => {
        const current =
          side === "tl2br" || side === "tr2bl"
            ? this.resolve.diagonal(table, cell, side)
            : side === "top" || side === "bottom" || side === "left" || side === "right"
              ? this.resolve.cellEdge(table, cell, side)
              : undefined;
        return current?.size === pen.size && current?.color === pen.color;
      });
    });
  }

  inspect(cells: TableCell[], table: Table): TableBorderFlags {
    const box = this.bbox(cells);
    const top = this.everyOuter(cells, box, "top", table);
    const bottom = this.everyOuter(cells, box, "bottom", table);
    const left = this.everyOuter(cells, box, "left", table);
    const right = this.everyOuter(cells, box, "right", table);
    const insideH = this.everyInner(cells, box, "H", table);
    const insideV = this.everyInner(cells, box, "V", table);
    const hasInner = cells.length > 1;
    const tl2br = cells.every((cell) => this.resolve.visible(this.resolve.diagonal(table, cell, "tl2br")));
    const tr2bl = cells.every((cell) => this.resolve.visible(this.resolve.diagonal(table, cell, "tr2bl")));
    return {
      top,
      bottom,
      left,
      right,
      outside: top && bottom && left && right,
      inside: hasInner && insideH && insideV,
      insideH: hasInner && insideH,
      insideV: hasInner && insideV,
      all: top && bottom && left && right && (!hasInner || (insideH && insideV)),
      tl2br,
      tr2bl,
    };
  }

  snapshot(cells: TableCell[]): { cell: TableCell; borders: ReturnType<typeof cloneBorders> }[] {
    return cells.map((cell) => ({ cell, borders: cloneBorders(cell.borders) }));
  }

  restore(snaps: { cell: TableCell; borders: ReturnType<typeof cloneBorders> }[]): void {
    for (const item of snaps) {
      item.cell.borders = cloneBorders(item.borders);
    }
  }

  private everyOuter(cells: TableCell[], box: CellBox, side: "top" | "bottom" | "left" | "right", table: Table): boolean {
    const targets = cells.filter((cell) => this.isOuter(cell, box, side));
    return targets.length > 0 && targets.every((cell) => this.resolve.visible(this.resolve.cellEdge(table, cell, side)));
  }

  private everyInner(cells: TableCell[], box: CellBox, axis: "H" | "V", table: Table): boolean {
    const sides: Array<"top" | "bottom" | "left" | "right"> =
      axis === "H" ? ["top", "bottom"] : ["left", "right"];
    const targets = cells.filter((cell) => sides.some((side) => !this.isOuter(cell, box, side)));
    if (!targets.length) {
      return false;
    }
    return targets.every((cell) =>
      sides.every((side) => this.isOuter(cell, box, side) || this.resolve.visible(this.resolve.cellEdge(table, cell, side))),
    );
  }

  private sidesOf(cell: TableCell, mode: TableBorderMode, box: CellBox): TableBorderSide[] {
    if (mode === "none" || mode === "all") {
      return mode === "none" ? ["top", "bottom", "left", "right", "tl2br", "tr2bl"] : ["top", "bottom", "left", "right"];
    }
    if (mode === "tl2br" || mode === "tr2bl") {
      return [mode];
    }
    const sides: TableBorderSide[] = [];
    const want = (side: "top" | "bottom" | "left" | "right", outer: boolean) => {
      if (this.isOuter(cell, box, side) === outer) {
        sides.push(side);
      }
    };
    if (mode === "top" || mode === "outside") {
      want("top", true);
    }
    if (mode === "bottom" || mode === "outside") {
      want("bottom", true);
    }
    if (mode === "left" || mode === "outside") {
      want("left", true);
    }
    if (mode === "right" || mode === "outside") {
      want("right", true);
    }
    if (mode === "inside" || mode === "insideH") {
      want("top", false);
      want("bottom", false);
    }
    if (mode === "inside" || mode === "insideV") {
      want("left", false);
      want("right", false);
    }
    return sides;
  }

  private isOuter(cell: TableCell, box: CellBox, side: "top" | "bottom" | "left" | "right"): boolean {
    if (side === "top") {
      return cell.rowIndex === box.r0;
    }
    if (side === "bottom") {
      return cell.rowIndex + Math.max(1, cell.rowSpan) - 1 === box.r1;
    }
    if (side === "left") {
      return cell.colIndex === box.c0;
    }
    return cell.colIndex + Math.max(1, cell.colSpan) - 1 === box.c1;
  }

  private bbox(cells: TableCell[]): CellBox {
    let r0 = Number.POSITIVE_INFINITY;
    let c0 = Number.POSITIVE_INFINITY;
    let r1 = 0;
    let c1 = 0;
    for (const cell of cells) {
      r0 = Math.min(r0, cell.rowIndex);
      c0 = Math.min(c0, cell.colIndex);
      r1 = Math.max(r1, cell.rowIndex + Math.max(1, cell.rowSpan) - 1);
      c1 = Math.max(c1, cell.colIndex + Math.max(1, cell.colSpan) - 1);
    }
    return { r0, r1, c0, c1 };
  }

}
