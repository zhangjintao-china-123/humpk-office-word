import type { Drawing } from "../../model/inline/Drawing";
import { shapePresetLabel } from "../../model/graphic/Shape";
import type { PictureBox } from "../../selection/HitTester";
import { RibbonIcons } from "../ribbon/RibbonIcons";

export interface SelectionPaneItem {
  box: PictureBox;
  label: string;
  selected: boolean;
  hidden: boolean;
  canReorder: boolean;
}

export interface SelectionPaneHost {
  items(): SelectionPaneItem[];
  select(box: PictureBox): void;
  toggleVisibility(box: PictureBox): void;
  setAllVisibility(hidden: boolean): void;
  moveOrder(box: PictureBox, direction: "up" | "down"): void;
  close(): void;
}

export class SelectionPane {
  readonly el: HTMLElement;
  private openState = false;
  private currentItems: SelectionPaneItem[] = [];

  constructor(private readonly host: SelectionPaneHost) {
    this.el = document.createElement("aside");
    this.el.className = "ho-word-selection-pane";
    this.el.setAttribute("aria-label", "选择窗格");
    this.el.hidden = true;
    this.el.addEventListener("click", this.onClick);
    this.render();
  }

  isOpen(): boolean {
    return this.openState;
  }

  setOpen(open: boolean): void {
    if (this.openState === open) {
      return;
    }
    this.openState = open;
    this.el.hidden = !open;
    if (open) {
      this.sync();
    }
  }

  sync(): void {
    if (!this.openState) {
      return;
    }
    this.currentItems = this.host.items();
    this.render();
  }

  private render(): void {
    const selected = this.currentItems.find((item) => item.selected && item.canReorder);
    const listHtml = this.currentItems.length
      ? this.currentItems
          .map((item, index) => {
            const cls = [
              "ho-word-pane-item",
              item.selected ? "is-selected" : "",
              item.hidden ? "is-hidden" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const eyeIcon = item.hidden ? RibbonIcons.eyeClosed : RibbonIcons.eyeOpen;
            const eyeTitle = item.hidden ? "显示对象" : "隐藏对象";
            return `<div class="${cls}" data-pane-index="${index}">
              <button type="button" class="ho-word-pane-select" data-pane-select="${index}" title="${escapeAttr(item.label)}">${escapeHtml(item.label)}</button>
              <button type="button" class="ho-word-pane-vis" data-pane-vis="${index}" aria-label="${eyeTitle}" aria-pressed="${!item.hidden}" title="${eyeTitle}">${eyeIcon}</button>
            </div>`;
          })
          .join("")
      : `<div class="ho-word-pane-empty">当前文档中没有形状、文本框或图片</div>`;

    this.el.innerHTML = `
      <div class="ho-word-pane-header">
        <span>选择窗格</span>
        <button type="button" class="ho-word-pane-close" data-pane-close aria-label="关闭选择窗格" title="关闭">×</button>
      </div>
      <div class="ho-word-pane-actions">
        <button type="button" data-pane-show-all ${this.currentItems.length ? "" : "disabled"}>全部显示</button>
        <button type="button" data-pane-hide-all ${this.currentItems.length ? "" : "disabled"}>全部隐藏</button>
        <button type="button" data-pane-up title="上移一层" ${selected ? "" : "disabled"}>↑</button>
        <button type="button" data-pane-down title="下移一层" ${selected ? "" : "disabled"}>↓</button>
      </div>
      <div class="ho-word-pane-list" role="list">${listHtml}</div>
    `;
  }

  private onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    if (target.closest("[data-pane-close]")) {
      this.host.close();
      return;
    }
    if (target.closest("[data-pane-show-all]")) {
      this.host.setAllVisibility(false);
      return;
    }
    if (target.closest("[data-pane-hide-all]")) {
      this.host.setAllVisibility(true);
      return;
    }
    if (target.closest("[data-pane-up]")) {
      const selected = this.currentItems.find((item) => item.selected && item.canReorder);
      if (selected) {
        this.host.moveOrder(selected.box, "up");
      }
      return;
    }
    if (target.closest("[data-pane-down]")) {
      const selected = this.currentItems.find((item) => item.selected && item.canReorder);
      if (selected) {
        this.host.moveOrder(selected.box, "down");
      }
      return;
    }
    const visBtn = target.closest<HTMLElement>("[data-pane-vis]");
    if (visBtn) {
      const item = this.currentItems[Number(visBtn.dataset.paneVis)];
      if (item) {
        this.host.toggleVisibility(item.box);
      }
      return;
    }
    const selectBtn = target.closest<HTMLElement>("[data-pane-select]");
    if (selectBtn) {
      const item = this.currentItems[Number(selectBtn.dataset.paneSelect)];
      if (item) {
        this.host.select(item.box);
      }
    }
  };
}

export function selectionPaneLabel(drawing: Drawing, index: number): string {
  if (drawing.name?.trim()) {
    return drawing.name.trim();
  }
  if (drawing.shape?.text) {
    return `文本框 ${index}`;
  }
  if (drawing.shape) {
    return `${shapePresetLabel(drawing.shape.preset)} ${index}`;
  }
  return `图片 ${index}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
