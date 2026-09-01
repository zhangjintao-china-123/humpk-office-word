import type { Viewport } from "../render/canvas/Viewport";
import { HitTester, type HitContext } from "./HitTester";
import type { Selection } from "./Selection";

export class CaretView {
  readonly el: HTMLDivElement;
  private readonly hit = new HitTester();

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "ho-word-caret";
    this.el.hidden = true;
    host.appendChild(this.el);
  }

  sync(selection: Selection, ctx: HitContext, viewport: Viewport): void {
    const pos = selection.caret();
    const primary = selection.primaryRange();
    if (!pos || !primary || selection.dragging || !primary.collapsed()) {
      this.el.hidden = true;
      return;
    }
    const box = this.hit.caretBox(pos, ctx);
    if (!box) {
      this.el.hidden = true;
      return;
    }
    const css = viewport.worldToCss(box.x, box.y);
    this.el.hidden = false;
    this.el.style.left = `${css.x}px`;
    this.el.style.top = `${css.y}px`;
    this.el.style.height = `${box.height}px`;
  }

  remove(): void {
    this.el.remove();
  }
}
