import { moveLeft, moveLineEnd, moveLineStart, movePage, moveRight, moveVertical } from "./CaretMotion";
import { cellsInReadingOrder, moveInFlow } from "../selection/MainWalk";
import type { DeleteDirection } from "./DeleteCommand";
import { EditImpact } from "./EditImpact";
import type { EditContext } from "./EditContext";
import { FormatCommand, type FormatAction } from "./FormatCommand";
import { caretParagraph, OutlineCommand } from "./OutlineCommand";
import { History } from "./History";
import { InsertCommand } from "./InsertCommand";
import { TableStructureCommand } from "./TableStructureCommand";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import type { Table, TableCell } from "../model/table/Table";
import { CaretPos } from "../selection/CaretPos";
import type { CaretBox, HitContext, HitTester } from "../selection/HitTester";
import { SelectionText } from "../selection/SelectionText";
import { isVerticalTextBox, type StoryRef } from "../selection/StoryRef";
import type { RunStyle } from "../model/style/RunStyle";

const VERTICAL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown"]);
const TEXT_BOX_ARROWS: Record<string, string> = {
  ArrowUp: "ArrowLeft", ArrowDown: "ArrowRight", ArrowLeft: "ArrowDown", ArrowRight: "ArrowUp",
};

export interface InputHost extends EditContext {
  history: History;
  hitTester: HitTester;
  hitContext(): HitContext;
  caretCss(): { x: number; y: number; height: number } | null;
  caretWorld(): CaretBox | null;
  requestSave(): void;
  copy(): Promise<void> | void;
  cut(): Promise<void> | void;
  paste(data?: DataTransfer | null): Promise<void> | void;
  deleteContent(direction: DeleteDirection): void;
  copyFormat?(): void;
  pasteFormat?(): void;
  cancelFormatPainter?(): boolean;
}

