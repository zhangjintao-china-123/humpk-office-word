import type { Draw } from "../canvas/Draw";
import type { Table } from "../../model/table/Table";
import type { TableBorder } from "../../model/table/Table";
import { cellVisibleRect, type TableCellBox } from "./TableGeometry";
import { TableBorderResolve } from "./TableBorderResolve";

export interface BorderFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  cutTop: boolean;
  cutBottom: boolean;
  /** 竖线收到横线外缘，拐角才能接上。切开的一侧停在线的中心，避免伸进页脚。 */
  sideTop: number;
  sideBottom: number;
  sideLeft: number;
  sideRight: number;
}

/**
 * 描边以路径为中心。表外框若压在裁剪边上，下半截会被裁掉，线就发虚或消失。
 * 外框向格子内收半个线宽，整条线留在格子里。跨页切开的那一侧仍按整条线宽内收。
 */
export function borderFrame(
  box: TableCellBox,
  topInset: number,
  bottomInset: number,
  outer: { top?: number; right?: number; bottom?: number; left?: number } = {},
): BorderFrame {
  const vis = cellVisibleRect(box);
  const visRight = vis.x + vis.width;
  const visBottom = vis.y + vis.height;
  const cutTop = vis.y > box.y + 0.5;
  const cutBottom = visBottom < box.y + box.height - 0.5;
  const y = vis.y + (cutTop ? topInset : outer.top ?? 0);
  const bottom = visBottom - (cutBottom ? bottomInset : outer.bottom ?? 0);
  const x = vis.x + (outer.left ?? 0);
  const right = visRight - (outer.right ?? 0);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    cutTop,
    cutBottom,
    sideTop: cutTop ? y : vis.y,
    sideBottom: cutBottom ? bottom : visBottom,
    sideLeft: vis.x,
    sideRight: visRight,
  };
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
    const half = (border: TableBorder | undefined) => this.resolve.widthPx(border) / 2;
    const frame = borderFrame(box, this.resolve.widthPx(top), this.resolve.widthPx(bottom), {
      top: this.resolve.isOuter(table, cell, "top") ? half(top) : 0,
      right: this.resolve.isOuter(table, cell, "right") ? half(right) : 0,
      bottom: this.resolve.isOuter(table, cell, "bottom") ? half(bottom) : 0,
      left: this.resolve.isOuter(table, cell, "left") ? half(left) : 0,
    });
    if (frame.width <= 0 || frame.height <= 0) {
      return;
    }
    const x2 = frame.x + frame.width;
    const y2 = frame.y + frame.height;
    const vis = cellVisibleRect(box);
    const showTop = frame.cutTop || box.y >= vis.y - 0.5;
    const showBottom = frame.cutBottom || box.y + box.height <= vis.y + vis.height + 0.5;
    if (showTop) {
      this.stroke(draw, top, frame.sideLeft, frame.y, frame.sideRight, frame.y);
    }
    if (showBottom) {
      this.stroke(draw, bottom, frame.sideLeft, y2, frame.sideRight, y2);
    }
    this.stroke(draw, right, x2, frame.sideTop, x2, frame.sideBottom);
    this.stroke(draw, left, frame.x, frame.sideTop, frame.x, frame.sideBottom);
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
