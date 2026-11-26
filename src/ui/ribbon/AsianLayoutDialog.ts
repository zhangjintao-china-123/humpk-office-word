import type { AsianLayoutAction, AsianLayoutStateInfo } from "../../edit/AsianLayoutCommand";
import {
  ASIAN_BRACKET_OPTIONS,
  asianBracketPair,
  asianLayoutLabel,
  splitAsianTwoLines,
  type AsianBrackets,
  type AsianLayoutKind,
  type AsianLayoutSpec,
} from "../../model/inline/AsianLayout";

/** 「中文版式」设置弹窗：纵横混排 / 合并字符 / 双行合一 / 调整宽度。 */
export class AsianLayoutDialog {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly textInput: HTMLInputElement;
  private readonly bracketsRow: HTMLElement;
  private readonly bracketsSelect: HTMLSelectElement;
  private readonly widthRow: HTMLElement;
  private readonly widthInput: HTMLInputElement;
  private readonly compressRow: HTMLElement;
  private readonly compressCheck: HTMLInputElement;
  private readonly previewBox: HTMLElement;
  private readonly removeBtn: HTMLButtonElement;

  private kind: AsianLayoutKind = "twoInOne";
  private brackets: AsianBrackets = "round";
  private fitChars = 3;
  private compress = true;
  private onSubmit: ((action: AsianLayoutAction) => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "ho-word-color-dialog ho-word-asian-dialog";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ho-word-color-card ho-word-asian-card" role="dialog" aria-label="中文版式">
        <div class="ho-word-color-title" data-asian-title>中文版式</div>
        <div class="ho-word-enclosed-section">
          <div class="ho-word-bullet-title">版式类型</div>
          <div class="ho-word-asian-kinds" data-asian-kinds>
            <button type="button" data-asian-kind="tatechuyoko">纵横混排</button>
            <button type="button" data-asian-kind="combine">合并字符</button>
            <button type="button" data-asian-kind="twoInOne">双行合一</button>
            <button type="button" data-asian-kind="fitWidth">调整宽度</button>
          </div>
        </div>
        <div class="ho-word-enclosed-fields">
          <label>文字：<input type="text" maxlength="24" data-asian-text placeholder="输入文字" /></label>
          <label data-asian-brackets-row>括号：
            <select data-asian-brackets>
              ${ASIAN_BRACKET_OPTIONS.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join("")}
            </select>
          </label>
          <label data-asian-width-row>新文字宽度（字）：
            <input type="number" min="1" max="20" step="0.5" value="3" data-asian-width />
          </label>
          <label class="ho-word-asian-check" data-asian-compress-row>
            <input type="checkbox" checked data-asian-compress />适应行宽
          </label>
        </div>
        <div class="ho-word-bullet-preview">
          <span class="ho-word-bullet-preview-label">预览</span>
          <div class="ho-word-bullet-preview-box ho-word-asian-preview-box" data-asian-preview></div>
        </div>
        <div class="ho-word-color-foot">
          <button type="button" data-asian-remove>删除版式</button>
          <div class="ho-word-color-actions">
            <button type="button" data-asian-ok>确定</button>
            <button type="button" data-asian-cancel>取消</button>
          </div>
        </div>
      </div>`;
    document.body.append(this.root);

    this.titleEl = this.root.querySelector("[data-asian-title]") as HTMLElement;
    this.textInput = this.root.querySelector("[data-asian-text]") as HTMLInputElement;
    this.bracketsRow = this.root.querySelector("[data-asian-brackets-row]") as HTMLElement;
    this.bracketsSelect = this.root.querySelector("[data-asian-brackets]") as HTMLSelectElement;
    this.widthRow = this.root.querySelector("[data-asian-width-row]") as HTMLElement;
    this.widthInput = this.root.querySelector("[data-asian-width]") as HTMLInputElement;
    this.compressRow = this.root.querySelector("[data-asian-compress-row]") as HTMLElement;
    this.compressCheck = this.root.querySelector("[data-asian-compress]") as HTMLInputElement;
    this.previewBox = this.root.querySelector("[data-asian-preview]") as HTMLElement;
    this.removeBtn = this.root.querySelector("[data-asian-remove]") as HTMLButtonElement;

    this.root.addEventListener("mousedown", (event) => event.stopPropagation());
    this.root.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target === this.root || target.dataset.asianCancel != null) {
        this.close();
        return;
      }
      if (target.dataset.asianOk != null) {
        this.commit();
        return;
      }
      if (target.dataset.asianRemove != null) {
        const submit = this.onSubmit;
        this.close();
        submit?.({ type: "remove" });
        return;
      }
      const kindBtn = target.closest<HTMLElement>("[data-asian-kind]");
      if (kindBtn?.dataset.asianKind) {
        this.kind = kindBtn.dataset.asianKind as AsianLayoutKind;
        this.syncUi();
      }
    });
    this.textInput.addEventListener("input", () => this.syncPreview());
    this.bracketsSelect.addEventListener("change", () => {
      this.brackets = this.bracketsSelect.value as AsianBrackets;
      this.syncPreview();
    });
    this.widthInput.addEventListener("input", () => {
      const next = Number(this.widthInput.value);
      if (Number.isFinite(next) && next > 0) {
        this.fitChars = next;
      }
      this.syncPreview();
    });
    this.compressCheck.addEventListener("change", () => {
      this.compress = this.compressCheck.checked;
      this.syncPreview();
    });
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

  open(kind: AsianLayoutKind, initial: AsianLayoutStateInfo, onSubmit: (action: AsianLayoutAction) => void): void {
    this.onSubmit = onSubmit;
    this.kind = initial.active ? initial.spec.kind : kind;
    this.brackets = initial.spec.brackets ?? "round";
    this.fitChars = initial.spec.fitWidthPx ? Math.max(1, Math.round((initial.spec.fitWidthPx / 16) * 2) / 2) : 3;
    this.compress = initial.spec.compress !== false;
    this.textInput.value = initial.text || (this.kind === "tatechuyoko" ? "12" : "中文版式");
    this.bracketsSelect.value = this.brackets;
    this.widthInput.value = String(this.fitChars);
    this.compressCheck.checked = this.compress;
    this.removeBtn.hidden = !initial.active;
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
    this.titleEl.textContent = asianLayoutLabel(this.kind);
    this.root.querySelectorAll<HTMLElement>("[data-asian-kind]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.asianKind === this.kind);
    });
    this.bracketsRow.hidden = this.kind !== "twoInOne";
    this.widthRow.hidden = this.kind !== "fitWidth";
    this.compressRow.hidden = this.kind !== "tatechuyoko";
    this.syncPreview();
  }

  private syncPreview(): void {
    const text = this.textInput.value.trim() || "示例";
    if (this.kind === "fitWidth") {
      const chars = Array.from(text);
      const px = Math.max(24, Math.min(180, Math.round(this.fitChars * 16)));
      this.previewBox.innerHTML = `<span class="ho-word-asian-preview-fit" style="width:${px}px">${chars.map((c) => `<span>${escapeHtml(c)}</span>`).join("")}</span>`;
      return;
    }
    if (this.kind === "tatechuyoko") {
      this.previewBox.innerHTML = `<span class="ho-word-asian-preview-tate">${escapeHtml(text)}</span>`;
      return;
    }
    const [top, bottom] = splitAsianTwoLines(text);
    const [left, right] = this.kind === "twoInOne" ? asianBracketPair(this.brackets) : ["", ""];
    this.previewBox.innerHTML = `
      <span class="ho-word-asian-preview-stack">
        ${left ? `<span class="ho-word-asian-bracket">${escapeHtml(left)}</span>` : ""}
        <span class="ho-word-asian-lines"><span>${escapeHtml(top)}</span><span>${escapeHtml(bottom)}</span></span>
        ${right ? `<span class="ho-word-asian-bracket">${escapeHtml(right)}</span>` : ""}
      </span>`;
  }

  private commit(): void {
    const submit = this.onSubmit;
    if (!submit) {
      this.close();
      return;
    }
    const text = this.textInput.value.trim() || "示例";
    const spec: AsianLayoutSpec =
      this.kind === "twoInOne"
        ? { kind: "twoInOne", brackets: this.brackets }
        : this.kind === "fitWidth"
          ? { kind: "fitWidth", fitWidthPx: Math.max(16, Math.round(this.fitChars * 16)) }
          : this.kind === "tatechuyoko"
            ? { kind: "tatechuyoko", compress: this.compress }
            : { kind: "combine" };
    this.close();
    submit({ type: "apply", text, spec });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
