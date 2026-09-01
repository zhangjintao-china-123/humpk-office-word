import type { TableBorderFlags, TableBorderMode } from "../../edit/TableBorderApplier";

export interface BorderMenuItem {
  mode: TableBorderMode;
  label: string;
  group: number;
}

export const BORDER_MENU_ITEMS: BorderMenuItem[] = [
  { mode: "bottom", label: "下框线", group: 0 },
  { mode: "top", label: "上框线", group: 0 },
  { mode: "left", label: "左框线", group: 0 },
  { mode: "right", label: "右框线", group: 0 },
  { mode: "none", label: "无框线", group: 1 },
  { mode: "all", label: "所有框线", group: 1 },
  { mode: "outside", label: "外侧框线", group: 1 },
  { mode: "inside", label: "内部框线", group: 1 },
  { mode: "insideH", label: "内部横框线", group: 2 },
  { mode: "insideV", label: "内部竖框线", group: 2 },
  { mode: "tl2br", label: "斜下框线", group: 2 },
  { mode: "tr2bl", label: "斜上框线", group: 2 },
];

export const BORDER_SIZES = [
  { size: "4", label: "0.5 磅" },
  { size: "8", label: "1 磅" },
  { size: "12", label: "1.5 磅" },
  { size: "18", label: "2.25 磅" },
  { size: "24", label: "3 磅" },
];

export const BORDER_COLORS = ["#000000", "#C00000", "#FF0000", "#ED7D31", "#FFC000", "#70AD47", "#0070C0", "#7030A0"];

export class BorderMenu {
  markup(): string {
    const items = BORDER_MENU_ITEMS.map((item, index) => {
      const prev = BORDER_MENU_ITEMS[index - 1];
      const split = prev && prev.group !== item.group ? `<div class="ho-word-border-split"></div>` : "";
      return `${split}<button type="button" data-border="${item.mode}">
        <span class="ho-word-border-check"></span>
        <span class="ho-word-border-mini ho-word-border-${item.mode}"></span>
        ${item.label}
      </button>`;
    }).join("");
    return `
      <div class="ho-word-drop ho-word-border-drop">
        <button type="button" data-drop-toggle data-border-toggle title="框线">
          <span class="ho-word-border-mini ho-word-border-all"></span>
        </button>
        <div class="ho-word-border-menu">
          <div class="ho-word-border-pen" data-keep-drop>
            <label>粗细
              <select data-border-size>${BORDER_SIZES.map((item) => `<option value="${item.size}">${item.label}</option>`).join("")}</select>
            </label>
            <div class="ho-word-border-colors">${BORDER_COLORS.map((color) => `<button type="button" data-border-color="${color}" style="background:${color}"></button>`).join("")}</div>
          </div>
          ${items}
        </div>
      </div>
    `;
  }

  sync(root: HTMLElement, flags: TableBorderFlags | undefined, size: string, color: string, enabled: boolean): void {
    const drop = root.querySelector(".ho-word-border-drop");
    drop?.classList.toggle("is-disabled", !enabled);
    const select = root.querySelector<HTMLSelectElement>("[data-border-size]");
    if (select) {
      select.value = size;
    }
    root.querySelectorAll<HTMLElement>("[data-border-color]").forEach((chip) => {
      chip.classList.toggle("is-on", chip.dataset.borderColor === color);
    });
    root.querySelectorAll<HTMLElement>("[data-border]").forEach((button) => {
      const mode = button.dataset.border as TableBorderMode;
      button.classList.toggle("is-on", !!flags && mode !== "none" && !!flags[mode as keyof TableBorderFlags]);
    });
  }
}
