import {
  canDragPicture,
  pickPictureHandle,
  pictureHandleCursor,
  snapPicture,
  type PictureHandle,
  type PictureSnap,
} from "../edit/PictureTransform";
import type { PictureBox } from "./HitTester";
import { applyResizeCursor } from "./ResizeCursor";

const GUIDE_SLOP_PX = 12;
const MOVE_SLOP = 8;

export interface PictureTransformHost {
  clientToWorld(clientX: number, clientY: number): { x: number; y: number };
  zoom(): number;
  selectedPicture(): PictureBox | null;
  pictureAt(worldX: number, worldY: number): PictureBox | null;
  selectPicture(box: PictureBox): void;
  previewResize(box: PictureBox, start: PictureSnap, handle: PictureHandle, dx: number, dy: number, lockAspect: boolean): void;
  previewMove(box: PictureBox, start: PictureSnap, dx: number, dy: number): void;
  commit(box: PictureBox, before: PictureSnap): void;
  revert(box: PictureBox, before: PictureSnap): void;
}

interface Drag {
  box: PictureBox;
  before: PictureSnap;
  handle?: PictureHandle;
  x: number;
  y: number;
  lockAspect: boolean;
  moved: boolean;
  dirty: boolean;
}

export class PictureTransformController {
  private element: HTMLElement | null = null;
  private drag: Drag | null = null;

  constructor(private readonly host: PictureTransformHost) {}

  attach(element: HTMLElement): void {
    this.detach();
    this.element = element;
    element.addEventListener("pointerdown", this.onDown, true);
    element.addEventListener("pointermove", this.onMove, true);
    element.addEventListener("pointerup", this.onUp, true);
    element.addEventListener("pointercancel", this.onCancel, true);
    element.addEventListener("pointerleave", this.onLeave);
    window.addEventListener("keydown", this.onKey, true);
  }

  detach(): void {
    const element = this.element;
    if (this.drag) {
      this.cancel();
    }
    if (!element) {
      return;
    }
    element.removeEventListener("pointerdown", this.onDown, true);
    element.removeEventListener("pointermove", this.onMove, true);
    element.removeEventListener("pointerup", this.onUp, true);
    element.removeEventListener("pointercancel", this.onCancel, true);
    element.removeEventListener("pointerleave", this.onLeave);
    window.removeEventListener("keydown", this.onKey, true);
    this.clearCursor();
    this.element = null;
  }

  private onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.drag) {
      return;
    }
    const world = this.host.clientToWorld(event.clientX, event.clientY);
    const selected = this.host.selectedPicture();
    const handle = selected ? pickPictureHandle(world.x, world.y, selected, this.slop()) : null;
    const box = handle && selected ? selected : this.host.pictureAt(world.x, world.y);
    if (!box) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.element?.setPointerCapture?.(event.pointerId);
    this.host.selectPicture(box);
    this.drag = {
      box,
      before: snapPicture(box.drawing),
      handle: handle ?? undefined,
      x: world.x,
      y: world.y,
      lockAspect: event.shiftKey ? box.drawing.lockAspect === false : box.drawing.lockAspect !== false,
      moved: false,
      dirty: false,
    };
    this.setCursor(handle ? pictureHandleCursor(handle) : "move", true);
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.drag) {
      this.hover(event);
      return;
    }
    const world = this.host.clientToWorld(event.clientX, event.clientY);
    const drag = this.drag;
    const dx = world.x - drag.x;
    const dy = world.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < MOVE_SLOP) {
      return;
    }
    drag.moved = true;
    const lock = event.shiftKey ? !drag.before.lockAspect : drag.before.lockAspect;
    if (drag.handle) {
      this.host.previewResize(drag.box, drag.before, drag.handle, dx, dy, lock);
      drag.dirty = true;
      return;
    }
    if (!canDragPicture(drag.box.story, drag.before.position)) {
      return;
    }
    this.host.previewMove(drag.box, drag.before, dx, dy);
    drag.dirty = true;
  };

  private onUp = (): void => {
    this.finish();
  };

  private onCancel = (): void => {
    this.cancel();
  };

  private onLeave = (): void => {
    if (!this.drag) {
      this.clearCursor();
    }
  };

  private onKey = (event: KeyboardEvent): void => {
    if (!this.drag || event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  };

  private finish(): void {
    const drag = this.drag;
    this.drag = null;
    this.clearCursor();
    if (!drag?.dirty) {
      return;
    }
    this.host.commit(drag.box, drag.before);
  }

  private cancel(): void {
    const drag = this.drag;
    this.drag = null;
    this.clearCursor();
    if (drag?.dirty) {
      this.host.revert(drag.box, drag.before);
    }
  }

  private hover(event: PointerEvent): void {
    const world = this.host.clientToWorld(event.clientX, event.clientY);
    const selected = this.host.selectedPicture();
    const handle = selected ? pickPictureHandle(world.x, world.y, selected, this.slop()) : null;
    if (handle) {
      this.setCursor(pictureHandleCursor(handle), false);
      return;
    }
    const box = this.host.pictureAt(world.x, world.y);
    this.setCursor(box ? (box.drawing.position === "anchor" ? "move" : "pointer") : "", false);
  }

  private slop(): number {
    return GUIDE_SLOP_PX / (this.host.zoom() || 1);
  }

  private setCursor(cursor: string, _locked = false): void {
    applyResizeCursor(this, this.element, cursor);
  }

  private clearCursor(): void {
    this.setCursor("", false);
  }
}
