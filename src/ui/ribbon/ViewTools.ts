import type { Workspace } from "../workspace/Workspace";
import { RibbonIcons } from "./RibbonIcons";

export type ViewHost = Pick<Workspace, "viewState" | "toggleNavigationPane" | "showNavigationHeadings" |
  "openNavigationSearch" | "togglePageGrid" | "toggleRuler" | "setFocusMode" | "setZoom" | "fitView">;

export function viewMarkup(): string {
  return `
    <div class="ho-word-ribbon-page ho-word-view-page" data-page="view" hidden>
      <section class="ho-word-group">
        <div class="ho-word-group-body">
          ${button("headings", "大纲", RibbonIcons.wordCount)}
          ${button("focus", "专注", RibbonIcons.selectionPane, true)}
        </div>
        <span>视图</span>
      </section>
      <section class="ho-word-group">
        <div class="ho-word-view-options">
          <label><input type="checkbox" data-view-option="ruler">标尺</label>
          <label><input type="checkbox" data-view-option="grid">网格线</label>
          <label><input type="checkbox" data-view-option="navigation">导航窗格</label>
        </div>
        <span>显示</span>
      </section>
      <section class="ho-word-group">
        <div class="ho-word-group-body">
          ${button("zoom", "缩放", RibbonIcons.find)}
          ${button("actual", "100%", RibbonIcons.pageNumber, true)}
          ${button("page", "单页", RibbonIcons.blankPage, true)}
          ${button("width", "页宽", RibbonIcons.alignObjects, true)}
        </div>
        <span>缩放</span>
      </section>
    </div>`;
}

function button(action: string, label: string, icon: string, toggle = false): string {
  return `<button type="button" class="ho-word-big" data-view-action="${action}"${toggle ? ' aria-pressed="false"' : ""}>${icon}<span>${label}</span></button>`;
}

export class ViewTools {
  private readonly panel: HTMLElement;
  private readonly zoom = document.createElement("dialog");

  constructor(root: HTMLElement, private readonly host?: ViewHost) {
    this.panel = root.querySelector('[data-page="view"]')!;
    this.panel.addEventListener("click", this.onClick);
    this.panel.addEventListener("change", this.onChange);
    this.zoom.className = "ho-word-reference-dialog";
    this.zoom.setAttribute("aria-label", "缩放");
    this.zoom.innerHTML = `
      <h2>缩放</h2>
      <form>
        <div class="ho-word-reference-fields"><label>缩放比例（%）<input type="number" min="25" max="200" step="1" required></label></div>
        <div class="ho-word-reference-actions"><button type="button">取消</button><button type="submit">确定</button></div>
      </form>`;
    this.zoom.querySelector('button[type="button"]')!.addEventListener("click", () => this.zoom.close());
    this.zoom.querySelector("form")!.addEventListener("submit", (event) => {
      event.preventDefault();
      const percent = this.zoom.querySelector("input")!.valueAsNumber;
      this.zoom.close();
      this.host?.setZoom(percent / 100);
    });
    document.body.append(this.zoom);
  }

  destroy(): void {
    this.panel.removeEventListener("click", this.onClick);
    this.panel.removeEventListener("change", this.onChange);
    this.zoom.remove();
  }

  sync(hasDoc: boolean): void {
    const state = this.host?.viewState();
    const options = this.panel.querySelectorAll<HTMLInputElement>("[data-view-option]");
    const optionStates = { ruler: state?.ruler, grid: state?.grid, navigation: state?.navigationOpen };
    for (const input of options) {
      input.disabled = !hasDoc || !state;
      input.checked = !!optionStates[input.dataset.viewOption as keyof typeof optionStates];
    }
    for (const button of this.panel.querySelectorAll<HTMLButtonElement>("[data-view-action]")) {
      button.disabled = !hasDoc || !state;
      if (!button.hasAttribute("aria-pressed")) continue;
      const action = button.dataset.viewAction;
      const active = action === "focus" ? !!state?.focusMode :
        action === "actual" ? state?.zoomMode === "manual" && Math.abs(state.zoom - 1) < 0.001 : state?.zoomMode === action;
      button.classList.toggle("is-on", !!active);
      button.setAttribute("aria-pressed", String(!!active));
    }
  }

  private readonly onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-view-action]");
    if (!this.host || !button || button.disabled) return;
    const action = button.dataset.viewAction;
    if (action === "headings") this.host.showNavigationHeadings();
    else if (action === "focus") this.host.setFocusMode(!this.host.viewState().focusMode);
    else if (action === "actual") this.host.setZoom(1);
    else if (action === "page" || action === "width") this.host.fitView(action);
    else if (action === "zoom") {
      const input = this.zoom.querySelector("input")!;
      input.value = String(Math.round(this.host.viewState().zoom * 100));
      this.zoom.showModal();
      input.focus();
      input.select();
    }
  };

  private readonly onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.viewOption === "ruler") this.host?.toggleRuler();
    if (target.dataset.viewOption === "grid") this.host?.togglePageGrid();
    if (target.dataset.viewOption === "navigation") this.host?.toggleNavigationPane();
  };
}
