import type { FormatAction } from "../../edit/FormatCommand";
import type { FindQuery, FindStatus } from "../../edit/Find";
import type { OutlineAction } from "../../edit/OutlineCommand";
import type { PicturePlace, PictureWrap } from "../../edit/PictureTransform";
import type { TableBorderFlags, TableBorderMode, TableBorderPen } from "../../edit/TableBorderApplier";
import { cmToPx, pxToCm } from "../../shared/units";
import { cssFontStack } from "../../layout/measure/FontSpec";
import { ZOOM_LEVELS } from "../workspace/ZoomLevels";
import { BorderMenu } from "./BorderMenu";
import { ColorDialog } from "./ColorDialog";
import { normalizeColor, textColorPaletteMarkup } from "./ColorPalette";
import { fontSelectMarkup, isListedFont } from "./FontList";
import { iconButton, RibbonIcons } from "./RibbonIcons";
import { paintTableGrid, tableGridMarkup } from "./TableGrid";

export interface RibbonHost {
  applyFormat(action: FormatAction): void;
  applyOutline(action: OutlineAction): void;
  applyTableBorder(mode: TableBorderMode): void;
  setBorderPen(pen: Partial<TableBorderPen>): void;
  undo(): void;
  redo(): void;
  newBlank(): void;
  formatState(): RibbonState;
  openFile(): void;
  saveFile(): void;
  insertTable(rows?: number, cols?: number): void;
  insertPageBreak(): void;
  insertBlankPage(): void;
  insertPicture(): void;
  applyPictureWrap(wrap: PictureWrap): void;
  applyPicturePlace(place: PicturePlace): void;
  applyPictureSize(widthPx: number, heightPx: number, lockAspect: boolean): void;
  editHeader(): void;
  editFooter(): void;
  insertTableRow(): void;
  deleteTableRow(): void;
  insertTableColumn(): void;
  deleteTableColumn(): void;
  mergeTableCells(): void;
  splitTableCell(): void;
  insertToc(): void;
  insertPageNumber(): void;
  applyLink(raw: string): void;
  clearLink(): void;
  addComment(text: string): void;
  addFootnote(text: string): void;
  showComment(id: string): void;
  showNote(id: string): void;
  acceptRevision(): void;
  rejectRevision(): void;
  toggleTitlePage(): void;
  toggleEvenOdd(): void;
  setZoom(zoom: number): void;
  print(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  findNext(query: FindQuery): FindStatus;
  findPrev(query: FindQuery): FindStatus;
  replaceMatch(query: FindQuery, replacement: string): FindStatus;
  replaceAllMatches(query: FindQuery, replacement: string): FindStatus;
  closeFind(): void;
}

export interface RibbonState {
  fontFamily: string;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  highlight: string;
  align: string;
  indent: "none" | "first2" | "hang2" | "left2" | "right2";
  canIndentLess: boolean;
  lineSpacing: "1" | "1.5" | "2" | "exact28";
  paraGap: "0" | "before6" | "after6" | "both6";
  vertAlign?: "superscript" | "subscript" | "baseline";
  paragraphStyle: "normal" | "heading1" | "heading2" | "heading3";
  canUndo: boolean;
  canRedo: boolean;
  hasDoc: boolean;
  caption: string;
  inTable: boolean;
  inPicture: boolean;
  pictureWrap?: PictureWrap;
  picturePlace?: PicturePlace | "custom";
  pictureWidth?: number;
  pictureHeight?: number;
  pictureLock?: boolean;
  borderPen: TableBorderPen;
  borderFlags?: TableBorderFlags;
  titlePg: boolean;
  evenAndOdd: boolean;
  /** 当前段的编号级别，从 0 起。没有编号时缺省。 */
  listLevel?: number;
  link?: string;
  comments?: { id: string; author: string; text: string }[];
  notes?: { id: string; text: string }[];
  revision?: "ins" | "del";
  zoom: number;
}

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const HIGHLIGHTS = ["#FFFF00", "#00FF00", "#00FFFF", "#FF00FF", "#0000FF", "#FF0000", "#000080", "#008080", "#008000", "#800080", "#800000", "#808000", "#808080", "#C0C0C0"];

type RibbonPage = "home" | "insert" | "table" | "picture";

export class Ribbon {
  readonly el: HTMLElement;
  private readonly borders = new BorderMenu();
  private readonly colorDialog = new ColorDialog();
  private page: RibbonPage = "home";
  private hadPicture = false;

  constructor(host: HTMLElement, private readonly actions: RibbonHost) {
    this.el = host;
    host.classList.add("ho-word-ribbon");
    host.innerHTML = this.markup();
    host.addEventListener("mousedown", this.onMouseDown);
    host.addEventListener("click", this.onClick);
    host.addEventListener("mouseover", this.onTableGridHover);
    host.addEventListener("change", this.onChange);
    host.addEventListener("keydown", this.onKeyDown);
    this.sync();
  }

