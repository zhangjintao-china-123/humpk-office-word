import {
  canDragPicture,
  pickPictureHandle,
  pickRotateHandle,
  pictureHandleCursor,
  rotatedAngleFromPointer,
  snapPicture,
  type PictureControl,
  type PictureHandle,
  type PictureSnap,
} from "../edit/PictureTransform";
import type { PictureBox } from "./HitTester";
import { applyResizeCursor } from "./ResizeCursor";

const GUIDE_SLOP_PX = 12;
const TEXT_BOX_HANDLE_SLOP_PX = 6;
const MOVE_SLOP = 8;

export interface PictureTransformHost {
  clientToWorld(clientX: number, clientY: number): { x: number; y: number };
  zoom(): number;
  selectedPicture(): PictureBox | null;
  pictureAt(worldX: number, worldY: number): PictureBox | null;
  selectPicture(box: PictureBox): void;
  previewResize(box: PictureBox, start: PictureSnap, handle: PictureHandle, dx: number, dy: number, lockAspect: boolean): void;
  previewRotate?(box: PictureBox, start: PictureSnap, angle: number): void;
  previewMove(box: PictureBox, start: PictureSnap, dx: number, dy: number): void;
  commit(box: PictureBox, before: PictureSnap): void;
  revert(box: PictureBox, before: PictureSnap): void;
}

interface Drag {
  box: PictureBox;
  before: PictureSnap;
  handle?: PictureControl;
  x: number;
  y: number;
  pointerId: number;
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
    element.addEventListener("lostpointercapture", this.onCancel, true);
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
    element.removeEventListener("lostpointercapture", this.onCancel, true);
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
    const handle = this.handleAt(world.x, world.y, selected);
    const box = handle && selected ? selected : this.host.pictureAt(world.x, world.y);
    if (!box) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.element?.setPointerCapture?.(event.pointerId);
    this.host.selectPicture(box);
    this.drag = {
      box,
      before: snapPicture(box.drawing),
      handle: handle ?? undefined,
      x: world.x,
      y: world.y,
      pointerId: event.pointerId,
      moved: false,
      dirty: false,
    };
    this.setCursor(handle === "rotate" ? "grabbing" : handle ? pictureHandleCursor(handle, box.drawing.rotation ?? 0) : "move");
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.drag) {
      this.hover(event);
      return;
    }
    if (this.drag.pointerId !== event.pointerId) {
      return;
    }
    event.stopImmediatePropagation();
    const world = this.host.clientToWorld(event.clientX, event.clientY);
    const drag = this.drag;
    const dx = world.x - drag.x;
    const dy = world.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < MOVE_SLOP) {
      return;
    }
    drag.moved = true;
    if (drag.handle === "rotate") {
      const angle = rotatedAngleFromPointer(drag.box, world.x, world.y, event.shiftKey);
      this.host.previewRotate?.(drag.box, drag.before, angle);
      drag.dirty = true;
      return;
    }
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

  private onUp = (event: PointerEvent): void => {
    if (this.drag?.pointerId === event.pointerId) {
      event.stopImmediatePropagation();
      this.finish();
    }
  };

  private onCancel = (event: PointerEvent): void => {
    if (this.drag?.pointerId === event.pointerId) {
      this.cancel();
    }
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
    if (drag && this.element?.hasPointerCapture?.(drag.pointerId)) {
      this.element.releasePointerCapture(drag.pointerId);
    }
    this.clearCursor();
    if (drag?.dirty) {
      this.host.revert(drag.box, drag.before);
    }
  }

  private hover(event: PointerEvent): void {
    const world = this.host.clientToWorld(event.clientX, event.clientY);
    const selected = this.host.selectedPicture();
    const handle = this.handleAt(world.x, world.y, selected);
    if (handle) {
      if (handle === "rotate" || selected?.drawing.shape?.text) {
        event.stopImmediatePropagation();
      }
      this.setCursor(pictureHandleCursor(handle, selected?.drawing.rotation ?? 0));
      return;
    }
    const box = this.host.pictureAt(world.x, world.y);
    if (box?.drawing.shape?.text) {
      event.stopImmediatePropagation();
    }
    this.setCursor(box ? (box.drawing.position === "anchor" ? "move" : "pointer") : "");
  }

  private handleAt(x: number, y: number, box: PictureBox | null): PictureControl | null {
    if (!box) {
      return null;
    }
    const textBox = !!box.drawing.shape?.text;
    const slop = (textBox ? TEXT_BOX_HANDLE_SLOP_PX : GUIDE_SLOP_PX) / (this.host.zoom() || 1);
    if (pickRotateHandle(x, y, box, slop)) {
      return "rotate";
    }
    return pickPictureHandle(x, y, box, slop, !textBox);
  }

  private setCursor(cursor: string): void {
    applyResizeCursor(this, this.element, cursor);
  }

  private clearCursor(): void {
    this.setCursor("");
  }
}
