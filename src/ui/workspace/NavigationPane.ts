import type { Paragraph } from "../../model/block/Paragraph";
import type { Document } from "../../model/document/Document";
import { collectHeadings, type TocHeading } from "../../model/toc/Toc";
import type { FindHit } from "../../edit/Find";
import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";

export type NavigationTab = "headings" | "pages" | "results";
export interface PagePreview { page: number; canvas: HTMLCanvasElement }

interface NavigationHost {
  document(): Document | null;
  pageCount(): number;
  search(text: string): FindHit[];
  resultLocation(hit: FindHit): string | undefined;
  clearSearch(): void;
  selectResult(index: number): void;
  jumpHeading(paragraph: Paragraph): void;
  jumpPage(page: number): void;
  preview(pages: PagePreview[]): void;
  resize(): void;
  close(): void;
}

interface HeadingRow extends TocHeading {
  parent?: HeadingRow;
  branch: boolean;
  index: number;
}

const PAGE_ROW = 132;
const RESULT_COUNT = 60;

export class NavigationPane {
  readonly el = document.createElement("aside");
  private readonly search: HTMLInputElement;
  private readonly outline: HTMLElement;
  private readonly pages: HTMLElement;
  private readonly pageRows: HTMLElement;
  private readonly pageInput: HTMLInputElement;
  private readonly results: HTMLElement;
  private readonly resultList: HTMLElement;
  private readonly resultStatus: HTMLElement;
  private readonly splitter: HTMLElement;
  private readonly headings: HeadingRow[] = [];
  private readonly documentHeadings = new Map<Paragraph, HeadingRow>();
  private readonly collapsed = new Set<Paragraph>();
  private readonly headingButtons = new Map<Paragraph, HTMLElement>();
  private readonly pageButtons = new Map<number, { button: HTMLButtonElement; canvas: HTMLCanvasElement; drawn: boolean }>();
  private document: Document | null = null;
  private tab: NavigationTab = "headings";
  private browseTab: Exclude<NavigationTab, "results"> = "headings";
  private activeHeading?: Paragraph;
  private activePage = 1;
  private matches: FindHit[] = [];
  private resultIndex = -1;
  private resultOffset = 0;
  private dirty = true;
  private timer?: number;
  private contentTimer?: number;
  private frame?: number;
  private resizeFrame?: number;
  private composition = false;
  private width = 264;
  private drag?: { id: number; x: number; width: number };

