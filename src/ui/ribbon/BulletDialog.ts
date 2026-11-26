const CUSTOM_SYMBOLS = [
  "●",
  "○",
  "•",
  "◦",
  "■",
  "□",
  "▪",
  "▫",
  "◆",
  "◇",
  "❖",
  "✦",
  "★",
  "☆",
  "✓",
  "✔",
  "✘",
  "➢",
  "➤",
  "➔",
  "※",
  "♠",
  "♣",
  "♥",
  "♦",
];

/** 「定义新项目符号」弹窗：支持从符号库选取或输入任意自定义字符。 */
export class BulletDialog {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly previewGlyph: HTMLElement;
  private readonly grid: HTMLElement;
  private onPick: ((symbol: string) => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "ho-word-color-dialog ho-word-bullet-dialog";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ho-word-color-card ho-word-bullet-card" role="dialog" aria-label="定义新项目符号">
        <div class="ho-word-color-title">定义新项目符号</div>
        <div class="ho-word-bullet-dialog-row">
          <label>符号字符：
            <input type="text" maxlength="4" data-bullet-input placeholder="如 ★" />
          </label>
        </div>
        <div class="ho-word-bullet-dialog-grid" data-bullet-choices>
          ${CUSTOM_SYMBOLS.map((glyph) => `<button type="button" data-bullet-choice="${glyph}">${glyph}</button>`).join("")}
        </div>
        <div class="ho-word-bullet-preview">
          <span class="ho-word-bullet-preview-label">预览</span>
          <div class="ho-word-bullet-preview-box">
            <span data-bullet-preview-glyph>●</span>
            <span>项目符号示例文本</span>
          </div>
        </div>
        <div class="ho-word-color-foot">
          <div></div>
          <div class="ho-word-color-actions">
            <button type="button" data-bullet-ok>确定</button>
            <button type="button" data-bullet-cancel>取消</button>
          </div>
        </div>
      </div>`;
    document.body.append(this.root);
    this.input = this.root.querySelector("[data-bullet-input]") as HTMLInputElement;
    this.previewGlyph = this.root.querySelector("[data-bullet-preview-glyph]") as HTMLElement;
    this.grid = this.root.querySelector("[data-bullet-choices]") as HTMLElement;
    this.root.addEventListener("mousedown", (event) => event.stopPropagation());
    this.root.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target === this.root || target.dataset.bulletCancel != null) {
        this.close();
        return;
      }
      if (target.dataset.bulletOk != null) {
        this.commit();
        return;
      }
      const choice = target.closest<HTMLElement>("[data-bullet-choice]")?.dataset.bulletChoice;
      if (choice) {
        this.setValue(choice);
      }
    });
    this.input.addEventListener("input", () => {
      this.syncPreview();
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });
  }

  open(initial: string, onPick: (symbol: string) => void): void {
    this.onPick = onPick;
    this.setValue(initial.trim() || "●");
    this.root.hidden = false;
    this.input.focus();
    this.input.select();
  }

  close(): void {
    this.root.hidden = true;
    this.onPick = null;
  }

  private setValue(symbol: string): void {
    this.input.value = symbol;
    this.syncPreview();
  }

  private syncPreview(): void {
    const value = this.input.value.trim() || "●";
    this.previewGlyph.textContent = value;
    this.grid.querySelectorAll<HTMLElement>("[data-bullet-choice]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.bulletChoice === value);
    });
  }

  private commit(): void {
    const value = this.input.value.trim();
    if (value) {
      this.onPick?.(value);
    }
    this.close();
  }
}
