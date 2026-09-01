import { moveLeft, moveLineEnd, moveLineStart, movePage, moveRight, moveVertical } from "./CaretMotion";
import { DeleteCommand } from "./DeleteCommand";
import { EditImpact } from "./EditImpact";
import type { EditContext } from "./EditContext";
import { FormatCommand, type FormatAction } from "./FormatCommand";
import { History } from "./History";
import { InsertCommand } from "./InsertCommand";
import type { CaretPos } from "../selection/CaretPos";
import type { CaretBox, HitContext, HitTester } from "../selection/HitTester";
import type { RunStyle } from "../model/style/RunStyle";

const VERTICAL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown"]);

export interface InputHost extends EditContext {
  history: History;
  hitTester: HitTester;
  hitContext(): HitContext;
  caretCss(): { x: number; y: number; height: number } | null;
  caretWorld(): CaretBox | null;
  requestSave(): void;
  copy(): Promise<void> | void;
  cut(): Promise<void> | void;
  paste(): Promise<void> | void;
}

export class InputController {
  readonly el: HTMLTextAreaElement;
  private composing = false;
  private skipInput = false;
  private preferredX: number | null = null;
  private pending?: RunStyle;

  constructor(private readonly host: InputHost) {
    this.el = document.createElement("textarea");
    this.el.className = "ho-word-ime";
    this.el.setAttribute("autocomplete", "off");
    this.el.setAttribute("autocorrect", "off");
    this.el.spellcheck = false;
  }

  attach(host: HTMLElement): void {
    this.detach();
    host.appendChild(this.el);
    this.el.addEventListener("compositionstart", this.onCompositionStart);
    this.el.addEventListener("compositionend", this.onCompositionEnd);
    this.el.addEventListener("input", this.onInput);
    this.el.addEventListener("keydown", this.onKeyDown);
  }

  detach(): void {
    this.el.removeEventListener("compositionstart", this.onCompositionStart);
    this.el.removeEventListener("compositionend", this.onCompositionEnd);
    this.el.removeEventListener("input", this.onInput);
    this.el.removeEventListener("keydown", this.onKeyDown);
    this.el.remove();
  }

  resetColumn(): void {
    this.preferredX = null;
  }

  pendingStyle(): RunStyle | undefined {
    return this.pending;
  }

  setPendingStyle(style: RunStyle | undefined): void {
    this.pending = style && Object.keys(style).length ? style : undefined;
  }

  clearPending(): void {
    this.pending = undefined;
  }

  focus(): void {
    this.sync();
    this.el.focus({ preventScroll: true });
  }

  sync(): void {
    const box = this.host.caretCss();
    if (!box) {
      return;
    }
    this.el.style.left = `${box.x}px`;
    this.el.style.top = `${box.y}px`;
    this.el.style.height = `${box.height}px`;
  }

  private onCompositionStart = (): void => {
    this.composing = true;
  };

  private onCompositionEnd = (event: CompositionEvent): void => {
    this.composing = false;
    this.skipInput = true;
    const text = event.data || this.el.value;
    this.el.value = "";
    this.resetColumn();
    if (text) {
      this.host.history.do(new InsertCommand(this.host, text));
    }
  };

  private onInput = (): void => {
    if (this.composing) {
      return;
    }
    if (this.skipInput) {
      this.skipInput = false;
      this.el.value = "";
      return;
    }
    const text = this.el.value;
    this.el.value = "";
    this.resetColumn();
    if (text) {
      this.host.history.do(new InsertCommand(this.host, text));
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.composing) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        this.host.history.redo();
      } else {
        this.host.history.undo();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.host.history.redo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      this.host.requestSave();
      return;
    }
    const format = this.formatShortcut(event);
    if (format) {
      event.preventDefault();
      this.host.history.do(new FormatCommand(this.host, format));
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        void this.host.copy();
        return;
      }
      if (key === "x") {
        event.preventDefault();
        this.resetColumn();
        void this.host.cut();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        this.resetColumn();
        void this.host.paste();
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.resetColumn();
      this.host.history.do(new InsertCommand(this.host, "\n"));
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      this.resetColumn();
      this.host.history.do(new DeleteCommand(this.host, "backward"));
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      this.resetColumn();
      this.host.history.do(new DeleteCommand(this.host, "forward"));
      return;
    }
    if (
      VERTICAL_KEYS.has(event.key) ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      this.clearPending();
      this.moveCaret(event.key, event.shiftKey);
    }
  };

  private formatShortcut(event: KeyboardEvent): FormatAction | null {
    if (!event.metaKey && !event.ctrlKey) {
      return null;
    }
    const key = event.key.toLowerCase();
    if (key === "b") {
      return { type: "bold" };
    }
    if (key === "i") {
      return { type: "italic" };
    }
    if (key === "u") {
      return { type: "underline" };
    }
    return null;
  }

  private moveCaret(key: string, shift: boolean): boolean {
    const selection = this.host.selection;
    const primary = selection.primaryRange();
    const pos = selection.caret();
    if (!pos?.node) {
      return false;
    }
    if (!shift && primary && !primary.collapsed() && primary.mode === "text") {
      const norm = primary.normalized();
      if (key === "ArrowLeft") {
        selection.collapse(norm.start);
        this.host.afterEdit(new EditImpact(norm.start.story, []));
        return true;
      }
      if (key === "ArrowRight") {
        selection.collapse(norm.end);
        this.host.afterEdit(new EditImpact(norm.end.story, []));
        return true;
      }
    }
    const next = this.nextPos(key, pos);
    if (!next || next.equals(pos)) {
      return false;
    }
    if (shift) {
      if (primary?.mode === "cell") {
        selection.collapse(pos);
      }
      selection.extendInStory(next, "text");
    } else {
      selection.collapse(next);
    }
    this.host.afterEdit(new EditImpact(next.story, []));
    return true;
  }

  private nextPos(key: string, pos: CaretPos): CaretPos | null {
    if (!pos) {
      return null;
    }
    if (key === "ArrowLeft") {
      this.resetColumn();
      return moveLeft(pos);
    }
    if (key === "ArrowRight") {
      this.resetColumn();
      return moveRight(pos);
    }
    if (key === "Home" || key === "End") {
      this.resetColumn();
      const hit = this.host.hitTester;
      const ctx = this.host.hitContext();
      return key === "Home" ? moveLineStart(pos, hit, ctx) : moveLineEnd(pos, hit, ctx);
    }
    if (!VERTICAL_KEYS.has(key)) {
      return null;
    }
    const box = this.host.caretWorld();
    if (!box) {
      return pos;
    }
    this.preferredX ??= box.x;
    const dir: -1 | 1 = key === "ArrowUp" || key === "PageUp" ? -1 : 1;
    const hit = this.host.hitTester;
    const ctx = this.host.hitContext();
    return key === "PageUp" || key === "PageDown"
      ? movePage(pos, dir, this.preferredX, hit, ctx)
      : moveVertical(pos, dir, this.preferredX, hit, ctx);
  }
}
