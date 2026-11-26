import type { TableBorderFlags, TableBorderMode } from "../../edit/TableBorderApplier";
import { RibbonIcons } from "./RibbonIcons";

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

const OUTER_FRAME = "M3 3h14v14H3z";
const INNER_GRID = "M10 3v14M3 10h14";
const BORDER_PATHS: Record<TableBorderMode, string> = {
  top: "M3 3h14",
  right: "M17 3v14",
  bottom: "M3 17h14",
  left: "M3 3v14",
  none: "",
  all: `${OUTER_FRAME}${INNER_GRID}`,
  outside: OUTER_FRAME,
  inside: INNER_GRID,
  insideH: "M3 10h14",
  insideV: "M10 3v14",
  tl2br: "M3 3l14 14",
  tr2bl: "M17 3 3 17",
};

function borderIcon(mode: TableBorderMode): string {
  const active = BORDER_PATHS[mode];
  return `<svg class="ho-word-border-mini" viewBox="0 0 20 20" fill="none" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
    <path d="${OUTER_FRAME}${INNER_GRID}" stroke="#8694a5" stroke-width="1.1" stroke-dasharray="1.2 2.2"/>
    ${active ? `<path d="${active}" stroke="#285f9b" stroke-width="1.8"/>` : ""}
  </svg>`;
}

export class BorderMenu {
  markup(): string {
    const items = BORDER_MENU_ITEMS.map((item, index) => {
      const prev = BORDER_MENU_ITEMS[index - 1];
      const split = prev && prev.group !== item.group ? `<div class="ho-word-border-split"></div>` : "";
      return `${split}<button type="button" data-border="${item.mode}">
        ${RibbonIcons.check}
        ${borderIcon(item.mode)}
        ${item.label}
      </button>`;
    }).join("");
    return `
      <div class="ho-word-drop ho-word-border-drop">
        <button type="button" data-drop-toggle data-border-toggle title="边框">
          ${borderIcon("bottom")}
          ${RibbonIcons.chevronDown}
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
    root.querySelectorAll<HTMLElement>(".ho-word-border-drop").forEach((drop) => {
      drop.classList.toggle("is-disabled", !enabled);
    });
    root.querySelectorAll<HTMLSelectElement>("[data-border-size]").forEach((select) => {
      select.value = size;
    });
    root.querySelectorAll<HTMLElement>("[data-border-color]").forEach((chip) => {
      chip.classList.toggle("is-on", chip.dataset.borderColor === color);
    });
    root.querySelectorAll<HTMLElement>("[data-border]").forEach((button) => {
      const mode = button.dataset.border as TableBorderMode;
      button.classList.toggle("is-on", !!flags && mode !== "none" && !!flags[mode as keyof TableBorderFlags]);
    });
  }
}
