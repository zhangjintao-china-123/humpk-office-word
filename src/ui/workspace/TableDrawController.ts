import { MIN_ROW_HEIGHT } from "../../layout/LayoutConstants";
import { MIN_COLUMN_WIDTH } from "../../edit/TableResize";
import { cellVisibleRect, type TableCellBox } from "../../render/table/TableGeometry";
import type { TableCell } from "../../model/table/Table";

export type TableDrawMode = "draw-table" | "erase-table";
type Point = { x: number; y: number };
type TableLine = { from: Point; to: Point };
type SplitDraft = TableLine & { rows: number; columns: number; position: number };

interface TableDrawHost {
  toWorld(x: number, y: number): Point;
  boxAt(point: Point): TableCellBox | undefined;
  zoom(): number;
  redraw(): void;
  modeChanged(): void;
  split(cell: TableCell, draft: SplitDraft): void;
  erase(first: TableCell, second: TableCell): void;
}

/** 在已有单元格内画分隔线，或擦除相邻格之间可合并的分隔线。 */
export class TableDrawController {
  mode?: TableDrawMode;
  preview?: TableLine;
  private drag?: { id: number; box: TableCellBox; start: Point };

  constructor(private readonly root: HTMLElement, private readonly host: TableDrawHost) {
    root.addEventListener("pointerdown", this.onDown, true);
    root.addEventListener("pointermove", this.onMove, true);
    root.addEventListener("pointerup", this.onUp, true);
    root.addEventListener("pointercancel", this.onCancel, true);
    root.addEventListener("lostpointercapture", this.onCancel, true);
    window.addEventListener("keydown", this.onKey, true);
  }

  toggle(mode: TableDrawMode): void {
    const next = this.mode === mode ? undefined : mode;
    this.reset();
    this.mode = next;
    this.root.classList.toggle("is-table-drawing", !!next);
    this.host.modeChanged();
  }

  cancel(): void {
    if (!this.mode) return;
    this.reset();
    this.host.modeChanged();
  }

  detach(): void {
    this.reset();
    this.root.removeEventListener("pointerdown", this.onDown, true);
    this.root.removeEventListener("pointermove", this.onMove, true);
    this.root.removeEventListener("pointerup", this.onUp, true);
    this.root.removeEventListener("pointercancel", this.onCancel, true);
    this.root.removeEventListener("lostpointercapture", this.onCancel, true);
    window.removeEventListener("keydown", this.onKey, true);
  }

  private reset(): void {
    this.clearDrag();
    this.mode = undefined;
    this.root.classList.remove("is-table-drawing");
  }

  private clearDrag(): void {
    const id = this.drag?.id;
    this.drag = undefined;
    this.preview = undefined;
    if (id !== undefined && this.root.hasPointerCapture?.(id)) this.root.releasePointerCapture(id);
  }

  private onDown = (event: PointerEvent): void => {
    if (!this.mode || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".ho-word-comment-margin")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = this.host.toWorld(event.clientX, event.clientY);
    if (this.mode === "erase-table") {
      const pair = this.edgeAt(point);
      if (pair) this.host.erase(pair.first, pair.second);
      this.preview = undefined;
      this.host.redraw();
      return;
    }
    const box = this.host.boxAt(point);
    if (!box) return;
    const visible = cellVisibleRect(box);
    if (visible.height < box.height - 0.5) return;
    this.drag = { id: event.pointerId, box, start: point };
    this.root.setPointerCapture?.(event.pointerId);
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.mode) return;
    event.stopImmediatePropagation();
    const point = this.host.toWorld(event.clientX, event.clientY);
    if (this.mode === "erase-table") this.preview = this.edgeAt(point)?.line;
    else if (this.drag?.id === event.pointerId) this.preview = this.draft(this.drag.box, this.drag.start, point);
    else return;
    this.host.redraw();
  };

  private onUp = (event: PointerEvent): void => {
    if (this.drag?.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    const { box, start } = this.drag;
    const split = this.draft(box, start, this.host.toWorld(event.clientX, event.clientY));
    this.clearDrag();
    if (split) this.host.split(box.cell, split);
    this.host.redraw();
  };

  private onCancel = (event: PointerEvent): void => {
    if (this.drag?.id !== event.pointerId) return;
    this.clearDrag();
    this.host.redraw();
  };

  private onKey = (event: KeyboardEvent): void => {
    if (this.mode && event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
    }
  };

  private draft(box: TableCellBox, start: Point, end: Point): SplitDraft | undefined {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    if (Math.max(dx, dy) < 12 / this.host.zoom()) return undefined;
    if (dx >= dy) {
      const y = (start.y + end.y) / 2;
      if (y - box.y < MIN_ROW_HEIGHT || box.y + box.height - y < MIN_ROW_HEIGHT) return undefined;
      return { from: { x: box.x, y }, to: { x: box.x + box.width, y }, rows: 2, columns: 1, position: y - box.y };
    }
    const x = (start.x + end.x) / 2;
    if (x - box.x < MIN_COLUMN_WIDTH || box.x + box.width - x < MIN_COLUMN_WIDTH) return undefined;
    return { from: { x, y: box.y }, to: { x, y: box.y + box.height }, rows: 1, columns: 2, position: x - box.x };
  }

  private edgeAt(point: Point): { first: TableCell; second: TableCell; line: TableLine } | undefined {
    const slop = 5 / this.host.zoom();
    const close = this.host.boxAt(point);
    if (!close) return undefined;
    const rect = cellVisibleRect(close);
    const edges = [
      { amount: point.x - rect.x, other: { x: rect.x - slop, y: point.y }, from: { x: rect.x, y: rect.y }, to: { x: rect.x, y: rect.y + rect.height } },
      { amount: rect.x + rect.width - point.x, other: { x: rect.x + rect.width + slop, y: point.y }, from: { x: rect.x + rect.width, y: rect.y }, to: { x: rect.x + rect.width, y: rect.y + rect.height } },
      { amount: point.y - rect.y, other: { x: point.x, y: rect.y - slop }, from: { x: rect.x, y: rect.y }, to: { x: rect.x + rect.width, y: rect.y } },
      { amount: rect.y + rect.height - point.y, other: { x: point.x, y: rect.y + rect.height + slop }, from: { x: rect.x, y: rect.y + rect.height }, to: { x: rect.x + rect.width, y: rect.y + rect.height } },
    ].sort((a, b) => a.amount - b.amount);
    for (const { amount, other, from, to } of edges) {
      if (amount > slop) break;
      const adjacent = this.host.boxAt(other);
      if (adjacent && this.sameEdge(close, adjacent, from, to)) return { first: close.cell, second: adjacent.cell, line: { from, to } };
    }
    return undefined;
  }

  private sameEdge(a: TableCellBox, b: TableCellBox, from: Point, to: Point): boolean {
    if (a.cell === b.cell) return false;
    const equal = (x: number, y: number) => Math.abs(x - y) < 0.5;
    return from.x === to.x
      ? equal(a.y, b.y) && equal(a.height, b.height) && (equal(a.x + a.width, b.x) || equal(b.x + b.width, a.x))
      : equal(a.x, b.x) && equal(a.width, b.width) && (equal(a.y + a.height, b.y) || equal(b.y + b.height, a.y));
  }
}
