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

const GRID = { l: 1.5, r: 14.5, t: 1.5, b: 14.5, x: 8, y: 8 };
const QUIET = "#d0d0d0";
const INK = "#222222";

function borderIcon(mode: TableBorderMode): string {
  if (mode === "none") {
    return `<svg class="ho-word-border-mini" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="${QUIET}" stroke-width="1" stroke-dasharray="2.2 1.6"/>
      <line x1="8" y1="1.5" x2="8" y2="14.5" stroke="${QUIET}" stroke-width="1" stroke-dasharray="2.2 1.6"/>
      <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="${QUIET}" stroke-width="1" stroke-dasharray="2.2 1.6"/>
    </svg>`;
  }
  const on = {
    top: mode === "top" || mode === "all" || mode === "outside",
    right: mode === "right" || mode === "all" || mode === "outside",
    bottom: mode === "bottom" || mode === "all" || mode === "outside",
    left: mode === "left" || mode === "all" || mode === "outside",
    h: mode === "insideH" || mode === "inside" || mode === "all",
    v: mode === "insideV" || mode === "inside" || mode === "all",
    down: mode === "tl2br",
    up: mode === "tr2bl",
  };
  const seg = (x1: number, y1: number, x2: number, y2: number, active: boolean) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${active ? INK : QUIET}" stroke-width="${active ? 2 : 1}"/>`;
  const { l, r, t, b, x, y } = GRID;
  return `<svg class="ho-word-border-mini" viewBox="0 0 16 16" aria-hidden="true" stroke-linecap="square">
    ${seg(l, t, r, t, on.top)}
    ${seg(r, t, r, b, on.right)}
    ${seg(l, b, r, b, on.bottom)}
    ${seg(l, t, l, b, on.left)}
    ${seg(l, y, r, y, on.h)}
    ${seg(x, t, x, b, on.v)}
    ${on.down ? seg(2.5, 2.5, 13.5, 13.5, true) : ""}
    ${on.up ? seg(13.5, 2.5, 2.5, 13.5, true) : ""}
  </svg>`;
}

export class BorderMenu {
  markup(): string {
    const items = BORDER_MENU_ITEMS.map((item, index) => {
      const prev = BORDER_MENU_ITEMS[index - 1];
      const split = prev && prev.group !== item.group ? `<div class="ho-word-border-split"></div>` : "";
      return `${split}<button type="button" data-border="${item.mode}">
        <span class="ho-word-border-check"></span>
        ${borderIcon(item.mode)}
        ${item.label}
      </button>`;
    }).join("");
    return `
      <div class="ho-word-drop ho-word-border-drop">
        <button type="button" data-drop-toggle data-border-toggle title="框线">
          ${borderIcon("all")}
          <span class="ho-word-menu-caret"></span>
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
