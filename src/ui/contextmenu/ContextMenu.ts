import type { ContextMenuAction, ContextMenuItem } from "./ContextMenuItem";

export class ContextMenu {
  readonly el: HTMLDivElement;
  private onAction?: (action: ContextMenuAction) => void;

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "ho-word-contextmenu";
    this.el.hidden = true;
    this.el.addEventListener("mousedown", this.onMouseDown);
    this.el.addEventListener("click", this.onClick);
  }

  attach(host: HTMLElement): void {
    host.appendChild(this.el);
  }

  detach(): void {
    this.hide();
    this.el.remove();
  }

  setActionHandler(handler: (action: ContextMenuAction) => void): void {
    this.onAction = handler;
  }

  show(x: number, y: number, items: ContextMenuItem[]): void {
    this.el.innerHTML = items
      .map(
        (item) =>
          `<button type="button" data-act="${item.action}"${item.enabled ? "" : " disabled"}>${item.label}</button>`,
      )
      .join("");
    this.el.hidden = false;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    const rect = this.el.getBoundingClientRect();
    const left = Math.min(x, Math.max(8, window.innerWidth - rect.width - 8));
    const top = Math.min(y, Math.max(8, window.innerHeight - rect.height - 8));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide(): void {
    this.el.hidden = true;
  }

  isOpen(): boolean {
    return !this.el.hidden;
  }

  private onMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!target || target.disabled) {
      return;
    }
    const action = target.dataset.act as ContextMenuAction;
    this.hide();
    this.onAction?.(action);
  };
}
