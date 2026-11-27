import { collectStories } from "../../edit/Find";
import type { Document } from "../../model/document/Document";
import type { Workspace } from "../workspace/Workspace";
import { MAX_ZOOM, MIN_ZOOM, stepZoom } from "../workspace/ZoomLevels";

function countCharacters(document: Document): number {
  let count = 0;
  for (const story of collectStories([{ document, story: { slot: "body" } }])) {
    story.document.paragraphs.each(({ data: paragraph }) => {
      for (const block of paragraph.blocks) {
        for (const char of block.text) {
          if (/\S/u.test(char)) {
            count += 1;
          }
        }
      }
    });
  }
  return count;
}

export class StatusBar {
  private readonly page: HTMLElement;
  private readonly characters: HTMLElement;
  private readonly range: HTMLInputElement;
  private readonly decrease: HTMLButtonElement;
  private readonly increase: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;
  private countedDocument: Document | null = null;
  private countTimer: number | undefined;
  private zoomFrame: number | undefined;
  private readonly unsubscribe: () => void;

  constructor(private readonly host: HTMLElement, private readonly workspace: Workspace) {
    host.classList.add("ho-word-statusbar");
    host.innerHTML = `
      <span class="ho-word-statusbar-page"></span>
      <span class="ho-word-statusbar-count" title="正文、表格和文本框中不含空白的字符数"></span>
      <div class="ho-word-statusbar-zoom" role="group" aria-label="文档缩放">
        <button type="button" data-zoom="out" aria-label="缩小" title="缩小">−</button>
        <input type="range" aria-label="缩放比例" min="${MIN_ZOOM * 100}" max="${MAX_ZOOM * 100}" step="1">
        <button type="button" data-zoom="in" aria-label="放大" title="放大">+</button>
        <button type="button" data-zoom="reset" aria-label="恢复 100% 缩放" title="恢复 100% 缩放"></button>
      </div>
    `;
    this.page = host.querySelector(".ho-word-statusbar-page")!;
    this.characters = host.querySelector(".ho-word-statusbar-count")!;
    this.range = host.querySelector("input")!;
    this.decrease = host.querySelector('[data-zoom="out"]')!;
    this.increase = host.querySelector('[data-zoom="in"]')!;
    this.reset = host.querySelector('[data-zoom="reset"]')!;

    this.decrease.addEventListener("click", () => this.setZoom(stepZoom(workspace.viewport.zoom, -1)));
    this.increase.addEventListener("click", () => this.setZoom(stepZoom(workspace.viewport.zoom, 1)));
    this.reset.addEventListener("click", () => this.setZoom(1));
    this.range.addEventListener("input", () => this.scheduleZoom());
    this.unsubscribe = workspace.onStatusChange((change) => {
      if (change === "view") {
        this.syncView();
      } else {
        this.updateCount();
      }
    });
    this.syncView();
    this.syncCount(workspace.bodyDocument());
  }

  dispose(): void {
    this.unsubscribe();
    window.clearTimeout(this.countTimer);
    this.cancelZoom();
    this.host.replaceChildren();
  }

  private syncView(): void {
    const text = `第 ${this.workspace.viewportPage()} 页 / 共 ${this.workspace.pageCount} 页`;
    if (this.page.textContent !== text) {
      this.page.textContent = text;
    }
    const zoom = this.workspace.viewport.zoom;
    const percent = Math.round(zoom * 100);
    const label = `${percent}%`;
    if (this.reset.textContent !== label) {
      this.reset.textContent = label;
    }
    if (this.zoomFrame === undefined) {
      const value = String(percent);
      if (this.range.value !== value) {
        this.range.value = value;
      }
      if (this.range.getAttribute("aria-valuetext") !== label) {
        this.range.setAttribute("aria-valuetext", label);
      }
    }
    this.decrease.disabled = zoom <= MIN_ZOOM;
    this.increase.disabled = zoom >= MAX_ZOOM;
  }

  private scheduleZoom(): void {
    this.range.setAttribute("aria-valuetext", `${this.range.value}%`);
    if (this.zoomFrame === undefined) {
      this.zoomFrame = window.requestAnimationFrame(() => {
        this.zoomFrame = undefined;
        this.setZoom(this.range.valueAsNumber / 100);
      });
    }
  }

  private setZoom(zoom: number): void {
    this.cancelZoom();
    this.workspace.setZoom(zoom);
    this.syncView();
  }

  private cancelZoom(): void {
    if (this.zoomFrame !== undefined) {
      window.cancelAnimationFrame(this.zoomFrame);
      this.zoomFrame = undefined;
    }
  }

  private updateCount(): void {
    window.clearTimeout(this.countTimer);
    const document = this.workspace.bodyDocument();
    if (document !== this.countedDocument) {
      this.syncCount(document);
    } else {
      this.countTimer = window.setTimeout(() => this.syncCount(this.workspace.bodyDocument()), 150);
    }
  }

  private syncCount(document: Document | null): void {
    this.countTimer = undefined;
    this.countedDocument = document;
    const count = document ? countCharacters(document) : 0;
    this.characters.textContent = `${count.toLocaleString("zh-CN")} 个字符`;
  }
}