  constructor(private readonly host: NavigationHost) {
    this.el.className = "ho-word-navigation";
    this.el.hidden = true;
    this.el.setAttribute("aria-label", "导航窗格");
    this.el.innerHTML = `
      <header class="ho-word-pane-header">
        <span>导航</span>
        <button type="button" class="ho-word-pane-close" data-nav-close aria-label="关闭导航窗格">×</button>
      </header>
      <div class="ho-word-nav-search">
        <input type="search" aria-label="搜索文档" placeholder="搜索文档" autocomplete="off" />
        <button type="button" data-nav-clear aria-label="清空搜索" hidden>×</button>
      </div>
      <div class="ho-word-nav-tabs" role="tablist" aria-label="导航方式">
        <button type="button" role="tab" data-nav-tab="headings">标题</button>
        <button type="button" role="tab" data-nav-tab="pages">页面</button>
        <button type="button" role="tab" data-nav-tab="results">结果</button>
      </div>
      <div data-nav-panel="headings" class="ho-word-nav-outline" role="tabpanel" aria-label="标题"></div>
      <div data-nav-panel="pages" class="ho-word-nav-pages" role="tabpanel" aria-label="页面" hidden>
        <form class="ho-word-nav-page-form">
          <label>跳到第 <input type="number" min="1" step="1" required aria-label="页码" /> 页</label>
          <button type="submit">跳转</button>
        </form>
        <div class="ho-word-nav-page-scroll"><div class="ho-word-nav-page-rows"></div></div>
      </div>
      <div data-nav-panel="results" class="ho-word-nav-results" role="tabpanel" aria-label="搜索结果" hidden>
        <div class="ho-word-nav-result-tools">
          <span role="status" aria-live="polite"></span>
          <button type="button" data-nav-step="-1" aria-label="上一处结果">↑</button>
          <button type="button" data-nav-step="1" aria-label="下一处结果">↓</button>
        </div>
        <div class="ho-word-nav-result-list"></div>
      </div>
      <div class="ho-word-nav-splitter" role="separator" aria-label="调整导航窗格宽度"
        aria-orientation="vertical" tabindex="0" aria-valuemin="188" aria-valuemax="460" aria-valuenow="264"></div>`;
    this.search = this.el.querySelector('input[type="search"]')!;
    this.outline = this.el.querySelector('[data-nav-panel="headings"]')!;
    this.pages = this.el.querySelector(".ho-word-nav-page-scroll")!;
    this.pageRows = this.el.querySelector(".ho-word-nav-page-rows")!;
    this.pageInput = this.el.querySelector('input[type="number"]')!;
    this.results = this.el.querySelector('[data-nav-panel="results"]')!;
    this.resultList = this.el.querySelector(".ho-word-nav-result-list")!;
    this.resultStatus = this.results.querySelector('[role="status"]')!;
    this.splitter = this.el.querySelector('[role="separator"]')!;
    this.el.addEventListener("click", this.onClick);
    this.el.addEventListener("keydown", this.onKeyDown);
    this.search.addEventListener("input", () => { if (!this.composition) this.queueSearch(); });
    this.search.addEventListener("compositionstart", () => { this.composition = true; });
    this.search.addEventListener("compositionend", () => { this.composition = false; this.queueSearch(); });
    this.pages.addEventListener("scroll", () => this.schedulePages());
    this.pageInput.form!.addEventListener("submit", (event) => {
      event.preventDefault();
      this.gotoPage(Number(this.pageInput.value));
    });
    this.splitter.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.drag = { id: event.pointerId, x: event.clientX, width: this.el.getBoundingClientRect().width };
      this.splitter.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    this.splitter.addEventListener("pointermove", (event) => {
      if (this.drag?.id === event.pointerId) this.setWidth(this.drag.width + event.clientX - this.drag.x);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      this.splitter.addEventListener(type, () => { this.drag = undefined; });
    }
    this.setTab("headings");
  }

  isOpen(): boolean { return !this.el.hidden; }

  setOpen(open: boolean, tab = this.tab, focusSearch = false): void {
    this.el.hidden = !open;
    if (open) {
      this.refresh();
      this.setTab(tab);
      if (focusSearch) {
        this.search.focus();
        this.search.select();
      }
    } else {
      this.cancelTimer();
      this.host.clearSearch();
      this.pageButtons.clear();
      this.pageRows.replaceChildren();
    }
  }

  dispose(): void {
    this.cancelTimer();
    window.clearTimeout(this.contentTimer);
    if (this.frame !== undefined) window.cancelAnimationFrame(this.frame);
    if (this.resizeFrame !== undefined) window.cancelAnimationFrame(this.resizeFrame);
    this.el.remove();
  }

  contentChanged(): void {
    this.dirty = true;
    // 页面缩略图随内容刷新，输入期间合并刷新请求。
    if (this.isOpen()) {
      window.clearTimeout(this.contentTimer);
      this.contentTimer = window.setTimeout(() => {
        this.contentTimer = undefined;
        this.refresh();
      }, 160);
    }
  }

  reset(): void {
    this.cancelTimer();
    window.clearTimeout(this.contentTimer);
    this.dirty = true;
    this.refresh();
  }

  selectionChanged(paragraph?: Paragraph): void {
    if (!this.isOpen()) return;
    const heading = paragraph && this.documentHeadings.get(paragraph);
    this.selectHeading(heading);
  }

  viewportChanged(page: number, heading?: Paragraph | null): void {
    if (!this.isOpen()) return;
    if (page !== this.activePage) {
      this.activePage = page;
      for (const [index, item] of this.pageButtons) item.button.setAttribute("aria-current", index === page ? "page" : "false");
      if (document.activeElement !== this.pageInput) this.pageInput.value = String(page);
      const top = (page - 1) * PAGE_ROW;
      if (this.tab === "pages" && (top < this.pages.scrollTop || top + PAGE_ROW > this.pages.scrollTop + this.pages.clientHeight)) {
        this.pages.scrollTop = top;
      }
    }
    if (heading !== undefined) {
      this.selectHeading(heading ? this.documentHeadings.get(heading) : undefined);
    }
    if (this.tab === "pages") this.schedulePages();
  }

  headingList(): readonly TocHeading[] { return this.headings; }

  invalidatePreviews(): void {
    for (const entry of this.pageButtons.values()) entry.drawn = false;
    this.schedulePages();
  }

  private refresh(): void {
    const model = this.host.document();
    if (model !== this.document) {
      this.document = model;
      this.search.value = "";
      this.matches = [];
      this.resultIndex = -1;
      this.activeHeading = undefined;
      this.activePage = 1;
      this.collapsed.clear();
      this.documentHeadings.clear();
      this.headings.length = 0;
      this.pageButtons.clear();
      this.pageRows.replaceChildren();
      this.pages.scrollTop = 0;
      this.dirty = true;
      if (this.tab === "results") this.setTab(this.browseTab);
    }
    if (!this.isOpen() || !this.dirty) return;
    this.dirty = false;
    this.buildOutline();
    for (const entry of this.pageButtons.values()) entry.drawn = false;
    this.pageInput.max = String(this.host.pageCount());
    this.pageInput.value = String(this.activePage);
    if (this.tab === "headings") this.renderOutline();
    if (this.tab === "pages") this.schedulePages();
    if (this.tab === "results") this.runSearch(false);
  }

  private buildOutline(): void {
    const source = this.document ? collectHeadings(this.document, 9) : [];
    this.headings.length = 0;
    this.documentHeadings.clear();
    const stack: HeadingRow[] = [];
    const headings = new Map<Paragraph, HeadingRow>();
    for (const entry of source) {
      while (stack.length && stack[stack.length - 1].level >= entry.level) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) parent.branch = true;
      const row = { ...entry, parent, branch: false, index: this.headings.length };
      stack.push(row);
      this.headings.push(row);
      headings.set(row.paragraph, row);
    }
    let current: HeadingRow | undefined;
    this.document?.paragraphs.each(({ data }) => {
      const heading = headings.get(data);
      if (heading) current = heading;
      if (current) this.documentHeadings.set(data, current);
    });
    for (const paragraph of this.collapsed) if (!headings.has(paragraph)) this.collapsed.delete(paragraph);
  }

