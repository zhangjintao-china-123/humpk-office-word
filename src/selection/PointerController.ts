import type { TableCell } from "../model/table/Table";
import { CaretPos } from "./CaretPos";
import { SelRange } from "./SelRange";
import { Selection } from "./Selection";
import { storyEquals, type StoryRef } from "./StoryRef";

export interface PointerHost {
  selection: Selection;
  hitClient(clientX: number, clientY: number): CaretPos | null;
  cellsInRect(from: TableCell, to: TableCell): TableCell[];
  onChange(): void;
}

export class PointerController {
  private dragging = false;
  private attached: HTMLElement | null = null;
  private anchor: CaretPos | null = null;

  constructor(private readonly host: PointerHost) {}

  attach(element: HTMLElement): void {
    this.detach();
    this.attached = element;
    element.addEventListener("pointerdown", this.onDown);
    element.addEventListener("pointermove", this.onMove);
    element.addEventListener("pointerup", this.onUp);
    element.addEventListener("pointercancel", this.onUp);
  }

  detach(): void {
    const element = this.attached;
    if (!element) {
      return;
    }
    element.removeEventListener("pointerdown", this.onDown);
    element.removeEventListener("pointermove", this.onMove);
    element.removeEventListener("pointerup", this.onUp);
    element.removeEventListener("pointercancel", this.onUp);
    this.attached = null;
  }

  private onDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    const pos = this.host.hitClient(event.clientX, event.clientY);
    if (!pos) {
      return;
    }
    this.dragging = true;
    this.host.selection.dragging = true;
    this.attached?.setPointerCapture?.(event.pointerId);
    if (event.metaKey || event.ctrlKey) {
      this.host.selection.addRange(new SelRange(pos.story, pos, pos));
    } else if (event.shiftKey && this.anchor && this.selectCellRect(this.anchor, pos)) {
      this.host.onChange();
      return;
    } else if (event.shiftKey) {
      const primary = this.host.selection.primaryRange();
      if (primary && storyEquals(primary.story, pos.story)) {
        this.host.selection.extendInStory(pos, primary.mode);
      } else {
        this.anchor = pos;
        this.host.selection.collapse(pos);
      }
    } else {
      this.anchor = pos;
      this.host.selection.collapse(pos);
    }
    this.host.onChange();
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    const pos = this.host.hitClient(event.clientX, event.clientY);
    if (!pos) {
      return;
    }
    const from = this.anchor ?? this.host.selection.caret();
    if (from && this.selectCellRect(from, pos)) {
      this.host.onChange();
      return;
    }
    const visited = this.host.selection.ranges.some((range) => storyEquals(range.story, pos.story));
    if (visited) {
      this.host.selection.extendInStory(pos);
    } else {
      this.host.selection.addRange(new SelRange(pos.story, pos, pos));
    }
    this.host.onChange();
  };

  private onUp = (): void => {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.host.selection.dragging = false;
    this.host.onChange();
  };

  private selectCellRect(from: CaretPos, to: CaretPos): boolean {
    if (from.story.slot !== "cell" || to.story.slot !== "cell") {
      return false;
    }
    if (from.story.cell === to.story.cell) {
      if (!this.host.selection.ranges.some((range) => range.mode === "cell")) {
        this.host.selection.extendInStory(to);
        return true;
      }
    }
    const cells =
      from.story.cell === to.story.cell
        ? [from.story.cell]
        : this.host.cellsInRect(from.story.cell, to.story.cell);
    if (!cells.length) {
      return true;
    }
    this.host.selection.ranges = cells.map((cell) => {
      const story: StoryRef = { slot: "cell", cell };
      const pos = new CaretPos(story, cell.document.words.head, false);
      return new SelRange(story, pos, pos, "cell");
    });
    this.host.selection.primary = Math.max(0, cells.length - 1);
    return true;
  }
}