  private onMouseDown = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest("select, option, input, textarea, .ho-word-color-dialog")) {
      return;
    }
    event.preventDefault();
  };

  sync(): void {
    const state = this.actions.formatState();
    this.toggle("bold", state.bold);
    this.toggle("italic", state.italic);
    this.toggle("underline", state.underline);
    this.toggle("strike", state.strike);
    this.toggle("superscript", state.vertAlign === "superscript");
    this.toggle("subscript", state.vertAlign === "subscript");
    this.toggle("align-left", state.align === "left" || state.align === "start" || !state.align);
    this.toggle("align-center", state.align === "center");
    this.toggle("align-right", state.align === "right" || state.align === "end");
    this.toggle("align-both", state.align === "both" || state.align === "justify");
    this.toggle("title-page", state.titlePg);
    this.toggle("even-odd", state.evenAndOdd);
    this.setDisabled("undo", !state.canUndo);
    this.setDisabled("redo", !state.canRedo);
    const font = this.el.querySelector<HTMLSelectElement>("[data-select=font]");
    const size = this.el.querySelector<HTMLSelectElement>("[data-select=size]");
    if (font) {
      if (state.fontFamily && !isListedFont(state.fontFamily)) {
        this.ensureDocFont(font, state.fontFamily);
      }
      font.value = state.fontFamily || "宋体";
    }
    if (size) {
      const nearest = SIZES.reduce((best, item) =>
        Math.abs(item - state.fontSizePt) < Math.abs(best - state.fontSizePt) ? item : best,
      );
      size.value = String(nearest);
    }
    const caption = this.el.querySelector("[data-caption]");
    if (caption) {
      caption.textContent = state.caption;
    }
    const color = this.el.querySelector<HTMLElement>("[data-swatch=color]");
    if (color) {
      color.style.background = state.color && state.color !== "auto" ? state.color : "#111111";
    }
    const current = normalizeColor(state.color);
    this.el.querySelectorAll<HTMLElement>(".ho-word-palette-text [data-color]").forEach((button) => {
      button.classList.toggle("is-on", normalizeColor(button.dataset.color) === current);
    });
    const fill = this.el.querySelector<HTMLElement>("[data-swatch=highlight]");
    if (fill) {
      fill.style.background = state.highlight && state.highlight !== "none" ? state.highlight : "#ffffff";
    }
    this.borders.sync(this.el, state.borderFlags, state.borderPen.size, state.borderPen.color, state.inTable);
    this.el.querySelectorAll<HTMLElement>("[data-outline='level']").forEach((button) => {
      button.classList.toggle("is-on", state.listLevel != null && Number(button.dataset.ilvl) === state.listLevel);
    });
    const link = this.el.querySelector<HTMLInputElement>("[data-link-url]");
    if (link && document.activeElement !== link) {
      link.value = state.link ?? "";
    }
    const comments = this.el.querySelector("[data-comment-list]");
    if (comments) {
      comments.innerHTML = reviewList(state.comments ?? [], "comment");
    }
    const notes = this.el.querySelector("[data-note-list]");
    if (notes) {
      notes.innerHTML = reviewList(
        (state.notes ?? []).map((note, index) => ({ id: note.id, author: String(index + 1), text: note.text })),
        "note",
      );
    }
    this.toggle("accept-revision", state.revision === "ins");
    this.toggle("reject-revision", state.revision === "del");
    const tableTab = this.el.querySelector<HTMLButtonElement>("[data-tab=table]");
    if (tableTab) {
      tableTab.hidden = !state.inTable;
    }
    const pictureTab = this.el.querySelector<HTMLButtonElement>("[data-tab=picture]");
    if (pictureTab) {
      pictureTab.hidden = !state.inPicture;
    }
    if (state.inPicture && !this.hadPicture) {
      this.showPage("picture");
    } else if (!state.inPicture && this.page === "picture") {
      this.showPage("home");
    }
    this.hadPicture = state.inPicture;
    if (!state.inTable && this.page === "table") {
      this.showPage("home");
    }
    this.el.querySelectorAll<HTMLElement>("[data-picture-wrap]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.pictureWrap === state.pictureWrap);
    });
    this.el.querySelectorAll<HTMLElement>("[data-picture-place]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.picturePlace === state.picturePlace);
    });
    const width = this.el.querySelector<HTMLInputElement>("[data-picture-size=width]");
    const height = this.el.querySelector<HTMLInputElement>("[data-picture-size=height]");
    if (width && document.activeElement !== width) {
      width.value = cmText(state.pictureWidth);
    }
    if (height && document.activeElement !== height) {
      height.value = cmText(state.pictureHeight);
    }
    const lock = this.el.querySelector<HTMLInputElement>("[data-picture-lock]");
    if (lock) {
      lock.checked = state.pictureLock !== false;
    }
    const zoom = this.el.querySelector<HTMLSelectElement>("[data-select=zoom]");
    if (zoom) {
      const nearest = ZOOM_LEVELS.reduce((best, item) =>
        Math.abs(item - state.zoom) < Math.abs(best - state.zoom) ? item : best,
      );
      const fit = zoom.querySelector<HTMLOptionElement>("option[data-fit]");
      if (Math.abs(nearest - state.zoom) < 0.011) {
        fit?.remove();
        zoom.value = String(nearest);
      } else {
        const option = fit ?? document.createElement("option");
        option.dataset.fit = "1";
        option.value = String(state.zoom);
        option.textContent = `${Math.round(state.zoom * 100)}%`;
        if (!fit) {
          zoom.append(option);
        }
        zoom.value = option.value;
      }
    }
    this.setDisabled("indent-less", !state.canIndentLess);
    this.markChoice("[data-indent]", firstLineKind(state.indent));
    this.markChoice("[data-spacing]", state.lineSpacing);
    this.markChoice("[data-gap]", state.paraGap);
    this.markChoice("[data-style]", state.paragraphStyle);
  }

  private ensureDocFont(select: HTMLSelectElement, family: string): void {
    if ([...select.options].some((option) => option.value === family)) {
      return;
    }
    let group = select.querySelector<HTMLOptGroupElement>("optgroup[data-doc-fonts]");
    if (!group) {
      group = document.createElement("optgroup");
      group.label = "文档字体";
      group.dataset.docFonts = "1";
      select.append(group);
    }
    const extra = document.createElement("option");
    extra.value = family;
    extra.textContent = family;
    extra.style.fontFamily = cssFontStack(family);
    group.append(extra);
  }

  private markChoice(selector: string, value: string): void {
    this.el.querySelectorAll<HTMLElement>(selector).forEach((item) => {
      const key = item.dataset.indent ?? item.dataset.spacing ?? item.dataset.gap ?? item.dataset.style;
      item.classList.toggle("is-on", key === value);
    });
  }

  private onClick = (event: Event): void => {
    const el = event.target as HTMLElement;
    const chip = el.closest<HTMLElement>("[data-color], [data-fill], [data-border-color], [data-border]");
    if (chip?.dataset.borderColor) {
      this.actions.setBorderPen({ color: chip.dataset.borderColor });
      this.sync();
      return;
    }
    if (chip?.dataset.border) {
      this.actions.applyTableBorder(chip.dataset.border as TableBorderMode);
      this.closeDrops();
      this.sync();
      return;
    }
    const outline = el.closest<HTMLElement>("[data-outline]");
    if (outline?.dataset.outline) {
      const kind = outline.dataset.outline;
      if (kind === "level") {
        this.actions.applyOutline({ type: "level", ilvl: Number(outline.dataset.ilvl) });
      } else if (kind === "apply" || kind === "promote" || kind === "demote" || kind === "clear") {
        this.actions.applyOutline({ type: kind });
      }
      this.closeDrops();
      this.sync();
      return;
    }
    if (chip?.dataset.color) {
      this.actions.applyFormat({ type: "color", value: chip.dataset.color });
      this.closeDrops();
      this.sync();
      return;
    }
    if (chip?.dataset.fill) {
      this.actions.applyFormat({ type: "highlight", value: chip.dataset.fill });
      this.closeDrops();
      this.sync();
      return;
    }
    const indent = el.closest<HTMLElement>("[data-indent]")?.dataset.indent;
    if (indent && isIndent(indent)) {
      this.actions.applyFormat({ type: "indent", value: indent });
      this.closeDrops();
      this.sync();
      return;
    }
    const spacing = el.closest<HTMLElement>("[data-spacing]")?.dataset.spacing;
    if (spacing && isSpacing(spacing)) {
      this.actions.applyFormat({ type: "lineSpacing", value: spacing });
      this.closeDrops();
      this.sync();
      return;
    }
    const gap = el.closest<HTMLElement>("[data-gap]")?.dataset.gap;
    if (gap && isGap(gap)) {
      this.actions.applyFormat({ type: "paraGap", value: gap });
      this.closeDrops();
      this.sync();
      return;
    }
    const style = el.closest<HTMLElement>("[data-style]")?.dataset.style;
    if (style && isStyle(style)) {
      this.actions.applyFormat({ type: "style", value: style });
      this.closeDrops();
      this.sync();
      return;
    }
    const tableCell = el.closest<HTMLElement>("[data-table-rows]");
    if (tableCell?.dataset.tableRows && tableCell.dataset.tableCols) {
      this.actions.insertTable(Number(tableCell.dataset.tableRows), Number(tableCell.dataset.tableCols));
      this.closeDrops();
      this.sync();
      return;
    }
    const custom = el.closest<HTMLElement>("[data-custom-color]");
    if (custom?.dataset.customColor === "text" || custom?.dataset.customColor === "fill") {
      const kind = custom.dataset.customColor;
      this.closeDrops();
      const state = this.actions.formatState();
      const initial = kind === "text" ? state.color : state.highlight;
      this.colorDialog.open(initial && initial !== "none" && initial !== "auto" ? initial : "#000000", (hex) => {
        this.actions.applyFormat(kind === "text" ? { type: "color", value: hex } : { type: "highlight", value: hex });
        this.sync();
      });
      return;
    }
    const commentId = el.closest<HTMLElement>("[data-comment-id]")?.dataset.commentId;
    if (commentId) {
      this.actions.showComment(commentId);
      this.closeDrops();
      this.sync();
      return;
    }
    const noteId = el.closest<HTMLElement>("[data-note-id]")?.dataset.noteId;
    if (noteId) {
      this.actions.showNote(noteId);
      this.closeDrops();
      this.sync();
      return;
    }
    if (el.closest("[data-keep-drop], .ho-word-color-dialog")) {
      return;
    }
    const toggle = el.closest<HTMLElement>("[data-drop-toggle]");
    if (toggle) {
      if (toggle.closest(".ho-word-border-drop")?.classList.contains("is-disabled")) {
        return;
      }
      const drop = toggle.closest<HTMLElement>(".ho-word-drop");
      const open = drop?.classList.contains("is-open");
      this.closeDrops();
      drop?.classList.toggle("is-open", !open);
      if (drop && !open) {
        requestAnimationFrame(() => this.placeOpenDrop(drop));
      }
      return;
    }
    const wrap = el.closest<HTMLElement>("[data-picture-wrap]")?.dataset.pictureWrap;
    if (wrap && isPictureWrap(wrap)) {
      this.actions.applyPictureWrap(wrap);
      this.closeDrops();
      this.sync();
      return;
    }
    const place = el.closest<HTMLElement>("[data-picture-place]")?.dataset.picturePlace;
    if (place && isPicturePlace(place)) {
      this.actions.applyPicturePlace(place);
      this.closeDrops();
      this.sync();
      return;
    }
    const tab = el.closest<HTMLElement>("[data-tab]");
    if (tab?.dataset.tab === "home" || tab?.dataset.tab === "insert" || tab?.dataset.tab === "table" || tab?.dataset.tab === "picture") {
      this.closeDrops();
      this.showPage(tab.dataset.tab);
      return;
    }
    this.closeDrops();
    const target = el.closest<HTMLElement>("[data-act]");
    if (!target) {
      return;
    }
    const act = target.dataset.act;
    if (act === "undo") {
      this.actions.undo();
    } else if (act === "redo") {
      this.actions.redo();
    } else if (act === "new") {
      this.actions.newBlank();
    } else if (act === "open") {
      this.actions.openFile();
    } else if (act === "save") {
      this.actions.saveFile();
    } else if (act === "cut") {
      this.actions.cut();
    } else if (act === "copy") {
      this.actions.copy();
    } else if (act === "paste") {
      this.actions.paste();
    } else if (act === "insert-table") {
      this.actions.insertTable();
    } else if (act === "insert-page-break") {
      this.actions.insertPageBreak();
    } else if (act === "insert-blank-page") {
      this.actions.insertBlankPage();
    } else if (act === "insert-picture") {
      this.actions.insertPicture();
    } else if (act === "edit-header") {
      this.actions.editHeader();
    } else if (act === "edit-footer") {
      this.actions.editFooter();
    } else if (act === "insert-row") {
      this.actions.insertTableRow();
    } else if (act === "delete-row") {
      this.actions.deleteTableRow();
    } else if (act === "insert-col") {
      this.actions.insertTableColumn();
    } else if (act === "delete-col") {
      this.actions.deleteTableColumn();
    } else if (act === "merge-cells") {
      this.actions.mergeTableCells();
    } else if (act === "split-cell") {
      this.actions.splitTableCell();
    } else if (act === "apply-link") {
      const input = this.el.querySelector<HTMLInputElement>("[data-link-url]");
      this.actions.applyLink(input?.value ?? "");
    } else if (act === "clear-link") {
      this.actions.clearLink();
    } else if (act === "add-comment") {
      const input = this.el.querySelector<HTMLTextAreaElement>("[data-comment-text]");
      this.actions.addComment(input?.value ?? "");
      if (input) {
        input.value = "";
      }
    } else if (act === "add-note") {
      const input = this.el.querySelector<HTMLInputElement>("[data-note-text]");
      this.actions.addFootnote(input?.value ?? "");
      if (input) {
        input.value = "";
      }
    } else if (act === "accept-revision") {
      this.actions.acceptRevision();
    } else if (act === "reject-revision") {
      this.actions.rejectRevision();
    } else if (act === "insert-toc") {
      this.actions.insertToc();
    } else if (act === "page-number") {
      this.actions.insertPageNumber();
    } else if (act === "title-page") {
      this.actions.toggleTitlePage();
    } else if (act === "even-odd") {
      this.actions.toggleEvenOdd();
    } else if (act === "bold" || act === "italic" || act === "underline" || act === "strike" || act === "clear" || act === "superscript" || act === "subscript") {
      this.actions.applyFormat({ type: act });
    } else if (act === "align-left") {
      this.actions.applyFormat({ type: "align", value: "left" });
    } else if (act === "align-center") {
      this.actions.applyFormat({ type: "align", value: "center" });
    } else if (act === "align-right") {
      this.actions.applyFormat({ type: "align", value: "right" });
    } else if (act === "align-both") {
      this.actions.applyFormat({ type: "align", value: "both" });
    } else if (act === "indent-less") {
      this.actions.applyFormat({ type: "indentStep", value: -1 });
    } else if (act === "indent-more") {
      this.actions.applyFormat({ type: "indentStep", value: 1 });
    } else if (act === "find-open") {
      this.openFind();
    } else if (act === "find-replace") {
      this.openFind(true);
    } else if (act === "find-close") {
      this.closeFind();
    } else if (act === "find-next" || act === "find-prev") {
      this.runFind(act === "find-next" ? "next" : "prev");
    } else if (act === "replace-one" || act === "replace-all") {
      this.runReplace(act === "replace-all");
    } else if (act === "print") {
      this.actions.print();
    } else if (act === "size-up" || act === "size-down") {
      const current = this.actions.formatState().fontSizePt;
      const index = SIZES.findIndex((item) => item >= current);
      const at = index < 0 ? SIZES.length - 1 : index;
      const next = act === "size-up" ? SIZES[Math.min(SIZES.length - 1, at + 1)] : SIZES[Math.max(0, at - 1)];
      this.actions.applyFormat({ type: "fontSizePt", value: next });
    }
    this.sync();
  };

  private closeDrops(): void {
    this.el.querySelectorAll<HTMLElement>(".ho-word-drop.is-open").forEach((drop) => {
      drop.classList.remove("is-open");
      this.clearDropPosition(drop);
    });
  }

  /** 窄屏工具栏会横向滚动，菜单改成相对屏幕定位，避免被裁掉。 */
  private placeOpenDrop(drop: HTMLElement): void {
    const menu = drop.querySelector<HTMLElement>(".ho-word-outline-menu, .ho-word-border-menu, .ho-word-palette");
    if (!menu) {
      return;
    }
    if (window.innerWidth > 900) {
      this.clearDropPosition(drop);
      return;
    }
    const anchor = drop.querySelector("[data-drop-toggle]") ?? drop;
    const rect = anchor.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.zIndex = "40";
    menu.style.maxHeight = `${Math.max(160, window.innerHeight - rect.bottom - 12)}px`;
    const width = menu.offsetWidth || 220;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    menu.style.top = `${rect.bottom + 4}px`;
  }

  private clearDropPosition(drop: HTMLElement): void {
    const menu = drop.querySelector<HTMLElement>(".ho-word-outline-menu, .ho-word-border-menu, .ho-word-palette");
    if (!menu) {
      return;
    }
    menu.style.position = "";
    menu.style.left = "";
    menu.style.top = "";
    menu.style.zIndex = "";
    menu.style.maxHeight = "";
  }

  private onChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    if (select.dataset.select === "font") {
      this.actions.applyFormat({ type: "fontFamily", value: select.value });
    }
    if (select.dataset.select === "size") {
      this.actions.applyFormat({ type: "fontSizePt", value: Number(select.value) });
    }
    if (select.dataset.borderSize) {
      this.actions.setBorderPen({ size: select.value });
    }
    if (select.dataset.select === "zoom") {
      this.actions.setZoom(Number(select.value));
    }
    const size = (event.target as HTMLElement).dataset.pictureSize;
    if (size === "width" || size === "height") {
      const width = Number(this.el.querySelector<HTMLInputElement>("[data-picture-size=width]")?.value);
      const height = Number(this.el.querySelector<HTMLInputElement>("[data-picture-size=height]")?.value);
      const lock = this.el.querySelector<HTMLInputElement>("[data-picture-lock]")?.checked !== false;
      this.actions.applyPictureSize(cmToPxSafe(width), cmToPxSafe(height), lock);
    }
    if ((event.target as HTMLElement).hasAttribute("data-picture-lock")) {
      const width = Number(this.el.querySelector<HTMLInputElement>("[data-picture-size=width]")?.value);
      const height = Number(this.el.querySelector<HTMLInputElement>("[data-picture-size=height]")?.value);
      const lock = (event.target as HTMLInputElement).checked;
      this.actions.applyPictureSize(cmToPxSafe(width), cmToPxSafe(height), lock);
    }
    this.sync();
  };

  private showPage(page: RibbonPage): void {
    this.page = page;
    this.el.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.tab === page);
    });
    this.el.querySelectorAll<HTMLElement>("[data-page]").forEach((panel) => {
      panel.hidden = panel.dataset.page !== page;
    });
  }

  openFind(focusReplace = false): void {
    const bar = this.el.querySelector<HTMLElement>("[data-findbar]");
    if (!bar) {
      return;
    }
    bar.hidden = false;
    const input = this.el.querySelector<HTMLInputElement>(focusReplace ? "[data-replace]" : "[data-find]");
    input?.focus();
    input?.select();
  }

  private closeFind(): void {
    const bar = this.el.querySelector<HTMLElement>("[data-findbar]");
    if (bar) {
      bar.hidden = true;
    }
    const status = this.el.querySelector("[data-find-status]");
    if (status) {
      status.textContent = "";
    }
    this.actions.closeFind();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("[data-findbar]")) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeFind();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.runFind(event.shiftKey ? "prev" : "next");
    }
  };

  private runFind(direction: "next" | "prev"): void {
    const query = this.findQuery();
    if (!query.text) {
      this.showFindStatus({ index: 0, total: 0 }, true);
      return;
    }
    const status = direction === "next" ? this.actions.findNext(query) : this.actions.findPrev(query);
    this.showFindStatus(status);
  }

  private runReplace(all: boolean): void {
    const query = this.findQuery();
    if (!query.text) {
      this.showFindStatus({ index: 0, total: 0 }, true);
      return;
    }
    const replacement = this.el.querySelector<HTMLInputElement>("[data-replace]")?.value ?? "";
    const status = all
      ? this.actions.replaceAllMatches(query, replacement)
      : this.actions.replaceMatch(query, replacement);
    this.showFindStatus(status);
  }

  private findQuery(): FindQuery {
    return {
      text: this.el.querySelector<HTMLInputElement>("[data-find]")?.value ?? "",
      matchCase: !!this.el.querySelector<HTMLInputElement>("[data-match-case]")?.checked,
    };
  }

  private showFindStatus(status: FindStatus, empty = false): void {
    const el = this.el.querySelector("[data-find-status]");
    if (!el) {
      return;
    }
    if (empty) {
      el.textContent = "输入查找内容";
      return;
    }
    if (status.replaced != null && status.index === 0) {
      el.textContent = status.total ? `已替换 ${status.replaced} 处，还有 ${status.total} 处` : `已替换 ${status.replaced} 处`;
      return;
    }
    el.textContent = status.total ? `${status.index}/${status.total}` : "未找到";
  }

  private toggle(act: string, on: boolean): void {
    this.el.querySelector(`[data-act="${act}"]`)?.classList.toggle("is-on", on);
  }

  private setDisabled(act: string, disabled: boolean): void {
    const button = this.el.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);
    if (button) {
      button.disabled = disabled;
    }
  }

  private onTableGridHover = (event: Event): void => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-table-rows]");
    const grid = this.el.querySelector<HTMLElement>(".ho-word-table-grid");
    if (!cell || !grid?.contains(cell)) {
      return;
    }
    const rows = Number(cell.dataset.tableRows);
    const cols = Number(cell.dataset.tableCols);
    paintTableGrid(grid, rows, cols);
    const label = this.el.querySelector("[data-table-size]");
    if (label) {
      label.textContent = `${rows} × ${cols} 表格`;
    }
  };

  private linkMarkup(): string {
    return `
      <div class="ho-word-drop">
        <button type="button" class="ho-word-big" data-drop-toggle title="插入或修改超链接">${RibbonIcons.link}<span>链接</span></button>
        <div class="ho-word-outline-menu ho-word-link-menu">
          <label class="ho-word-link-row" data-keep-drop>
            <input data-link-url placeholder="https:// 或 #书签" />
          </label>
          <button type="button" data-act="apply-link">设置链接</button>
          <button type="button" data-act="clear-link">取消链接</button>
        </div>
      </div>`;
  }

  private commentMarkup(): string {
    return `
      <div class="ho-word-drop">
        <button type="button" class="ho-word-big" data-drop-toggle title="新建批注">${RibbonIcons.comment}<span>批注</span></button>
        <div class="ho-word-outline-menu ho-word-review-menu">
          <textarea data-comment-text data-keep-drop placeholder="批注内容"></textarea>
          <button type="button" data-act="add-comment">插入批注</button>
          <div class="ho-word-review-list" data-comment-list></div>
        </div>
      </div>`;
  }

  private headerMarkup(): string {
    return `
      <div class="ho-word-drop">
        <button type="button" class="ho-word-big" data-drop-toggle title="页眉">${RibbonIcons.header}<span>页眉</span></button>
        <div class="ho-word-outline-menu">
          <button type="button" data-act="edit-header">编辑页眉</button>
          <div class="ho-word-border-split"></div>
          <button type="button" data-act="title-page">首页不同</button>
          <button type="button" data-act="even-odd">奇偶页不同</button>
        </div>
      </div>`;
  }

  private pictureWrapMarkup(): string {
    const items: Array<{ id: PictureWrap; label: string }> = [
      { id: "inline", label: "嵌入型" },
      { id: "square", label: "四周型" },
      { id: "tight", label: "紧密型" },
      { id: "through", label: "穿越型" },
      { id: "topBottom", label: "上下型" },
      { id: "behind", label: "衬于文字下方" },
      { id: "front", label: "浮于文字上方" },
    ];
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="文字环绕">${RibbonIcons.wrap}<span>环绕文字</span></button>
      <div class="ho-word-outline-menu">
        ${items.map((item) => `<button type="button" data-picture-wrap="${item.id}">${item.label}</button>`).join("")}
      </div>
    </div>`;
  }

  private picturePlaceMarkup(): string {
    const places: PicturePlace[] = [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "middle-center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="位置">${RibbonIcons.position}<span>位置</span></button>
      <div class="ho-word-outline-menu ho-word-picture-places">
        <div class="ho-word-picture-place-grid">
          ${places.map((place) => `<button type="button" data-picture-place="${place}" title="${placeLabel(place)}"></button>`).join("")}
        </div>
      </div>
    </div>`;
  }

  private outlineMarkup(): string {
    const levels = Array.from({ length: 9 }, (_, ilvl) => {
      const sample = Array.from({ length: ilvl + 1 }, () => "1").join(".");
      return `<button type="button" data-outline="level" data-ilvl="${ilvl}">
        <span class="ho-word-outline-sample" style="padding-left:${ilvl * 8}px">${sample}</span>
        <span>${ilvl + 1} 级</span>
      </button>`;
    }).join("");
    return `
      <div class="ho-word-drop ho-word-outline-drop">
        <button type="button" data-drop-toggle title="大纲编号。Tab 降低一级，Shift+Tab 提升一级">${RibbonIcons.list}</button>
        <div class="ho-word-outline-menu">
          <button type="button" data-outline="apply">套用大纲</button>
          <div class="ho-word-border-split"></div>
          ${levels}
          <div class="ho-word-border-split"></div>
          <button type="button" data-outline="promote">提升一级</button>
          <button type="button" data-outline="demote">降低一级</button>
          <button type="button" data-outline="clear">取消编号</button>
        </div>
      </div>
    `;
  }

  private markup(): string {
    return `
      <div class="ho-word-ribbon-title">
        <div class="ho-word-brand">humpk-office</div>
        <div class="ho-word-tabs">
          <button type="button" data-tab="home" class="is-on">开始</button>
          <button type="button" data-tab="insert">插入</button>
          <button type="button" data-tab="table" hidden>表格工具</button>
          <button type="button" data-tab="picture" hidden>图片工具</button>
        </div>
        <div class="ho-word-qat">
          <button type="button" data-act="undo" title="撤销 (Ctrl+Z)">撤销</button>
          <button type="button" data-act="redo" title="重做 (Ctrl+Y)">重做</button>
          <span class="ho-word-qat-split"></span>
          <button type="button" data-act="new" title="新建">新建</button>
          <button type="button" data-act="open" title="打开">打开</button>
          <button type="button" data-act="save" title="保存">保存</button>
          <span class="ho-word-qat-split"></span>
          <button type="button" data-act="print" title="打印 (Ctrl+P)">打印</button>
          <select data-select="zoom" title="缩放">${ZOOM_LEVELS.map((level) => `<option value="${level}">${level * 100}%</option>`).join("")}</select>
        </div>
        <div class="ho-word-caption" data-caption>空文档</div>
      </div>
      <div class="ho-word-ribbon-page" data-page="home">
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-clip">
            <button type="button" class="ho-word-big" data-act="paste" title="粘贴 (Ctrl+V)">${RibbonIcons.paste}<span>粘贴</span></button>
            <div class="ho-word-stack">
              <button type="button" data-act="cut" title="剪切 (Ctrl+X)">${RibbonIcons.cut}<span>剪切</span></button>
              <button type="button" data-act="copy" title="复制 (Ctrl+C)">${RibbonIcons.copy}<span>复制</span></button>
            </div>
          </div>
          <span>剪贴板</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-font">
            <div class="ho-word-row">
              <select data-select="font" title="字体">${fontSelectMarkup()}</select>
              <select data-select="size">${SIZES.map((size) => `<option value="${size}">${size}</option>`).join("")}</select>
              <button type="button" data-act="size-up" title="增大字号">A+</button>
              <button type="button" data-act="size-down" title="减小字号">A-</button>
              <button type="button" data-act="clear" title="清除格式">Aa</button>
            </div>
            <div class="ho-word-row">
              <button type="button" data-act="bold" title="加粗 (Ctrl+B)"><b>B</b></button>
              <button type="button" data-act="italic" title="倾斜 (Ctrl+I)"><i>I</i></button>
              <button type="button" data-act="underline" title="下划线 (Ctrl+U)"><u>U</u></button>
              <button type="button" data-act="strike" title="删除线"><s>abc</s></button>
              <button type="button" data-act="subscript" title="下标">x₂</button>
              <button type="button" data-act="superscript" title="上标">x²</button>
              <div class="ho-word-drop">
                <button type="button" class="ho-word-color-cmd" data-drop-toggle title="突出显示">${RibbonIcons.highlight}<span data-swatch="highlight"></span></button>
                <div class="ho-word-palette ho-word-palette-fill">
                  <button type="button" data-fill="none" class="ho-word-palette-none">无颜色</button>
                  ${HIGHLIGHTS.map((fill) => `<button type="button" data-fill="${fill}" style="background:${fill}"></button>`).join("")}
                  ${moreColors("fill")}
                </div>
              </div>
              <div class="ho-word-drop">
                <button type="button" class="ho-word-color-cmd" data-drop-toggle title="字体颜色"><span class="ho-word-color-letter">A</span><span data-swatch="color"></span></button>
                ${textColorPaletteMarkup()}
              </div>
            </div>
          </div>
          <span>字体</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-para">
            <div class="ho-word-row">
              ${this.outlineMarkup()}
              ${iconButton("indent-less", "减少缩进", RibbonIcons.indentLess)}
              ${iconButton("indent-more", "增加缩进", RibbonIcons.indentMore)}
              <div class="ho-word-drop">
                <button type="button" data-drop-toggle title="首行和悬挂缩进">${RibbonIcons.firstLine}</button>
                <div class="ho-word-outline-menu">
                  <button type="button" data-indent="none">无首行缩进</button>
                  <button type="button" data-indent="first2">首行 2 字</button>
                  <button type="button" data-indent="hang2">悬挂 2 字</button>
                </div>
              </div>
            </div>
            <div class="ho-word-row">
              ${iconButton("align-left", "左对齐", RibbonIcons.alignLeft)}
              ${iconButton("align-center", "居中", RibbonIcons.alignCenter)}
              ${iconButton("align-right", "右对齐", RibbonIcons.alignRight)}
              ${iconButton("align-both", "两端对齐", RibbonIcons.alignBoth)}
              <div class="ho-word-drop">
                <button type="button" data-drop-toggle title="行距和段距">${RibbonIcons.spacing}</button>
                <div class="ho-word-outline-menu">
                  <button type="button" data-spacing="1">1.0</button>
                  <button type="button" data-spacing="1.5">1.5</button>
                  <button type="button" data-spacing="2">2.0</button>
                  <button type="button" data-spacing="exact28">固定 28 磅</button>
                  <div class="ho-word-border-split"></div>
                  <button type="button" data-gap="0">段距 0</button>
                  <button type="button" data-gap="before6">段前 6 磅</button>
                  <button type="button" data-gap="after6">段后 6 磅</button>
                  <button type="button" data-gap="both6">段前段后 6 磅</button>
                </div>
              </div>
            </div>
          </div>
          <span>段落</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-styles">
            ${styleCard("normal", "正文", "AaBbCcDdEe")}
            ${styleCard("heading1", "标题 1", "AaBbCc")}
            ${styleCard("heading2", "标题 2", "AaBbCc")}
            ${styleCard("heading3", "标题 3", "AaBbCc")}
          </div>
          <span>样式</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-edit">
            <button type="button" data-act="find-open" title="查找 (Ctrl+F)">${RibbonIcons.find}<span>查找</span></button>
            <button type="button" data-act="find-replace" title="替换 (Ctrl+H)">${RibbonIcons.replace}<span>替换</span></button>
          </div>
          <span>编辑</span>
        </section>
      </div>
      <div class="ho-word-ribbon-page" data-page="insert" hidden>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            <button type="button" class="ho-word-big" data-act="insert-blank-page" title="在光标处插入一页空白">${RibbonIcons.blankPage}<span>空白页</span></button>
            <button type="button" class="ho-word-big" data-act="insert-page-break" title="从这里另起一页">${RibbonIcons.pageBreak}<span>分页符</span></button>
          </div>
          <span>页面</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${tableGridMarkup()}
          </div>
          <span>表格</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            <button type="button" class="ho-word-big" data-act="insert-picture" title="插入图片">${RibbonIcons.picture}<span>图片</span></button>
          </div>
          <span>插图</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${this.linkMarkup()}
          </div>
          <span>链接</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${this.commentMarkup()}
          </div>
          <span>批注</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${this.headerMarkup()}
            <button type="button" class="ho-word-big" data-act="edit-footer" title="编辑页脚">${RibbonIcons.footer}<span>页脚</span></button>
            <button type="button" class="ho-word-big" data-act="page-number" title="在页眉或页脚插入页码">${RibbonIcons.pageNumber}<span>页码</span></button>
          </div>
          <span>页眉和页脚</span>
        </section>
      </div>
      <div class="ho-word-ribbon-page" data-page="picture" hidden>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${this.pictureWrapMarkup()}
            ${this.picturePlaceMarkup()}
          </div>
          <span>排列</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-picture-size">
            <label>宽度<input type="number" min="0.2" step="0.1" data-picture-size="width" title="宽度（厘米）" /></label>
            <label>高度<input type="number" min="0.2" step="0.1" data-picture-size="height" title="高度（厘米）" /></label>
            <label class="ho-word-picture-lock"><input type="checkbox" data-picture-lock checked />锁定纵横比</label>
          </div>
          <span>大小</span>
        </section>
      </div>
      <div class="ho-word-ribbon-page" data-page="table" hidden>
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            <button type="button" data-act="insert-row" title="在下方插入行">插入行</button>
            <button type="button" data-act="delete-row" title="删除行">删除行</button>
            <button type="button" data-act="insert-col" title="在右侧插入列">插入列</button>
            <button type="button" data-act="delete-col" title="删除列">删除列</button>
            <button type="button" data-act="merge-cells" title="合并单元格">合并</button>
            <button type="button" data-act="split-cell" title="拆分单元格">拆分</button>
            ${this.borders.markup()}
          </div>
          <span>布局</span>
        </section>
      </div>
      <div class="ho-word-findbar" data-findbar hidden>
        <input type="text" data-find placeholder="查找" />
        <input type="text" data-replace placeholder="替换为" />
        <label><input type="checkbox" data-match-case />区分大小写</label>
        <button type="button" data-act="find-prev" title="上一个 (Shift+Enter)">上一个</button>
        <button type="button" data-act="find-next" title="下一个 (Enter)">下一个</button>
        <button type="button" data-act="replace-one">替换</button>
        <button type="button" data-act="replace-all">全部替换</button>
        <span data-find-status></span>
        <button type="button" data-act="find-close" title="关闭 (Esc)">关闭</button>
      </div>
    `;
  }
}

