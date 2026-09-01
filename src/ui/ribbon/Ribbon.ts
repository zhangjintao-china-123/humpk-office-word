import type { FormatAction } from "../../edit/FormatCommand";
import type { TableBorderFlags, TableBorderMode, TableBorderPen } from "../../edit/TableBorderApplier";
import { BorderMenu } from "./BorderMenu";

export interface RibbonHost {
  applyFormat(action: FormatAction): void;
  applyTableBorder(mode: TableBorderMode): void;
  setBorderPen(pen: Partial<TableBorderPen>): void;
  undo(): void;
  redo(): void;
  newBlank(): void;
  formatState(): RibbonState;
  openFile(): void;
  saveFile(): void;
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
  canUndo: boolean;
  canRedo: boolean;
  hasDoc: boolean;
  caption: string;
  inTable: boolean;
  borderPen: TableBorderPen;
  borderFlags?: TableBorderFlags;
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
    this.toggle("align-left", state.align === "left" || state.align === "start" || !state.align);
    this.toggle("align-center", state.align === "center");
    this.toggle("align-right", state.align === "right" || state.align === "end");
    this.toggle("align-both", state.align === "both" || state.align === "justify");
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
    if (el.closest("[data-keep-drop]")) {
      return;
    }
    const toggle = el.closest<HTMLElement>("[data-drop-toggle]");
    if (toggle) {
      if (toggle.closest(".ho-word-border-drop")?.classList.contains("is-disabled")) {
        return;
      }
      const drop = toggle.closest(".ho-word-drop");
      const open = drop?.classList.contains("is-open");
      this.closeDrops();
      drop?.classList.toggle("is-open", !open);
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
    } else if (act === "bold" || act === "italic" || act === "underline" || act === "strike" || act === "clear") {
      this.actions.applyFormat({ type: act });
    } else if (act === "align-left") {
      this.actions.applyFormat({ type: "align", value: "left" });
    } else if (act === "align-center") {
      this.actions.applyFormat({ type: "align", value: "center" });
    } else if (act === "align-right") {
      this.actions.applyFormat({ type: "align", value: "right" });
    } else if (act === "align-both") {
      this.actions.applyFormat({ type: "align", value: "both" });
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
    this.el.querySelectorAll(".ho-word-drop.is-open").forEach((drop) => drop.classList.remove("is-open"));
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
    this.sync();
  };

  private toggle(act: string, on: boolean): void {
    this.el.querySelector(`[data-act="${act}"]`)?.classList.toggle("is-on", on);
  }

  private setDisabled(act: string, disabled: boolean): void {
    const button = this.el.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);
    if (button) {
      button.disabled = disabled;
    }
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
            <button type="button" data-act="save" title="保存（当前仅保存正文）">保存</button>
          </div>
          <span>剪贴板</span>
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
            ${this.borders.markup()}
          </div>
          <span>段落</span>
        </section>
      </div>
    `;
  }
}
