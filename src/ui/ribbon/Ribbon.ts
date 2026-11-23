import type { FormatAction } from "../../edit/FormatCommand";
import type { FindQuery, FindStatus } from "../../edit/Find";
import type { OutlineAction } from "../../edit/OutlineCommand";
import type { TableBorderFlags, TableBorderMode, TableBorderPen } from "../../edit/TableBorderApplier";
import { ZOOM_LEVELS } from "../workspace/ZoomLevels";
import { BorderMenu } from "./BorderMenu";

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
  insertTable(): void;
  insertPageBreak(): void;
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
  lineSpacing: "1" | "1.5" | "2" | "exact28";
  paraGap: "0" | "before6" | "after6" | "both6";
  vertAlign?: "superscript" | "subscript" | "baseline";
  paragraphStyle: "normal" | "heading1" | "heading2" | "heading3";
  canUndo: boolean;
  canRedo: boolean;
  hasDoc: boolean;
  caption: string;
  inTable: boolean;
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

const FONTS = ["宋体", "黑体", "楷体", "仿宋", "微软雅黑", "Times New Roman", "Arial", "Calibri"];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const TEXT_COLORS = ["#111111", "#C00000", "#FF0000", "#ED7D31", "#FFC000", "#70AD47", "#00B0F0", "#0070C0", "#7030A0", "#FFFFFF"];
const FILLS = ["none", "#FFFF00", "#00FF00", "#00FFFF", "#FF00FF", "#FFC7CE", "#C6EFCE", "#FFEB9C", "#D9D9D9"];

export class Ribbon {
  readonly el: HTMLElement;
  private readonly borders = new BorderMenu();

  constructor(host: HTMLElement, private readonly actions: RibbonHost) {
    this.el = host;
    host.classList.add("ho-word-ribbon");
    host.innerHTML = this.markup();
    host.addEventListener("mousedown", this.onMouseDown);
    host.addEventListener("click", this.onClick);
    host.addEventListener("change", this.onChange);
    host.addEventListener("keydown", this.onKeyDown);
    this.sync();
  }

