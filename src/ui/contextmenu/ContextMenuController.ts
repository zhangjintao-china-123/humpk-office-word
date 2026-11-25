import type { OutlineAction } from "../../edit/OutlineCommand";
import type { PictureWrap } from "../../edit/PictureTransform";
import type { FormatAction } from "../../edit/FormatCommand";
import type { CaretPos } from "../../selection/CaretPos";
import type { PictureBox } from "../../selection/HitTester";
import type { Selection } from "../../selection/Selection";
import { SelectionText } from "../../selection/SelectionText";
import { ContextMenu } from "./ContextMenu";
import { ContextMenuBuilder } from "./ContextMenuBuilder";
import type { ContextMenuAction, ContextMenuKind, ContextMenuState, TableMenuState, TextMenuState } from "./ContextMenuItem";

const FORMAT: Partial<Record<ContextMenuAction, FormatAction>> = {
  bold: { type: "bold" },
  italic: { type: "italic" },
  underline: { type: "underline" },
  strike: { type: "strike" },
  superscript: { type: "superscript" },
  subscript: { type: "subscript" },
  clearFormat: { type: "clear" },
  alignLeft: { type: "align", value: "left" },
  alignCenter: { type: "align", value: "center" },
  alignRight: { type: "align", value: "right" },
  alignBoth: { type: "align", value: "both" },
  indentMore: { type: "indentStep", value: 1 },
  indentLess: { type: "indentStep", value: -1 },
  spacing1: { type: "lineSpacing", value: "1" },
  spacing15: { type: "lineSpacing", value: "1.5" },
  spacing2: { type: "lineSpacing", value: "2" },
  styleNormal: { type: "style", value: "normal" },
  styleHeading1: { type: "style", value: "heading1" },
  styleHeading2: { type: "style", value: "heading2" },
  styleHeading3: { type: "style", value: "heading3" },
};

const OUTLINE: Partial<Record<ContextMenuAction, OutlineAction>> = {
  outlineApply: { type: "apply" },
  outlinePromote: { type: "promote" },
  outlineDemote: { type: "demote" },
  outlineClear: { type: "clear" },
};

export interface ContextMenuHost {
  selection: Selection;
  hitClient(clientX: number, clientY: number): CaretPos | null;
  pictureAtClient?(clientX: number, clientY: number): PictureBox | null;
  selectPicture?(box: PictureBox): void;
  onSelectionChange(): void;
  copy(): Promise<void> | void;
  cut(): Promise<void> | void;
  paste(): Promise<void> | void;
  deleteSelection(): void;
  tableMenuState?(): TableMenuState | null;
  textMenuState?(): TextMenuState | null;
  pictureWrap?(): PictureWrap | null;
  insertTableRow?(where: "above" | "below"): void;
  insertTableColumn?(where: "left" | "right"): void;
  deleteTableRow?(): void;
  deleteTableColumn?(): void;
  mergeTableCells?(): void;
  splitTableCell?(): void;
  applyPictureWrap?(wrap: PictureWrap): void;
  applyFormat?(action: FormatAction): void;
  applyOutline?(action: OutlineAction): void;
  applyLink?(raw: string): void;
  clearLink?(): void;
  addComment?(text: string): void;
  openFind?(replace: boolean): void;
}

export class ContextMenuController {
  readonly menu = new ContextMenu();
  private readonly builder = new ContextMenuBuilder();
  private readonly selectionText = new SelectionText();
  private scroll: HTMLElement | null = null;

  constructor(private readonly host: ContextMenuHost) {
    this.menu.setActionHandler((action) => {
      void this.run(action);
    });
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
    const picture = this.host.pictureAtClient?.(event.clientX, event.clientY);
    if (picture) {
      this.host.selectPicture?.(picture);
      this.menu.show(event.clientX, event.clientY, this.builder.build("picture", this.state("picture", true)));
      return;
    }
    const pos = this.host.hitClient(event.clientX, event.clientY);
    if (pos && !this.selectionText.covers(this.host.selection, pos)) {
      this.host.selection.collapse(pos);
      this.host.onSelectionChange();
    }
    const kind = this.kind(pos);
    const canEdit = this.selectionText.hasCopyableContent(this.host.selection);
    this.menu.show(event.clientX, event.clientY, this.builder.build(kind, this.state(kind, canEdit)));
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

  private state(kind: ContextMenuKind, canEdit: boolean): ContextMenuState {
    return {
      canEdit,
      table: kind === "table" ? (this.host.tableMenuState?.() ?? undefined) : undefined,
      text: kind === "text" ? (this.host.textMenuState?.() ?? undefined) : undefined,
      pictureWrap: kind === "picture" ? (this.host.pictureWrap?.() ?? null) : undefined,
    };
  }

  private kind(pos: CaretPos | null): ContextMenuKind {
    if (pos?.story.slot === "cell") {
      return "table";
    }
    const primary = this.host.selection.primaryRange();
    return primary?.mode === "cell" || primary?.story.slot === "cell" ? "table" : "text";
  }

  private async run(action: ContextMenuAction): Promise<void> {
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
    if (action === "delete") {
      this.host.deleteSelection();
      return;
    }
    const format = FORMAT[action];
    if (format) {
      this.host.applyFormat?.(format);
      return;
    }
    const outline = OUTLINE[action];
    if (outline) {
      this.host.applyOutline?.(outline);
      return;
    }
    if (action === "link") {
      const current = this.host.textMenuState?.()?.link ?? "";
      const value = await this.menu.ask("超链接", { value: current, placeholder: "https:// 或 #书签" });
      if (value == null) {
        return;
      }
      if (!value.trim()) {
        if (current) {
          this.host.clearLink?.();
        }
        return;
      }
      this.host.applyLink?.(value);
      return;
    }
    if (action === "clearLink") {
      this.host.clearLink?.();
      return;
    }
    if (action === "comment") {
      const value = await this.menu.ask("新建批注", { placeholder: "批注内容", multiline: true });
      if (!value?.trim()) {
        return;
      }
      this.host.addComment?.(value);
      return;
    }
    if (action === "find" || action === "replace") {
      this.host.openFind?.(action === "replace");
      return;
    }
    if (action === "insertRowAbove") {
      this.host.insertTableRow?.("above");
      return;
    }
    if (action === "insertRowBelow") {
      this.host.insertTableRow?.("below");
      return;
    }
    if (action === "insertColLeft") {
      this.host.insertTableColumn?.("left");
      return;
    }
    if (action === "insertColRight") {
      this.host.insertTableColumn?.("right");
      return;
    }
    if (action === "deleteRow") {
      this.host.deleteTableRow?.();
      return;
    }
    if (action === "deleteCol") {
      this.host.deleteTableColumn?.();
      return;
    }
    if (action === "mergeCells") {
      this.host.mergeTableCells?.();
      return;
    }
    if (action === "splitCell") {
      this.host.splitTableCell?.();
      return;
    }
    if (action.startsWith("wrap:")) {
      this.host.applyPictureWrap?.(action.slice(5) as PictureWrap);
    }
  }
}
