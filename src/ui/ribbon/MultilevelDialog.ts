import {
  multilevelSamples,
  PRESET_MULTILEVELS,
  type MultilevelLevelSpec,
} from "../../edit/OutlineNumbering";

const LEVEL_FORMATS: readonly { value: string; label: string }[] = [
  { value: "decimal", label: "1, 2, 3, ..." },
  { value: "decimalZero", label: "01, 02, 03, ..." },
  { value: "upperRoman", label: "I, II, III, ..." },
  { value: "lowerRoman", label: "i, ii, iii, ..." },
  { value: "upperLetter", label: "A, B, C, ..." },
  { value: "lowerLetter", label: "a, b, c, ..." },
  { value: "chineseCounting", label: "一, 二, 三, ..." },
  { value: "bullet", label: "● (项目符号)" },
  { value: "none", label: "(无)" },
];

/** 「定义新的多级列表 / 列表样式」弹窗：按级别 1..9 编辑编号样式、格式、起始值及关联标题。 */
export class MultilevelDialog {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly levelButtons: HTMLButtonElement[];
  private readonly fmtSelect: HTMLSelectElement;
  private readonly patternInput: HTMLInputElement;
  private readonly startInput: HTMLInputElement;
  private readonly headingSelect: HTMLSelectElement;
  private readonly preview: HTMLElement;
  private levels: MultilevelLevelSpec[] = [];
  private activeLevel = 0;
  private onPick: ((levels: MultilevelLevelSpec[], linkHeading: boolean) => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "ho-word-color-dialog ho-word-multilevel-dialog";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ho-word-color-card ho-word-multilevel-card" role="dialog" aria-label="定义新的多级列表">
        <div class="ho-word-color-title" data-ml-title>定义新的多级列表</div>
        <div class="ho-word-ml-levels" data-ml-levels>
          ${Array.from({ length: 9 }, (_, i) => `<button type="button" data-ml-level="${i}">${i + 1}</button>`).join("")}
        </div>
        <div class="ho-word-numbering-fields">
          <label>编号样式：
            <select data-ml-fmt>
              ${LEVEL_FORMATS.map((item) => `<option value="${item.value}">${item.label}</option>`).join("")}
            </select>
          </label>
          <label>编号格式：
            <input type="text" maxlength="32" data-ml-pattern placeholder="%1." />
          </label>
          <label>起始编号：
            <input type="number" min="1" max="9999" value="1" data-ml-start />
          </label>
          <label>链接级别到样式：
            <select data-ml-heading>
              <option value="0">(无样式)</option>
              ${Array.from({ length: 9 }, (_, i) => `<option value="${i + 1}">标题 ${i + 1}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="ho-word-bullet-preview">
          <span class="ho-word-bullet-preview-label">预览 (1~3 级)</span>
          <div class="ho-word-numbering-preview-lines" data-ml-preview></div>
        </div>
        <div class="ho-word-color-foot">
          <div></div>
          <div class="ho-word-color-actions">
            <button type="button" data-ml-ok>确定</button>
            <button type="button" data-ml-cancel>取消</button>
          </div>
        </div>
      </div>`;
    document.body.append(this.root);
    this.titleEl = this.root.querySelector("[data-ml-title]") as HTMLElement;
    this.levelButtons = [...this.root.querySelectorAll<HTMLButtonElement>("[data-ml-level]")];
    this.fmtSelect = this.root.querySelector("[data-ml-fmt]") as HTMLSelectElement;
    this.patternInput = this.root.querySelector("[data-ml-pattern]") as HTMLInputElement;
    this.startInput = this.root.querySelector("[data-ml-start]") as HTMLInputElement;
    this.headingSelect = this.root.querySelector("[data-ml-heading]") as HTMLSelectElement;
    this.preview = this.root.querySelector("[data-ml-preview]") as HTMLElement;

    this.root.addEventListener("mousedown", (event) => event.stopPropagation());
    this.root.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target === this.root || target.dataset.mlCancel != null) {
        this.close();
        return;
      }
      if (target.dataset.mlOk != null) {
        this.commit();
        return;
      }
      const levelBtn = target.closest<HTMLButtonElement>("[data-ml-level]");
      if (levelBtn?.dataset.mlLevel != null) {
        this.selectLevel(Number(levelBtn.dataset.mlLevel));
      }
    });
    this.fmtSelect.addEventListener("change", () => {
      const spec = this.levels[this.activeLevel];
      if (spec) {
        spec.numFmt = this.fmtSelect.value || "decimal";
        if (spec.numFmt === "bullet" && !spec.lvlText) {
          spec.lvlText = "●";
          this.patternInput.value = spec.lvlText;
        } else if (spec.numFmt === "none") {
          spec.lvlText = "";
          this.patternInput.value = "";
        } else if (!spec.lvlText) {
          spec.lvlText = `%${this.activeLevel + 1}.`;
          this.patternInput.value = spec.lvlText;
        }
        this.syncPreview();
      }
    });
    this.patternInput.addEventListener("input", () => {
      const spec = this.levels[this.activeLevel];
      if (spec) {
        spec.lvlText = this.patternInput.value;
        this.syncPreview();
      }
    });
    this.startInput.addEventListener("input", () => {
      const spec = this.levels[this.activeLevel];
      if (spec) {
        spec.start = Math.max(1, Math.trunc(Number(this.startInput.value) || 1));
        this.syncPreview();
      }
    });
    this.headingSelect.addEventListener("change", () => {
      const spec = this.levels[this.activeLevel];
      if (spec) {
        const value = Number(this.headingSelect.value) || 0;
        spec.headingLevel = value > 0 ? value : undefined;
        this.syncPreview();
      }
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

  open(
    title: string,
    initial: MultilevelLevelSpec[] | undefined,
    onPick: (levels: MultilevelLevelSpec[], linkHeading: boolean) => void,
  ): void {
    this.titleEl.textContent = title;
    this.onPick = onPick;
    const base = initial?.length ? initial : PRESET_MULTILEVELS[0].levels;
    this.levels = Array.from({ length: 9 }, (_, ilvl) => ({
      ...(base[ilvl] ?? base.at(-1) ?? { numFmt: "decimal", lvlText: `%${ilvl + 1}.`, start: 1 }),
    }));
    this.selectLevel(0);
    this.root.hidden = false;
    this.patternInput.focus();
  }

  close(): void {
    this.root.hidden = true;
    this.onPick = null;
  }

  private selectLevel(ilvl: number): void {
    this.activeLevel = Math.min(8, Math.max(0, ilvl));
    this.levelButtons.forEach((button, index) => {
      button.classList.toggle("is-on", index === this.activeLevel);
    });
    const spec = this.levels[this.activeLevel];
    this.fmtSelect.value = LEVEL_FORMATS.some((item) => item.value === spec.numFmt) ? spec.numFmt : "decimal";
    this.patternInput.value = spec.lvlText;
    this.startInput.value = String(spec.start || 1);
    this.headingSelect.value = String(spec.headingLevel ?? 0);
    this.syncPreview();
  }

  private syncPreview(): void {
    const linkHeading = this.levels.some((item) => item.headingLevel != null);
    const rows = multilevelSamples(this.levels, linkHeading);
    this.preview.innerHTML = rows
      .map(
        (row) =>
          `<div class="ho-word-numbering-preview-row" style="padding-left:${row.ilvl * 12}px"><span class="ho-word-numbering-preview-label">${escapeHtml(row.label)}${row.heading ? ` ${escapeHtml(row.heading)}` : ""}</span><span class="ho-word-numbering-bar"></span></div>`,
      )
      .join("");
  }

  private commit(): void {
    const linkHeading = this.levels.some((item) => item.headingLevel != null);
    this.onPick?.(
      this.levels.map((item) => ({ ...item })),
      linkHeading,
    );
    this.close();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