  private onMouseDown = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest("select, option, input, textarea")) {
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
      if (state.fontFamily && !FONTS.includes(state.fontFamily)) {
        const extra = document.createElement("option");
        extra.value = state.fontFamily;
        extra.textContent = state.fontFamily;
        font.append(extra);
      }
      font.value = state.fontFamily || FONTS[0];
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
      color.style.background = state.color || "#111111";
    }
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
    this.setSelect("indent", state.indent);
    this.setSelect("spacing", state.lineSpacing);
    this.setSelect("para-gap", state.paraGap);
    this.setSelect("style", state.paragraphStyle);
  }

  private setSelect(name: string, value: string): void {
    const select = this.el.querySelector<HTMLSelectElement>(`[data-select=${name}]`);
    if (select && select.value !== value) {
      select.value = value;
    }
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
    if (el.closest("[data-keep-drop]")) {
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
    } else if (act === "insert-table") {
      this.actions.insertTable();
    } else if (act === "insert-page-break") {
      this.actions.insertPageBreak();
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
    } else if (act === "find-open") {
      this.openFind();
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
    if (select.dataset.select === "indent" && isIndent(select.value)) {
      this.actions.applyFormat({ type: "indent", value: select.value });
    }
    if (select.dataset.select === "spacing" && isSpacing(select.value)) {
      this.actions.applyFormat({ type: "lineSpacing", value: select.value });
    }
    if (select.dataset.select === "para-gap" && isGap(select.value)) {
      this.actions.applyFormat({ type: "paraGap", value: select.value });
    }
    if (select.dataset.select === "style" && isStyle(select.value)) {
      this.actions.applyFormat({ type: "style", value: select.value });
    }
    this.sync();
  };

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

  private reviewMarkup(): string {
    return `
      <div class="ho-word-drop">
        <button type="button" data-drop-toggle title="添加批注">批注</button>
        <div class="ho-word-outline-menu ho-word-review-menu">
          <label class="ho-word-link-row" data-keep-drop>批注
            <textarea data-comment-text placeholder="批注内容"></textarea>
          </label>
          <button type="button" data-act="add-comment">添加批注</button>
          <div class="ho-word-review-list" data-comment-list></div>
        </div>
      </div>
      <div class="ho-word-drop">
        <button type="button" data-drop-toggle title="插入脚注">脚注</button>
        <div class="ho-word-outline-menu ho-word-review-menu">
          <label class="ho-word-link-row" data-keep-drop>脚注
            <input data-note-text placeholder="脚注内容" />
          </label>
          <button type="button" data-act="add-note">插入脚注</button>
          <div class="ho-word-review-list" data-note-list></div>
        </div>
      </div>`;
  }

  private linkMarkup(): string {
    return `
      <div class="ho-word-drop">
        <button type="button" data-drop-toggle title="插入或修改超链接">链接</button>
        <div class="ho-word-outline-menu ho-word-link-menu">
          <label class="ho-word-link-row" data-keep-drop>
            <input data-link-url placeholder="https:// 或 #书签" />
          </label>
          <button type="button" data-act="apply-link">设置链接</button>
          <button type="button" data-act="clear-link">取消链接</button>
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
        <button type="button" data-drop-toggle title="大纲编号。Tab 降低一级，Shift+Tab 提升一级">大纲</button>
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
          <button type="button" class="is-on">开始</button>
        </div>
        <div class="ho-word-caption" data-caption>空文档</div>
      </div>
      <div class="ho-word-ribbon-home">
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            <button type="button" data-act="undo" title="撤销 (Ctrl+Z)">↶</button>
            <button type="button" data-act="redo" title="重做 (Ctrl+Y)">↷</button>
            <button type="button" data-act="new" title="新建">新建</button>
            <button type="button" data-act="open" title="打开">打开</button>
            <button type="button" data-act="save" title="保存">保存</button>
          </div>
          <span>剪贴板</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            <button type="button" data-act="find-open" title="查找 (Ctrl+F)">查找</button>
            <button type="button" data-act="print" title="打印 (Ctrl+P)">打印</button>
            <select data-select="zoom" title="缩放">${ZOOM_LEVELS.map((level) => `<option value="${level}">${level * 100}%</option>`).join("")}</select>
          </div>
          <span>视图</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-font">
            <select data-select="font">${FONTS.map((font) => `<option value="${font}">${font}</option>`).join("")}</select>
            <select data-select="size">${SIZES.map((size) => `<option value="${size}">${size}</option>`).join("")}</select>
            <button type="button" data-act="size-up" title="增大字号">A+</button>
            <button type="button" data-act="size-down" title="减小字号">A-</button>
            <button type="button" data-act="bold" title="加粗 (Ctrl+B)"><b>B</b></button>
            <button type="button" data-act="italic" title="倾斜 (Ctrl+I)"><i>I</i></button>
            <button type="button" data-act="underline" title="下划线 (Ctrl+U)"><u>U</u></button>
            <button type="button" data-act="strike" title="删除线"><s>S</s></button>
            <button type="button" data-act="superscript" title="上标">x²</button>
            <button type="button" data-act="subscript" title="下标">x₂</button>
            <div class="ho-word-drop">
              <button type="button" data-drop-toggle title="字体颜色"><span data-swatch="color"></span>A</button>
              <div class="ho-word-palette">${TEXT_COLORS.map((color) => `<button type="button" data-color="${color}" style="background:${color}"></button>`).join("")}</div>
            </div>
            <div class="ho-word-drop">
              <button type="button" data-drop-toggle title="底纹"><span data-swatch="highlight"></span>底</button>
              <div class="ho-word-palette">${FILLS.map((fill) => `<button type="button" data-fill="${fill}" style="background:${fill === "none" ? "#fff" : fill}"></button>`).join("")}</div>
            </div>
            <button type="button" data-act="clear" title="清除格式">Aa</button>
          </div>
          <span>字体</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            <button type="button" data-act="align-left" title="左对齐">≡</button>
            <button type="button" data-act="align-center" title="居中">≣</button>
            <button type="button" data-act="align-right" title="右对齐">≡</button>
            <button type="button" data-act="align-both" title="两端对齐">☰</button>
            <select data-select="style" title="段落样式" aria-label="样式">
              <option value="normal">正文</option>
              <option value="heading1">标题 1</option>
              <option value="heading2">标题 2</option>
              <option value="heading3">标题 3</option>
            </select>
            <select data-select="indent" title="首行缩进" aria-label="缩进">
              <option value="none">无缩进</option>
              <option value="first2">首行2字</option>
              <option value="hang2">悬挂2字</option>
              <option value="left2">左缩2字</option>
              <option value="right2">右缩2字</option>
            </select>
            <select data-select="spacing" title="行距" aria-label="行距">
              <option value="1">单倍</option>
              <option value="1.5">1.5倍</option>
              <option value="2">2倍</option>
              <option value="exact28">固定28磅</option>
            </select>
            <select data-select="para-gap" title="段前段后" aria-label="段距">
              <option value="0">段距0</option>
              <option value="before6">段前6磅</option>
              <option value="after6">段后6磅</option>
              <option value="both6">前后6磅</option>
            </select>
            ${this.outlineMarkup()}
            ${this.borders.markup()}
          </div>
          <span>段落</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            <button type="button" data-act="insert-page-break" title="从这里另起一页">分页</button>
            <button type="button" data-act="page-number" title="在页眉或页脚插入页码">页码</button>
            <button type="button" data-act="title-page" title="首页使用不同的页眉页脚">首页</button>
            <button type="button" data-act="even-odd" title="奇偶页使用不同的页眉页脚">奇偶</button>
          </div>
          <span>页眉</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            ${this.linkMarkup()}
            <button type="button" data-act="insert-toc" title="按标题生成目录">目录</button>
          </div>
          <span>引用</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            ${this.reviewMarkup()}
            <button type="button" data-act="accept-revision" title="接受修订">接受</button>
            <button type="button" data-act="reject-revision" title="拒绝修订">拒绝</button>
          </div>
          <span>审阅</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            <button type="button" data-act="insert-table" title="插入 3×3 表格">表格</button>
            <button type="button" data-act="insert-row" title="在下方插入行">行+</button>
            <button type="button" data-act="delete-row" title="删除行">行-</button>
            <button type="button" data-act="insert-col" title="在右侧插入列">列+</button>
            <button type="button" data-act="delete-col" title="删除列">列-</button>
            <button type="button" data-act="merge-cells" title="合并单元格">合并</button>
            <button type="button" data-act="split-cell" title="拆分单元格">拆分</button>
          </div>
          <span>表格</span>
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
