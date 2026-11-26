import type { SortKind, SortOptions, SortOrder, SortTargetInfo } from "../../edit/SortCommand";

/** 「排序文字」弹窗：按段落或表格列升序/降序排序。 */
export class SortDialog {
  private readonly root: HTMLDivElement;
  private readonly columnSelect: HTMLSelectElement;
  private readonly kindSelect: HTMLSelectElement;
  private readonly hintEl: HTMLElement;
  private order: SortOrder = "asc";
  private hasHeader = false;
  private onSubmit: ((options: SortOptions) => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "ho-word-color-dialog ho-word-sort-dialog";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ho-word-color-card ho-word-sort-card" role="dialog" aria-label="排序">
        <div class="ho-word-color-title">排序文字</div>
        <div class="ho-word-sort-hint" data-sort-hint></div>
        <div class="ho-word-enclosed-fields">
          <label>主要关键字：
            <select data-sort-col></select>
          </label>
          <label>类型：
            <select data-sort-kind>
              <option value="text">拼音（文本）</option>
              <option value="number">数字</option>
              <option value="date">日期</option>
            </select>
          </label>
          <div class="ho-word-sort-radios">
            <label><input type="radio" name="ho-word-sort-order" value="asc" checked /> 升序</label>
            <label><input type="radio" name="ho-word-sort-order" value="desc" /> 降序</label>
          </div>
          <div class="ho-word-sort-radios">
            <label><input type="radio" name="ho-word-sort-header" value="no" checked /> 无标题行</label>
            <label><input type="radio" name="ho-word-sort-header" value="yes" /> 有标题行</label>
          </div>
        </div>
        <div class="ho-word-color-foot">
          <div></div>
          <div class="ho-word-color-actions">
            <button type="button" data-sort-ok>确定</button>
            <button type="button" data-sort-cancel>取消</button>
          </div>
        </div>
      </div>`;
    document.body.append(this.root);

    this.columnSelect = this.root.querySelector("[data-sort-col]") as HTMLSelectElement;
    this.kindSelect = this.root.querySelector("[data-sort-kind]") as HTMLSelectElement;
    this.hintEl = this.root.querySelector("[data-sort-hint]") as HTMLElement;

    this.root.addEventListener("mousedown", (event) => event.stopPropagation());
    this.root.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target === this.root || target.dataset.sortCancel != null) {
        this.close();
        return;
      }
      if (target.dataset.sortOk != null) {
        this.commit();
      }
    });
    this.root.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.name === "ho-word-sort-order") {
        this.order = target.value === "desc" ? "desc" : "asc";
      } else if (target.name === "ho-word-sort-header") {
        this.hasHeader = target.value === "yes";
      }
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.commit();
      }
    });
  }

  open(info: SortTargetInfo, onSubmit: (options: SortOptions) => void): void {
    this.onSubmit = onSubmit;
    this.order = "asc";
    this.hasHeader = false;
    this.kindSelect.value = "text";
    this.root.querySelectorAll<HTMLInputElement>('input[name="ho-word-sort-order"]').forEach((el) => {
      el.checked = el.value === "asc";
    });
    this.root.querySelectorAll<HTMLInputElement>('input[name="ho-word-sort-header"]').forEach((el) => {
      el.checked = el.value === "no";
    });
    if (info.mode === "table") {
      this.hintEl.textContent = `当前表格共 ${info.count} 行`;
      this.columnSelect.innerHTML = Array.from({ length: info.columnCount }, (_, idx) => {
        return `<option value="${idx}">列 ${idx + 1}</option>`;
      }).join("");
      this.columnSelect.value = String(info.activeColumn);
    } else {
      this.hintEl.textContent = `将对 ${info.count} 个段落排序`;
      this.columnSelect.innerHTML = `<option value="0">段落数</option>`;
      this.columnSelect.value = "0";
    }
    this.root.hidden = false;
    this.kindSelect.focus();
  }

  close(): void {
    this.root.hidden = true;
    this.onSubmit = null;
  }

  private commit(): void {
    const submit = this.onSubmit;
    if (!submit) {
      this.close();
      return;
    }
    const options: SortOptions = {
      order: this.order,
      kind: this.kindSelect.value as SortKind,
      hasHeader: this.hasHeader,
      columnIndex: Number(this.columnSelect.value) || 0,
    };
    this.close();
    submit(options);
  }
}
