import type { Draw } from "../canvas/Draw";
import type { Table } from "../../model/table/Table";
import type { TableBorder } from "../../model/table/Table";
import { cellVisibleRect, type TableCellBox } from "./TableGeometry";
import { TableBorderResolve } from "./TableBorderResolve";

/** 跨页切开的那一侧整条线都留在版心里，线宽不再伸进页脚。 */
export function borderFrame(
  box: TableCellBox,
  topInset: number,
  bottomInset: number,
): { x: number; y: number; width: number; height: number; cutTop: boolean; cutBottom: boolean } {
  const vis = cellVisibleRect(box);
  const cutTop = vis.y > box.y + 0.5;
  const cutBottom = vis.y + vis.height < box.y + box.height - 0.5;
  const y = vis.y + (cutTop ? topInset : 0);
  const bottom = vis.y + vis.height - (cutBottom ? bottomInset : 0);
  return { x: vis.x, y, width: vis.width, height: bottom - y, cutTop, cutBottom };
}

export class TableBorderPainter {
  private readonly resolve = new TableBorderResolve();

  paintFill(draw: Draw, box: TableCellBox): void {
    if (!box.cell.fill) {
      return;
    }
    const vis = cellVisibleRect(box);
    draw.setFill(box.cell.fill);
    draw.fillRect(vis.x, vis.y, vis.width, vis.height);
  }

  paintEdges(draw: Draw, box: TableCellBox, table: Table): void {
    const { cell } = box;
    const top = this.resolve.cellEdge(table, cell, "top");
    const right = this.resolve.cellEdge(table, cell, "right");
    const bottom = this.resolve.cellEdge(table, cell, "bottom");
    const left = this.resolve.cellEdge(table, cell, "left");
    const frame = borderFrame(box, this.resolve.widthPx(top), this.resolve.widthPx(bottom));
    if (frame.width <= 0 || frame.height <= 0) {
      return;
    }
    const x2 = frame.x + frame.width;
    const y2 = frame.y + frame.height;
    const showTop = frame.cutTop || box.y >= frame.y - 0.5;
    const showBottom = frame.cutBottom || box.y + box.height <= y2 + 0.5;
    if (showTop) {
      this.stroke(draw, top, frame.x, frame.y, x2, frame.y);
    }
    if (showBottom) {
      this.stroke(draw, bottom, frame.x, y2, x2, y2);
    }
    this.stroke(draw, right, x2, frame.y, x2, y2);
    this.stroke(draw, left, frame.x, frame.y, frame.x, y2);
    this.stroke(draw, this.resolve.diagonal(table, cell, "tl2br"), frame.x, frame.y, x2, y2);
    this.stroke(draw, this.resolve.diagonal(table, cell, "tr2bl"), x2, frame.y, frame.x, y2);
  }

  private stroke(draw: Draw, border: TableBorder | undefined, x1: number, y1: number, x2: number, y2: number): void {
    const width = this.resolve.widthPx(border);
    if (width <= 0) {
      return;
    }
    const snap = (value: number) => (Math.round(width) % 2 === 1 ? Math.floor(value) + 0.5 : value);
    draw.save();
    draw.ctx.lineCap = "butt";
    draw.setStroke(this.resolve.color(border), width);
    draw.setLineDash(this.resolve.dash(border));
    draw.beginPath();
    draw.moveTo(snap(x1), snap(y1));
    draw.lineTo(snap(x2), snap(y2));
    draw.stroke();
    draw.restore();
  }
}
