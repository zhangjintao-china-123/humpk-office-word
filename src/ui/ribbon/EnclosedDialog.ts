import type { EnclosedAction, EnclosedStateInfo } from "../../edit/EnclosedCommand";
import { ENCLOSED_SHAPES, type EnclosedShape, type EnclosedSizeMode } from "../../model/inline/EnclosedChar";

type EnclosedDialogStyle = "none" | EnclosedSizeMode;

/** 「带圈字符」弹窗：支持无/缩小文字/增大圈号、文字内容与 ○□△◇ 圈号。 */
export class EnclosedDialog {
  private readonly root: HTMLDivElement;
  private readonly textInput: HTMLInputElement;
  private readonly previewBox: HTMLElement;
  private styleMode: EnclosedDialogStyle = "shrink";
  private shape: EnclosedShape = "circle";
  private onSubmit: ((action: EnclosedAction) => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "ho-word-color-dialog ho-word-enclosed-dialog";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ho-word-color-card ho-word-enclosed-card" role="dialog" aria-label="带圈字符">
        <div class="ho-word-color-title">带圈字符</div>
        <div class="ho-word-enclosed-section">
          <div class="ho-word-bullet-title">样式</div>
          <div class="ho-word-enclosed-styles" data-enclosed-styles>
            <button type="button" data-enclosed-style="none">无</button>
            <button type="button" data-enclosed-style="shrink">缩小文字</button>
            <button type="button" data-enclosed-style="enlarge">增大圈号</button>
          </div>
        </div>
        <div class="ho-word-enclosed-fields">
          <label>文字：<input type="text" maxlength="8" data-enclosed-text placeholder="如 字 或 12" /></label>
          <div class="ho-word-enclosed-shapes">
            <span>圈号：</span>
            <div class="ho-word-enclosed-shape-grid" data-enclosed-shapes>
              ${ENCLOSED_SHAPES.map(
                (item) =>
                  `<button type="button" data-enclosed-shape="${item.shape}" title="${item.label}">${item.symbol}</button>`,
              ).join("")}
            </div>
          </div>
        </div>
        <div class="ho-word-bullet-preview">
          <span class="ho-word-bullet-preview-label">预览</span>
          <div class="ho-word-bullet-preview-box ho-word-enclosed-preview-box" data-enclosed-preview></div>
        </div>
        <div class="ho-word-color-foot">
          <div></div>
          <div class="ho-word-color-actions">
            <button type="button" data-enclosed-ok>确定</button>
            <button type="button" data-enclosed-cancel>取消</button>
          </div>
        </div>
      </div>`;
    document.body.append(this.root);

    this.textInput = this.root.querySelector("[data-enclosed-text]") as HTMLInputElement;
    this.previewBox = this.root.querySelector("[data-enclosed-preview]") as HTMLElement;

    this.root.addEventListener("mousedown", (event) => event.stopPropagation());
    this.root.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target === this.root || target.dataset.enclosedCancel != null) {
        this.close();
        return;
      }
      if (target.dataset.enclosedOk != null) {
        this.commit();
        return;
      }
      const styleBtn = target.closest<HTMLElement>("[data-enclosed-style]");
      if (styleBtn?.dataset.enclosedStyle) {
        this.styleMode = styleBtn.dataset.enclosedStyle as EnclosedDialogStyle;
        this.syncUi();
        return;
      }
      const shapeBtn = target.closest<HTMLElement>("[data-enclosed-shape]");
      if (shapeBtn?.dataset.enclosedShape) {
        this.shape = shapeBtn.dataset.enclosedShape as EnclosedShape;
        if (this.styleMode === "none") {
          this.styleMode = "shrink";
        }
        this.syncUi();
      }
    });
    this.textInput.addEventListener("input", () => this.syncPreview());
    this.textInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });
  }

  open(initial: EnclosedStateInfo, onSubmit: (action: EnclosedAction) => void): void {
    this.onSubmit = onSubmit;
    this.styleMode = initial.mode ?? "shrink";
    this.shape = initial.shape ?? "circle";
    this.textInput.value = initial.text || "字";
    this.syncUi();
    this.root.hidden = false;
    this.textInput.focus();
    this.textInput.select();
  }

  close(): void {
    this.root.hidden = true;
    this.onSubmit = null;
  }

  private syncUi(): void {
    this.root.querySelectorAll<HTMLElement>("[data-enclosed-style]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.enclosedStyle === this.styleMode);
    });
    this.root.querySelectorAll<HTMLElement>("[data-enclosed-shape]").forEach((btn) => {
      btn.classList.toggle("is-on", this.styleMode !== "none" && btn.dataset.enclosedShape === this.shape);
    });
    this.syncPreview();
  }

  private syncPreview(): void {
    const text = this.textInput.value.trim() || "字";
    if (this.styleMode === "none") {
      this.previewBox.innerHTML = `<span class="ho-word-enclosed-preview-plain">${escapeHtml(text)}</span>`;
      return;
    }
    const modeClass = this.styleMode === "enlarge" ? "is-enlarge" : "is-shrink";
    this.previewBox.innerHTML = `
      <span class="ho-word-enclosed-preview-badge is-${this.shape} ${modeClass}">
        ${shapeSvg(this.shape)}
        <span class="ho-word-enclosed-preview-text">${escapeHtml(text)}</span>
      </span>`;
  }

  private commit(): void {
    const submit = this.onSubmit;
    if (!submit) {
      this.close();
      return;
    }
    if (this.styleMode === "none") {
      this.close();
      submit({ type: "remove" });
      return;
    }
    const text = this.textInput.value.trim() || "字";
    const shape = this.shape;
    const mode = this.styleMode;
    this.close();
    submit({ type: "apply", text, shape, mode });
  }
}

function shapeSvg(shape: EnclosedShape): string {
  if (shape === "square") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  }
  if (shape === "triangle") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,3 29,28 3,28" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  }
  if (shape === "diamond") {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,2 30,16 16,30 2,16" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  }
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
