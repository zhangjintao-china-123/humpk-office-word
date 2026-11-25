import type { ContextMenuAction, ContextMenuEntry, ContextMenuItem, ContextMenuSubmenu } from "./ContextMenuItem";

export interface ContextMenuPromptOptions {
  value?: string;
  placeholder?: string;
  multiline?: boolean;
}

export class ContextMenu {
  readonly el: HTMLDivElement;
  private onAction?: (action: ContextMenuAction) => void;
  private anchor = { x: 0, y: 0 };

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "ho-word-contextmenu";
    this.el.hidden = true;
    this.el.addEventListener("mousedown", this.onMouseDown);
    this.el.addEventListener("click", this.onClick);
    this.el.addEventListener("mouseover", this.onMouseOver);
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

  show(x: number, y: number, entries: ContextMenuEntry[]): void {
    this.anchor = { x, y };
    this.el.replaceChildren(...entries.map((entry) => this.render(entry)));
    this.el.hidden = false;
    this.place(this.el, x, y);
  }

  hide(): void {
    this.el.hidden = true;
  }

  isOpen(): boolean {
    return !this.el.hidden;
  }

  ask(title: string, options: ContextMenuPromptOptions = {}): Promise<string | null> {
    const dialog = document.createElement("div");
    dialog.className = "ho-word-context-dialog";
    dialog.setAttribute("role", "dialog");
    const heading = document.createElement("div");
    heading.className = "ho-word-context-dialog-title";
    heading.textContent = title;
    const field = options.multiline ? document.createElement("textarea") : document.createElement("input");
    if (field instanceof HTMLInputElement) {
      field.type = "text";
    }
    field.value = options.value ?? "";
    field.placeholder = options.placeholder ?? "";
    const actions = document.createElement("div");
    actions.className = "ho-word-context-dialog-actions";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "is-primary";
    ok.textContent = "确定";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    actions.append(cancel, ok);
    dialog.append(heading, field, actions);
    document.body.appendChild(dialog);
    this.place(dialog, this.anchor.x, this.anchor.y);
    field.focus();
    field.select();
    return new Promise((resolve) => {
      const finish = (value: string | null) => {
        dialog.remove();
        resolve(value);
      };
      ok.addEventListener("click", () => finish(field.value));
      cancel.addEventListener("click", () => finish(null));
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
          return;
        }
        if (event.key === "Enter" && !options.multiline) {
          event.preventDefault();
          finish(field.value);
        }
      });
    });
  }

  private place(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, Math.max(8, window.innerWidth - rect.width - 8));
    const top = Math.min(y, Math.max(8, window.innerHeight - rect.height - 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  private render(entry: ContextMenuEntry): HTMLElement {
    if (entry.kind === "separator") {
      const sep = document.createElement("div");
      sep.className = "ho-word-context-sep";
      sep.setAttribute("role", "separator");
      return sep;
    }
    if (entry.kind === "submenu") {
      return this.renderSubmenu(entry);
    }
    return this.renderItem(entry);
  }

  private renderSubmenu(entry: ContextMenuSubmenu): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "ho-word-context-sub";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ho-word-context-parent";
    button.disabled = !entry.enabled;
    button.append(this.iconSlot(entry.icon), this.labelSlot(entry.label), this.caretSlot());
    const flyout = document.createElement("div");
    flyout.className = "ho-word-context-flyout";
    flyout.append(...entry.children.map((child) => this.render(child)));
    wrap.append(button, flyout);
    return wrap;
  }

  private renderItem(entry: ContextMenuItem): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.act = entry.action;
    button.disabled = !entry.enabled;
    if (entry.checked) {
      button.classList.add("is-checked");
    }
    button.append(this.iconSlot(entry.icon, entry.glyph, entry.glyphClass, entry.checked), this.labelSlot(entry.label));
    if (entry.shortcut) {
      const shortcut = document.createElement("span");
      shortcut.className = "ho-word-context-key";
      shortcut.textContent = entry.shortcut;
      button.append(shortcut);
    }
    return button;
  }

  private iconSlot(icon?: string, glyph?: string, glyphClass?: string, checked?: boolean): HTMLElement {
    const slot = document.createElement("span");
    slot.className = "ho-word-context-icon";
    if (icon) {
      slot.innerHTML = icon;
    } else if (glyph) {
      slot.textContent = glyph;
      slot.classList.add("is-glyph");
      if (glyphClass) {
        slot.classList.add(glyphClass);
      }
    } else if (checked) {
      slot.textContent = "✓";
    }
    return slot;
  }

  private labelSlot(text: string): HTMLElement {
    const label = document.createElement("span");
    label.className = "ho-word-context-label";
    label.textContent = text;
    return label;
  }

  private caretSlot(): HTMLElement {
    const caret = document.createElement("span");
    caret.className = "ho-word-context-caret";
    caret.textContent = "›";
    return caret;
  }

  private onMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private onMouseOver = (event: MouseEvent): void => {
    const sub = (event.target as HTMLElement).closest(".ho-word-context-sub");
    if (!sub || !this.el.contains(sub)) {
      return;
    }
    const flyout = [...sub.children].find((node) => node.classList.contains("ho-word-context-flyout"));
    if (!(flyout instanceof HTMLElement)) {
      return;
    }
    flyout.classList.remove("is-left");
    if (flyout.getBoundingClientRect().right > window.innerWidth - 8) {
      flyout.classList.add("is-left");
    }
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
