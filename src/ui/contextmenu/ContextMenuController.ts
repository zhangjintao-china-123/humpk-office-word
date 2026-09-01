import type { CaretPos } from "../../selection/CaretPos";
import type { Selection } from "../../selection/Selection";
import { SelectionText } from "../../selection/SelectionText";
import { ContextMenu } from "./ContextMenu";
import { ContextMenuBuilder } from "./ContextMenuBuilder";
import type { ContextMenuAction, ContextMenuKind } from "./ContextMenuItem";

export interface ContextMenuHost {
  selection: Selection;
  hitClient(clientX: number, clientY: number): CaretPos | null;
  onSelectionChange(): void;
  copy(): Promise<void> | void;
  cut(): Promise<void> | void;
  paste(): Promise<void> | void;
  deleteSelection(): void;
}

export class ContextMenuController {
  readonly menu = new ContextMenu();
  private readonly builder = new ContextMenuBuilder();
  private readonly selectionText = new SelectionText();
  private scroll: HTMLElement | null = null;

  constructor(private readonly host: ContextMenuHost) {
    this.menu.setActionHandler((action) => this.run(action));
  }

  attach(host: HTMLElement, scroll: HTMLElement): void {
    this.detach();
    this.scroll = scroll;
    this.menu.attach(host);
    scroll.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("mousedown", this.onDocumentDown, true);
    document.addEventListener("keydown", this.onKeyDown, true);
  }

  detach(): void {
    this.scroll?.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("mousedown", this.onDocumentDown, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    this.menu.detach();
    this.scroll = null;
  }

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const pos = this.host.hitClient(event.clientX, event.clientY);
    if (pos && !this.selectionText.covers(this.host.selection, pos)) {
      this.host.selection.collapse(pos);
      this.host.onSelectionChange();
    }
    const kind = this.kind(pos);
    const canEdit = this.selectionText.hasCopyableContent(this.host.selection);
    this.menu.show(event.clientX, event.clientY, this.builder.build(kind, canEdit));
  };

  private onDocumentDown = (event: MouseEvent): void => {
    if (!this.menu.isOpen()) {
      return;
    }
    if (this.menu.el.contains(event.target as Node)) {
      return;
    }
    this.menu.hide();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.menu.isOpen()) {
      this.menu.hide();
    }
  };

  private kind(pos: CaretPos | null): ContextMenuKind {
    if (pos?.story.slot === "cell") {
      return "table";
    }
    const primary = this.host.selection.primaryRange();
    return primary?.mode === "cell" || primary?.story.slot === "cell" ? "table" : "text";
  }

  private run(action: ContextMenuAction): void {
    if (action === "copy") {
      void this.host.copy();
      return;
    }
    if (action === "cut") {
      void this.host.cut();
      return;
    }
    if (action === "paste") {
      void this.host.paste();
      return;
    }
    this.host.deleteSelection();
  }
}
