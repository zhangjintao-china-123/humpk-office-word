import type { Draw } from "../canvas/Draw";
import type { Table } from "../../model/table/Table";
import type { TableBorder } from "../../model/table/Table";
import type { TableCellBox } from "./TableGeometry";
import { TableBorderResolve } from "./TableBorderResolve";

export class TableBorderPainter {
  private readonly resolve = new TableBorderResolve();

  paint(draw: Draw, box: TableCellBox, table: Table): void {
    const { cell, x, y, width, height } = box;
    this.stroke(draw, this.resolve.cellEdge(table, cell, "top"), x, y, x + width, y);
    this.stroke(draw, this.resolve.cellEdge(table, cell, "right"), x + width, y, x + width, y + height);
    this.stroke(draw, this.resolve.cellEdge(table, cell, "bottom"), x, y + height, x + width, y + height);
    this.stroke(draw, this.resolve.cellEdge(table, cell, "left"), x, y, x, y + height);
    this.stroke(draw, this.resolve.diagonal(table, cell, "tl2br"), x, y, x + width, y + height);
    this.stroke(draw, this.resolve.diagonal(table, cell, "tr2bl"), x + width, y, x, y + height);
  }

  private stroke(draw: Draw, border: TableBorder | undefined, x1: number, y1: number, x2: number, y2: number): void {
    const width = this.resolve.widthPx(border);
    if (width <= 0) {
      return;
    }
    const snap = (value: number) => (Math.round(width) % 2 === 1 ? Math.floor(value) + 0.5 : value);
    draw.save();
    draw.setStroke(this.resolve.color(border), width);
    draw.setLineDash(this.resolve.dash(border));
    draw.beginPath();
    draw.moveTo(snap(x1), snap(y1));
    draw.lineTo(snap(x2), snap(y2));
    draw.stroke();
    draw.restore();
  }
}