function moreColors(kind: "text" | "fill"): string {
  return `<button type="button" data-custom-color="${kind}" class="ho-word-palette-more">更多颜色...</button>`;
}

function styleCard(id: "normal" | "heading1" | "heading2" | "heading3", name: string, sample: string): string {
  return `<button type="button" class="ho-word-style-card" data-style="${id}" title="${name}">
      <span class="ho-word-style-preview ho-word-style-${id}">${sample}</span>
      <span>${name}</span>
    </button>`;
}

function firstLineKind(indent: RibbonState["indent"]): "none" | "first2" | "hang2" {
  return indent === "first2" || indent === "hang2" ? indent : "none";
}

function reviewList(items: { id: string; author: string; text: string }[], kind: "comment" | "note"): string {
  if (!items.length) {
    return `<span class="ho-word-review-empty">暂无${kind === "comment" ? "批注" : "脚注"}</span>`;
  }
  const attr = kind === "comment" ? "data-comment-id" : "data-note-id";
  return items
    .map((item) => `<button type="button" ${attr}="${escapeHtml(item.id)}">${escapeHtml(item.author)}：${escapeHtml(item.text)}</button>`)
    .join("");
}

function isIndent(value: string): value is "none" | "first2" | "hang2" | "left2" | "right2" {
  return value === "none" || value === "first2" || value === "hang2" || value === "left2" || value === "right2";
}

