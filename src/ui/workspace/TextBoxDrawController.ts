import type { TextBoxDirection } from "../../model/graphic/Shape";
import { Rect } from "../../shared/geometry/Rect";

interface Point {
  x: number;
  y: number;
}

interface TextBoxDrawHost {
  toWorld(clientX: number, clientY: number): Point;
  pageAt(point: Point): Rect | undefined;
  caret(): Point | null;
  onChange(): void;
  place(direction: TextBoxDirection, bounds: Rect): void;
}

export class TextBoxDrawController {
  direction?: TextBoxDirection;
  preview?: Rect;
  private drag?: { id: number; start: Point; page: Rect };

  constructor(private readonly root: HTMLElement, private readonly host: TextBoxDrawHost) {
    root.addEventListener("pointerdown", this.onDown, true);
    root.addEventListener("pointermove", this.onMove, true);
    root.addEventListener("pointerup", this.onUp, true);
    root.addEventListener("pointercancel", this.onCancel, true);
    root.addEventListener("lostpointercapture", this.onCancel, true);
    window.addEventListener("pointerdown", this.onOutsideDown, true);
    window.addEventListener("keydown", this.onKey, true);
  }

  start(direction: TextBoxDirection): void {
    this.reset();
    this.direction = direction;
    this.root.classList.add("is-textbox-drawing");
    this.host.onChange();
  }

  cancel(): void {
    if (this.direction) {
      this.reset();
      this.host.onChange();
    }
  }

  detach(): void {
    this.reset();
    this.root.removeEventListener("pointerdown", this.onDown, true);
    this.root.removeEventListener("pointermove", this.onMove, true);
    this.root.removeEventListener("pointerup", this.onUp, true);
    this.root.removeEventListener("pointercancel", this.onCancel, true);
    this.root.removeEventListener("lostpointercapture", this.onCancel, true);
    window.removeEventListener("pointerdown", this.onOutsideDown, true);
    window.removeEventListener("keydown", this.onKey, true);
  }

  private reset(): void {
    const id = this.drag?.id;
    this.direction = undefined;
    this.preview = undefined;
    this.drag = undefined;
    this.root.classList.remove("is-textbox-drawing");
    if (id != null && this.root.hasPointerCapture?.(id)) {
      this.root.releasePointerCapture(id);
    }
  }

  private onDown = (event: PointerEvent): void => {
    if (!this.direction || event.button !== 0 || this.drag) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const start = this.host.toWorld(event.clientX, event.clientY);
    const page = this.host.pageAt(start);
    if (page) {
      this.drag = { id: event.pointerId, start, page };
      this.root.setPointerCapture?.(event.pointerId);
    }
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.direction) {
      return;
    }
    event.stopImmediatePropagation();
    if (this.drag?.id !== event.pointerId) {
      return;
    }
    const end = this.host.toWorld(event.clientX, event.clientY);
    this.preview = boxBetween(this.drag.page, this.drag.start, end, this.direction);
    this.host.onChange();
  };

  private onUp = (event: PointerEvent): void => {
    const direction = this.direction;
    const drag = this.drag;
    if (!direction || !drag || drag.id !== event.pointerId) {
      return;
    }
    event.stopImmediatePropagation();
    const end = this.host.toWorld(event.clientX, event.clientY);
    this.place(direction, boxBetween(drag.page, drag.start, end, direction));
  };

  private onCancel = (event: PointerEvent): void => {
    if (this.drag?.id === event.pointerId) {
      this.cancel();
    }
  };

  private onOutsideDown = (event: PointerEvent): void => {
    if (event.target instanceof Node && !this.root.parentElement?.contains(event.target)) {
      this.cancel();
    }
  };

  private onKey = (event: KeyboardEvent): void => {
    const direction = this.direction;
    if (!direction || event.isComposing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
    } else if (
      event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey &&
      event.target instanceof Node && this.root.parentElement?.contains(event.target)
    ) {
      const start = this.host.caret();
      const page = start && this.host.pageAt(start);
      if (start && page) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.place(direction, boxBetween(page, start, start, direction));
      }
    }
  };

  private place(direction: TextBoxDirection, bounds: Rect): void {
    this.reset();
    this.host.place(direction, bounds);
    this.host.onChange();
  }
}

function boxBetween(page: Rect, start: Point, end: Point, direction: TextBoxDirection): Rect {
  const x = Math.max(page.x, Math.min(end.x, page.right));
  const y = Math.max(page.y, Math.min(end.y, page.bottom));
  const click = Math.hypot(x - start.x, y - start.y) < 5;
  const width = Math.min(page.width, click ? (direction === "vertical" ? 94 : 215) : Math.max(36, Math.abs(x - start.x)));
  const height = Math.min(page.height, click ? (direction === "vertical" ? 196 : 94) : Math.max(30, Math.abs(y - start.y)));
  return new Rect(Math.min(Math.min(start.x, x), page.right - width), Math.min(Math.min(start.y, y), page.bottom - height), width, height);
}