  private renderOutline(): void {
    const focused = document.activeElement?.closest<HTMLElement>("[data-nav-heading]");
    const focusedKey = focused?.dataset.navHeading;
    this.headingButtons.clear();
    this.outline.replaceChildren();
    if (!this.headings.length) {
      this.outline.append(message("暂无标题。为段落应用标题样式或设置大纲级别后，这里会显示标题。"));
      return;
    }
    const tree = document.createElement("div");
    tree.setAttribute("role", "tree");
    tree.setAttribute("aria-label", "文档标题");
    const rows = this.headings.filter((row) => {
      for (let parent = row.parent; parent; parent = parent.parent) {
        if (this.collapsed.has(parent.paragraph)) return false;
      }
      return true;
    });
    let focusTarget: HTMLElement | undefined;
    for (const row of rows) {
      const index = row.index;
      const item = document.createElement("div");
      item.className = "ho-word-nav-heading-row";
      item.style.paddingInlineStart = Math.min(8, row.level - 1) * 13 + "px";
      item.setAttribute("role", "none");
      if (row.branch) {
        const toggle = document.createElement("button");
        const closed = this.collapsed.has(row.paragraph);
        toggle.type = "button";
        toggle.tabIndex = -1;
        toggle.dataset.navExpand = String(index);
        toggle.setAttribute("aria-label", (closed ? "展开 " : "折叠 ") + row.text);
        toggle.textContent = closed ? "▸" : "▾";
        item.append(toggle);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.navHeading = String(index);
      button.setAttribute("role", "treeitem");
      button.setAttribute("aria-level", String(row.level));
      if (row.branch) button.setAttribute("aria-expanded", String(!this.collapsed.has(row.paragraph)));
      button.textContent = row.text;
      button.title = row.text;
      button.tabIndex = -1;
      if (String(index) === focusedKey) focusTarget = button;
      item.append(button);
      tree.append(item);
      this.headingButtons.set(row.paragraph, button);
    }
    this.outline.append(tree);
    this.syncHeadingButtons();
    focusTarget?.focus({ preventScroll: true });
  }

  private selectHeading(row?: HeadingRow): void {
    if (row?.paragraph === this.activeHeading) return;
    // 手工折叠的分支仍保持折叠，活动状态显示在可见的祖先上。
    this.activeHeading = row?.paragraph;
    if (this.tab === "headings") this.syncHeadingButtons();
  }

  private syncHeadingButtons(): void {
    let row = this.activeHeading && this.documentHeadings.get(this.activeHeading);
    while (row && !this.headingButtons.has(row.paragraph)) row = row.parent;
    const active = row?.paragraph;
    const first = this.headingButtons.keys().next().value;
    for (const [paragraph, button] of this.headingButtons) {
      button.setAttribute("aria-current", String(paragraph === active));
      button.tabIndex = paragraph === (active ?? first) ? 0 : -1;
    }
  }

  private schedulePages(): void {
    if (!this.isOpen() || this.tab !== "pages" || this.frame !== undefined) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = undefined;
      if (this.isOpen() && this.tab === "pages") this.renderPages();
    });
  }

  private renderPages(): void {
    const count = this.host.pageCount();
    this.pageInput.max = String(count);
    this.pageRows.style.height = count * PAGE_ROW + "px";
    const first = Math.max(1, Math.floor(this.pages.scrollTop / PAGE_ROW));
    const last = Math.min(count, first + Math.ceil(Math.max(this.pages.clientHeight, PAGE_ROW) / PAGE_ROW) + 2);
    for (const [page, item] of this.pageButtons) {
      if (page >= first && page <= last || item.button === document.activeElement) continue;
      item.button.remove();
      this.pageButtons.delete(page);
    }
    const previews: PagePreview[] = [];
    for (let page = first; page <= last; page += 1) {
      let item = this.pageButtons.get(page);
      if (!item) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.navPage = String(page);
        button.style.top = (page - 1) * PAGE_ROW + "px";
        button.setAttribute("aria-label", "第 " + page + " 页");
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = "第 " + page + " 页";
        button.append(canvas, label);
        const after = Math.min(...[...this.pageButtons.keys()].filter((index) => index > page));
        const successor = this.pageButtons.get(after)?.button;
        this.pageRows.insertBefore(button, successor ?? null);
        item = { button, canvas, drawn: false };
        this.pageButtons.set(page, item);
      }
      item.button.setAttribute("aria-current", page === this.activePage ? "page" : "false");
      if (!item.drawn) {
        item.drawn = true;
        previews.push({ page, canvas: item.canvas });
      }
    }
    if (previews.length) this.host.preview(previews);
  }

  private gotoPage(page: number): void {
    if (!Number.isInteger(page) || page < 1 || page > this.host.pageCount()) return;
    this.pageInput.value = String(page);
    this.host.jumpPage(page);
    this.pages.scrollTop = Math.max(0, (page - 1) * PAGE_ROW - Math.max(0, (this.pages.clientHeight - PAGE_ROW) / 2));
    this.schedulePages();
  }

  private queueSearch(): void {
    this.cancelTimer();
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      this.runSearch();
    }, 140);
  }

  private runSearch(switchTab = true): void {
    this.cancelTimer();
    const query = this.search.value.trim();
    this.el.querySelector<HTMLElement>("[data-nav-clear]")!.hidden = !query;
    if (!query) {
      this.matches = [];
      this.resultIndex = -1;
      this.host.clearSearch();
      if (switchTab) this.setTab(this.browseTab);
      else this.renderResults();
      return;
    }
    this.matches = this.host.search(query);
    this.resultIndex = -1;
    this.resultOffset = 0;
    if (switchTab) this.setTab("results", false);
    this.renderResults();
  }

  private renderResults(): void {
    const total = this.matches.length;
    this.resultStatus.textContent = this.resultIndex >= 0 ? (this.resultIndex + 1) + " / " + total :
      this.search.value.trim() ? total + " 处匹配" : "输入文字以搜索";
    for (const button of this.results.querySelectorAll<HTMLButtonElement>("[data-nav-step]")) button.disabled = !total;
    this.resultList.replaceChildren();
    if (!total && this.search.value.trim()) this.resultList.append(message("未找到匹配内容。"));
    for (const [offset, match] of this.matches.slice(this.resultOffset, this.resultOffset + RESULT_COUNT).entries()) {
      const index = this.resultOffset + offset;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.navResult = String(index);
      button.setAttribute("aria-current", String(index === this.resultIndex));
      const { before, text, after } = snippet(match);
      const mark = document.createElement("mark");
      mark.textContent = text;
      button.append(before, mark, after);
      const location = this.host.resultLocation(match);
      if (location) {
        const label = document.createElement("small");
        label.className = "ho-word-nav-result-location";
        label.textContent = location;
        button.append(label);
      }
      this.resultList.append(button);
    }
    if (total > RESULT_COUNT) {
      const pages = document.createElement("div");
      pages.className = "ho-word-nav-result-pages";
      for (const [direction, label] of [[-1, "前一组结果"], [1, "后一组结果"]] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.navMore = String(direction);
        button.textContent = label;
        button.disabled = direction === -1 ? this.resultOffset === 0 : this.resultOffset + RESULT_COUNT >= total;
        pages.append(button);
      }
      this.resultList.append(pages);
    }
  }

  private gotoResult(index: number): void {
    const total = this.matches.length;
    if (!total) return;
    const keepFocus = this.resultList.contains(document.activeElement);
    this.resultIndex = (index + total) % total;
    this.resultOffset = Math.floor(this.resultIndex / RESULT_COUNT) * RESULT_COUNT;
    this.host.selectResult(this.resultIndex);
    this.renderResults();
    const selected = this.resultList.querySelector<HTMLElement>('[aria-current="true"]');
    selected?.scrollIntoView({ block: "nearest" });
    if (keepFocus) selected?.focus({ preventScroll: true });
  }

  private setTab(tab: NavigationTab, search = true): void {
    if (tab !== "results" && this.tab === "results") this.host.clearSearch();
    this.tab = tab;
    if (tab !== "results") this.browseTab = tab;
    for (const button of this.el.querySelectorAll<HTMLButtonElement>("[data-nav-tab]")) {
      const active = button.dataset.navTab === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const panel of this.el.querySelectorAll<HTMLElement>("[data-nav-panel]")) panel.hidden = panel.dataset.navPanel !== tab;
    if (tab === "headings") this.renderOutline();
    if (tab === "pages") {
      this.pageInput.value = String(this.activePage);
      this.pages.scrollTop = (this.activePage - 1) * PAGE_ROW;
      this.schedulePages();
    }
    if (tab === "results" && search && this.isOpen()) this.runSearch(false);
  }

  private setWidth(width: number): void {
    this.width = Math.max(188, Math.min(460, width));
    this.el.style.setProperty("--nav-width", this.width + "px");
    this.splitter.setAttribute("aria-valuenow", String(this.width));
    if (this.resizeFrame !== undefined) return;
    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = undefined;
      this.host.resize();
    });
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    const data = button.dataset;
    if (data.navClose !== undefined) this.host.close();
    else if (data.navClear !== undefined) {
      this.search.value = "";
      this.runSearch();
      this.search.focus();
    } else if (data.navTab) this.setTab(data.navTab as NavigationTab);
    else if (data.navExpand !== undefined) {
      const row = this.headings[Number(data.navExpand)];
      if (!this.collapsed.delete(row.paragraph)) this.collapsed.add(row.paragraph);
      this.renderOutline();
      this.headingButtons.get(row.paragraph)?.focus();
    } else if (data.navHeading !== undefined) {
      const row = this.headings[Number(data.navHeading)];
      this.host.jumpHeading(row.paragraph);
      this.selectHeading(row);
    } else if (data.navPage) this.gotoPage(Number(data.navPage));
    else if (data.navResult !== undefined) this.gotoResult(Number(data.navResult));
    else if (data.navStep) this.stepResult(Number(data.navStep));
    else if (data.navMore !== undefined) {
      this.resultOffset += Number(data.navMore) * RESULT_COUNT;
      this.renderResults();
      this.resultList.scrollTop = 0;
    }
  };

  private stepResult(direction: number): void {
    if (this.timer !== undefined || this.tab !== "results") this.runSearch();
    const next = this.resultIndex < 0 && direction < 0 ? this.matches.length - 1 : this.resultIndex + direction;
    this.gotoResult(next);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || this.composition) return;
    const target = event.target as HTMLElement;
    if (target === this.search && event.key === "Enter") {
      event.preventDefault();
      this.stepResult(event.shiftKey ? -1 : 1);
      return;
    }
    if (target === this.splitter && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      this.setWidth(this.width + (event.key === "ArrowLeft" ? -16 : 16));
      return;
    }
    if (target.dataset.navTab && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const tabs = [...this.el.querySelectorAll<HTMLButtonElement>("[data-nav-tab]")];
      const next = (tabs.indexOf(target as HTMLButtonElement) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
      return;
    }
    if (target.dataset.navHeading === undefined) return;
    const row = this.headings[Number(target.dataset.navHeading)];
    const visible = [...this.headingButtons.values()];
    const index = visible.indexOf(target);
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 :
        Math.max(0, Math.min(visible.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      visible[next]?.focus();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const open = row.branch && !this.collapsed.has(row.paragraph);
      if ((event.key === "ArrowRight" && row.branch && !open) || (event.key === "ArrowLeft" && open)) {
        target.parentElement?.querySelector<HTMLButtonElement>("[data-nav-expand]")?.click();
      } else if (event.key === "ArrowRight" && open) visible[index + 1]?.focus();
      else if (event.key === "ArrowLeft" && row.parent) this.headingButtons.get(row.parent.paragraph)?.focus();
    }
  };
}

function message(text: string): HTMLElement {
  const el = document.createElement("p");
  el.className = "ho-word-nav-message";
  el.textContent = text;
  return el;
}

function snippet({ start, end }: FindHit): { before: string; text: string; after: string } {
  const paragraph = start.data.paragraph;
  const left: string[] = [];
  const right: string[] = [];
  for (let node = start.pre; node && node.data.paragraph === paragraph && left.length < 22; node = node.pre) {
    if (!node.data.isEnterChar()) left.push(node.data.char);
  }
  for (let node = end.next; node && node.data.paragraph === paragraph && right.length < 28; node = node.next) {
    if (!node.data.isEnterChar()) right.push(node.data.char);
  }
  let text = "";
  for (let node: LinkedNode<Word> | null = start; node; node = node.next) {
    text += node.data.char;
    if (node === end) break;
  }
  return { before: (left.length === 22 ? "…" : "") + left.reverse().join(""), text, after: right.join("") + (right.length === 28 ? "…" : "") };
}