function isSpacing(value: string): value is "1" | "1.5" | "2" | "exact28" {
  return value === "1" || value === "1.5" || value === "2" || value === "exact28";
}

function isGap(value: string): value is "0" | "before6" | "after6" | "both6" {
  return value === "0" || value === "before6" || value === "after6" || value === "both6";
}

function isStyle(value: string): value is "normal" | "heading1" | "heading2" | "heading3" {
  return value === "normal" || value === "heading1" || value === "heading2" || value === "heading3";
}

function isPictureWrap(value: string): value is PictureWrap {
  return value === "inline" || value === "square" || value === "tight" || value === "through" || value === "topBottom" || value === "behind" || value === "front";
}

function isPicturePlace(value: string): value is PicturePlace {
  return value === "top-left" || value === "top-center" || value === "top-right" || value === "middle-left" || value === "middle-center" || value === "middle-right" || value === "bottom-left" || value === "bottom-center" || value === "bottom-right";
}

function placeLabel(place: PicturePlace): string {
  const names: Record<PicturePlace, string> = {
    "top-left": "左上",
    "top-center": "上中",
    "top-right": "右上",
    "middle-left": "左中",
    "middle-center": "正中",
    "middle-right": "右中",
    "bottom-left": "左下",
    "bottom-center": "下中",
    "bottom-right": "右下",
  };
  return names[place];
}

function cmText(px: number | undefined): string {
  return pxToCm(px ?? 0).toFixed(2);
}

function cmToPxSafe(cm: number): number {
  return cmToPx(Number.isFinite(cm) ? cm : 0);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
