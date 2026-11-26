import { numberingSamples, type NumberingPreset } from "../../edit/OutlineNumbering";

const FORMAT_OPTIONS: readonly { value: string; label: string; defaultPattern: string }[] = [
  { value: "decimal", label: "1, 2, 3, ...", defaultPattern: "%1." },
  { value: "upperLetter", label: "A, B, C, ...", defaultPattern: "%1." },
  { value: "lowerLetter", label: "a, b, c, ...", defaultPattern: "%1)" },
  { value: "upperRoman", label: "I, II, III, ...", defaultPattern: "%1." },
  { value: "lowerRoman", label: "i, ii, iii, ...", defaultPattern: "%1." },
  { value: "chineseCounting", label: "一, 二, 三, ...", defaultPattern: "%1、" },
  { value: "decimalEnclosedCircle", label: "①, ②, ③, ...", defaultPattern: "%1" },
];

/** 「定义新的编号格式」弹窗：支持选择编号样式、模板格式与起始编号。 */
export class NumberingDialog {
  private readonly root: HTMLDivElement;
  private readonly fmtSelect: HTMLSelectElement;
  private readonly patternInput: HTMLInputElement;
  private readonly startInput: HTMLInputElement;
  private readonly preview: HTMLElement;
  private onPick: ((preset: NumberingPreset) => void) | null = null;
  private customPattern = false;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "ho-word-color-dialog ho-word-numbering-dialog";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ho-word-color-card ho-word-numbering-card" role="dialog" aria-label="定义新编号格式">
        <div class="ho-word-color-title">定义新编号格式</div>
        <div class="ho-word-numbering-fields">
          <label>编号样式：
            <select data-num-fmt>
              ${FORMAT_OPTIONS.map((item) => `<option value="${item.value}">${item.label}</option>`).join("")}
            </select>
          </label>
          <label>编号格式：
            <input type="text" maxlength="20" data-num-pattern placeholder="%1." />
          </label>
          <label>起始编号：
            <input type="number" min="1" max="9999" value="1" data-num-start />
          </label>
        </div>
        <div class="ho-word-bullet-preview">
          <span class="ho-word-bullet-preview-label">预览</span>
          <div class="ho-word-numbering-preview-lines" data-num-preview></div>
        </div>
        <div class="ho-word-color-foot">
          <div></div>
          <div class="ho-word-color-actions">
            <button type="button" data-num-ok>确定</button>
            <button type="button" data-num-cancel>取消</button>
          </div>
        </div>
      </div>`;
    document.body.append(this.root);
    this.fmtSelect = this.root.querySelector("[data-num-fmt]") as HTMLSelectElement;
    this.patternInput = this.root.querySelector("[data-num-pattern]") as HTMLInputElement;
    this.startInput = this.root.querySelector("[data-num-start]") as HTMLInputElement;
    this.preview = this.root.querySelector("[data-num-preview]") as HTMLElement;

    this.root.addEventListener("mousedown", (event) => event.stopPropagation());
    this.root.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target === this.root || target.dataset.numCancel != null) {
        this.close();
        return;
      }
      if (target.dataset.numOk != null) {
        this.commit();
      }
    });
    this.fmtSelect.addEventListener("change", () => {
      if (!this.customPattern) {
        const opt = FORMAT_OPTIONS.find((item) => item.value === this.fmtSelect.value);
        if (opt) {
          this.patternInput.value = opt.defaultPattern;
        }
      }
      this.syncPreview();
    });
    this.patternInput.addEventListener("input", () => {
      this.customPattern = true;
      this.syncPreview();
    });
    this.startInput.addEventListener("input", () => {
      this.syncPreview();
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });
  }

  open(initial: NumberingPreset, onPick: (preset: NumberingPreset) => void): void {
    this.onPick = onPick;
    this.customPattern = false;
    const known = FORMAT_OPTIONS.some((item) => item.value === initial.numFmt);
    this.fmtSelect.value = known ? initial.numFmt : "decimal";
    this.patternInput.value = initial.lvlText || "%1.";
    this.startInput.value = String(Math.max(1, initial.start || 1));
    this.syncPreview();
    this.root.hidden = false;
    this.patternInput.focus();
  }

  close(): void {
    this.root.hidden = true;
    this.onPick = null;
  }

  private current(): NumberingPreset {
    const start = Math.max(1, Math.trunc(Number(this.startInput.value) || 1));
    const lvlText = this.patternInput.value.trim() || "%1.";
    return {
      numFmt: this.fmtSelect.value || "decimal",
      lvlText,
      start,
    };
  }

  private syncPreview(): void {
    const samples = numberingSamples(this.current());
    this.preview.innerHTML = samples
      .map(
        (label) =>
          `<div class="ho-word-numbering-preview-row"><span class="ho-word-numbering-preview-label">${escapeHtml(label)}</span><span class="ho-word-numbering-bar"></span></div>`,
      )
      .join("");
  }

  private commit(): void {
    this.onPick?.(this.current());
    this.close();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