export class InputController {
  readonly el: HTMLTextAreaElement;
  private readonly selectionText = new SelectionText();
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
    this.el.addEventListener("paste", this.onPaste);
  }

  detach(): void {
    this.el.removeEventListener("compositionstart", this.onCompositionStart);
    this.el.removeEventListener("compositionend", this.onCompositionEnd);
    this.el.removeEventListener("input", this.onInput);
    this.el.removeEventListener("keydown", this.onKeyDown);
    this.el.removeEventListener("paste", this.onPaste);
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

  private onPaste = (event: ClipboardEvent): void => {
    if (this.composing) {
      return;
    }
    event.preventDefault();
    this.el.value = "";
    this.skipInput = true;
    this.resetColumn();
    void this.host.paste(event.clipboardData);
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
    if (event.key === "Escape") {
      if (this.host.cancelFormatPainter?.()) {
        event.preventDefault();
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        event.stopPropagation();
        this.host.copyFormat?.();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        event.stopPropagation();
        this.host.pasteFormat?.();
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        event.stopPropagation();
        void this.host.copy();
        return;
      }
      if (key === "x") {
        event.preventDefault();
        event.stopPropagation();
        this.resetColumn();
        void this.host.cut();
        return;
      }
    }
    if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (this.moveTableCell(event.shiftKey)) {
        event.preventDefault();
        return;
      }
      const numbered = caretParagraph(this.host.selection.caret());
      if (numbered?.attrs.numId && numbered.attrs.numId !== "0") {
        event.preventDefault();
        this.host.history.do(new OutlineCommand(this.host, { type: event.shiftKey ? "promote" : "demote" }));
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.resetColumn();
      const numbered = caretParagraph(this.host.selection.caret());
      if (numbered?.attrs.numId && numbered.attrs.numId !== "0" && numbered.getFullText() === "") {
        this.host.history.do(new OutlineCommand(this.host, { type: "clear" }));
        return;
      }
      this.host.history.do(new InsertCommand(this.host, "\n"));
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      this.resetColumn();
      const pos = this.host.selection.caret();
      const numbered = this.host.selection.isCollapsed() ? caretParagraph(pos) : null;
      if (
        numbered?.attrs.numId &&
        numbered.attrs.numId !== "0" &&
        pos &&
        !pos.after &&
        pos.node?.data.paragraph === numbered &&
        (!pos.node.pre || pos.node.pre.data.paragraph !== numbered)
      ) {
        this.host.history.do(new OutlineCommand(this.host, { type: "clear" }));
        return;
      }
      this.host.deleteContent("backward");
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      this.resetColumn();
      this.host.deleteContent("forward");
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

  private moveCaret(pressed: string, shift: boolean): boolean {
    const selection = this.host.selection;
    const primary = selection.primaryRange();
    const pos = selection.caret();
    if (!pos?.node) {
      return false;
    }
    const key = isVerticalTextBox(pos.story) ? TEXT_BOX_ARROWS[pressed] ?? pressed : pressed;
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
      if (primary?.mode === "cell" && !selection.flow) {
        selection.collapse(pos);
      }
      const anchor = selection.flow?.anchor ?? selection.primaryRange()?.start ?? pos;
      const anchorOwner = this.host.flowOwner?.(anchor);
      const nextOwner = this.host.flowOwner?.(next);
      if (anchorOwner && nextOwner && anchorOwner.document === nextOwner.document) {
        selection.setFlow(anchor, next);
      } else {
        selection.extendInStory(next, "text");
      }
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
    if (key === "ArrowLeft" || key === "ArrowRight") {
      this.resetColumn();
      const owner = this.host.flowOwner?.(pos);
      if (owner) {
        return moveInFlow(owner.document, owner.story, pos, key === "ArrowRight" ? 1 : -1);
      }
      return key === "ArrowLeft" ? moveLeft(pos) : moveRight(pos);
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
    this.preferredX ??= isVerticalTextBox(pos.story) ? box.y : box.x;
    const dir: -1 | 1 = key === "ArrowUp" || key === "PageUp" ? -1 : 1;
    const hit = this.host.hitTester;
    const ctx = this.host.hitContext();
    return key === "PageUp" || key === "PageDown"
      ? movePage(pos, dir, this.preferredX, hit, ctx)
      : moveVertical(pos, dir, this.preferredX, hit, ctx);
  }

  private moveTableCell(reverse: boolean): boolean {
    const selection = this.host.selection;
    const flow = selection.flow;
    if (flow && flow.anchor.node && flow.anchor.node === flow.focus.node && flow.anchor.node.data.kind === "table") {
      const table = flow.anchor.node.data.table;
      const cells = table ? cellsInReadingOrder(table) : [];
      if (!cells.length) {
        return false;
      }
      this.focusTableCell(reverse ? cells[cells.length - 1] : cells[0]);
      return true;
    }
    const pos = selection.caret();
    const primary = selection.primaryRange();
    const currentCell =
      pos?.story.slot === "cell"
        ? pos.story.cell
        : primary?.story.slot === "cell"
          ? primary.story.cell
          : null;
    if (!currentCell) {
      return false;
    }
    const hostInfo = this.host.relayout?.findCellHost?.(currentCell);
    const table: Table | undefined = hostInfo?.table ?? this.host.hitTester.findTable(currentCell, this.host.hitContext());
    if (!table) {
      return false;
    }
    const cells = cellsInReadingOrder(table);
    const index = cells.indexOf(currentCell);
    if (index < 0) {
      return false;
    }
    const nextIndex = reverse ? index - 1 : index + 1;
    if (nextIndex >= 0 && nextIndex < cells.length) {
      this.focusTableCell(cells[nextIndex]);
      return true;
    }
    if (reverse) {
      return true;
    }
    const parentStory: StoryRef = hostInfo?.parent ?? { slot: "body" };
    this.resetColumn();
    this.clearPending();
    this.host.history.do(
      new TableStructureCommand(this.host, table, parentStory, currentCell, {
        type: "insertRow",
        index: table.rows.length,
        focusNewRow: true,
      }),
    );
    return true;
  }

  private focusTableCell(cell: TableCell): void {
    if (cell.document.words.length === 0) {
      new WordStreamBuilder().buildStoryOnly(cell.document);
    }
    const story: StoryRef = { slot: "cell", cell };
    const head = cell.document.words.head;
    if (head?.data.kind === "table") {
      this.host.selection.collapse(new CaretPos(story, head, false));
    } else {
      const range = this.selectionText.cellContentRange(cell);
      if (range.collapsed()) {
        this.host.selection.collapse(range.start);
      } else {
        this.host.selection.setRange(range);
      }
    }
    this.resetColumn();
    this.clearPending();
    this.host.afterEdit(new EditImpact(story, []));
  }
}
