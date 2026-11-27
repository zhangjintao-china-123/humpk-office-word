import type { StorySource } from "../../edit/Find";
import type { EditImpact } from "../../edit/EditImpact";
import type { PageRange } from "../../editor/StoryEditor";
import type { Paragraph } from "../../model/block/Paragraph";
import type { Document } from "../../model/document/Document";
import type { Line } from "../../model/line/Line";
import type { DocComment } from "../../model/review/Review";
import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";
import { CaretPos } from "../../selection/CaretPos";
import type { HitContext, HitTester } from "../../selection/HitTester";
import { cellsInReadingOrder } from "../../selection/MainWalk";
import { isVerticalTextStory, type StoryRef } from "../../selection/StoryRef";

const GUTTER_GAP = 12;
const CARD_GAP = 8;
const PAGE_INSET = 8;

interface SavedComment {
  comment: DocComment;
  offsetY: number;
  anchored: boolean;
}

type PageComment = SavedComment | { form: HTMLFormElement; offsetY: number };

interface CommentDraft {
  anchor: CaretPos;
  form: HTMLFormElement;
  input: HTMLTextAreaElement;
}

interface RenderedPage {
  el: HTMLElement;
  cards: HTMLElement[];
  items: PageComment[];
  width: number;
  height: number;
  zoom: number;
}

export class CommentMargin {
  readonly el = document.createElement("aside");
  private model: Document | null = null;
  private count = 0;
  private showSaved = true;
  private draft?: CommentDraft;
  private draftPage?: number;
  private active?: string;
  private anchors = new Map<string, CaretPos>();
  private anchorParagraphs = new Set<Paragraph>();
  private anchorDirty = true;
  private placementDirty = true;
  private placements = new Map<number, PageComment[]>();
  private rendered = new Map<number, RenderedPage>();
  private bodyLines?: Line[];
  private pageCount = 0;

  constructor(
    private readonly hit: HitTester,
    private readonly stories: () => StorySource[],
    private readonly navigate: (id: string) => void,
  ) {
    this.el.className = "ho-word-comment-margin";
    this.el.setAttribute("aria-label", "页面批注");
    this.el.hidden = true;
    this.el.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.el.addEventListener("contextmenu", (event) => event.stopPropagation());
    this.el.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-margin-comment]");
      if (target?.dataset.marginComment && !target.disabled) this.navigate(target.dataset.marginComment);
    });
  }

  reset(model: Document | null): void {
    this.model = model;
    this.count = model?.comments.length ?? 0;
    this.showSaved = true;
    this.draft = undefined;
    this.draftPage = undefined;
    this.active = undefined;
    this.invalidate();
    this.el.replaceChildren();
    this.rendered.clear();
    this.el.hidden = !this.count;
  }

  invalidate(): void {
    this.anchorDirty = true;
    this.placementDirty = true;
  }

  afterEdit(impact: EditImpact): boolean {
    const hadMargin = this.hasMargin;
    const count = this.model?.comments.length ?? 0;
    if (count !== this.count || (count && (
      impact.structure !== "none" ||
      impact.dirty.some((p) => p.isTable || this.anchorParagraphs.has(p) ||
        p.blocks.some((b) => b.commentRef || b.commentIds?.length))
    ))) {
      this.invalidate();
    }
    if ((count || this.draft) && (impact.dirty.length || impact.structure !== "none")) this.placementDirty = true;
    this.count = count;
    this.el.hidden = !this.hasMargin;
    return hadMargin !== this.hasMargin;
  }

  gutterWidth(viewWidth: number): number {
    return this.hasMargin ? Math.max(124, Math.min(242, Math.round(viewWidth * 0.25))) + GUTTER_GAP : 0;
  }

  private get hasMargin(): boolean {
    return (this.showSaved && this.count > 0) || !!this.draft;
  }

  get savedVisible(): boolean {
    return this.showSaved;
  }

  get selectedId(): string | undefined {
    return this.active;
  }

  setSavedVisible(visible: boolean): void {
    this.showSaved = visible;
    this.placementDirty = true;
    this.el.hidden = !this.hasMargin;
  }

  savedAnchors(): ReadonlyMap<string, CaretPos> {
    this.indexAnchors();
    return this.anchors;
  }

  reveal(id: string): void {
    for (const { cards } of this.rendered.values()) {
      const card = cards.find((item) => item.dataset.marginComment === id);
      if (card) {
        card.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
    }
  }

  openDraft(anchor: CaretPos, submit: (text: string) => boolean, cancel: () => void): void {
    const form = document.createElement("form");
    form.className = "ho-word-comment-card ho-word-comment-draft";
    form.dataset.commentForm = "";
    form.setAttribute("aria-label", "新建批注");
    form.innerHTML = `
      <div class="ho-word-comment-draft-header">
        <strong>新建批注</strong>
        <button type="button" aria-label="取消批注" title="取消批注">×</button>
      </div>
      <textarea data-comment-text aria-label="批注内容" placeholder="输入批注"></textarea>
      <span class="ho-word-comment-draft-error" role="status" hidden></span>
      <button type="submit" disabled>提交批注</button>`;
    const input = form.querySelector("textarea")!;
    const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const error = form.querySelector<HTMLElement>('[role="status"]')!;

    form.querySelector('button[type="button"]')!.addEventListener("click", cancel);
    input.addEventListener("input", () => {
      send.disabled = !input.value.trim();
      error.hidden = true;
    });
    form.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (!send.disabled) form.requestSubmit();
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value && !submit(value)) {
        error.textContent = "批注的位置已失效，可以复制内容后到新的位置添加。";
        error.hidden = false;
        const page = this.draftPage === undefined ? undefined : this.rendered.get(this.draftPage);
        if (page) this.positionCards(page);
        this.focusDraft();
      }
    });
    this.draft = { anchor, form, input };
    this.placementDirty = true;
    this.el.hidden = false;
  }

  closeDraft(): boolean {
    this.draft?.form.remove();
    this.draft = undefined;
    this.draftPage = undefined;
    this.placementDirty = true;
    this.el.hidden = !this.hasMargin;
    return !this.hasMargin;
  }

  focusDraft(): void {
    if (!this.draft?.form.isConnected) return;
    this.draft.form.scrollIntoView({ block: "nearest", inline: "nearest" });
    this.draft.input.focus({ preventScroll: true });
  }

  anchorFor(id: string): CaretPos | undefined {
    this.indexAnchors();
    return this.anchors.get(id);
  }

  select(id: string | undefined): void {
    if (this.active === id) return;
    this.active = id;
    for (const page of this.rendered.values()) this.syncActive(page.cards);
  }

  paint(ctx: HitContext, visible: PageRange, zoom: number, viewWidth: number): void {
    if (!this.hasMargin) {
      if (this.rendered.size) {
        this.el.replaceChildren();
        this.rendered.clear();
      }
      return;
    }
    if (this.showSaved) this.indexAnchors();
    if (this.placementDirty || this.bodyLines !== ctx.body?.lines || this.pageCount !== ctx.origins.length) {
      this.placeAnchors(ctx);
    }

    const focused = this.draft?.form.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
    const indices = new Set<number>();
    for (let index = visible.start; index < visible.end; index += 1) indices.add(index);
    if (this.draftPage !== undefined) indices.add(this.draftPage);
    for (const [index, page] of this.rendered) {
      if (!indices.has(index) || !this.placements.has(index)) {
        page.el.remove();
        this.rendered.delete(index);
      }
    }
    const width = this.gutterWidth(viewWidth) - GUTTER_GAP;
    const height = Math.round(ctx.pageSetup.height * zoom);
    for (const index of indices) {
      const items = this.placements.get(index);
      if (!items?.length) continue;
      const origin = ctx.origins[index];
      const x = (origin.x + ctx.pageSetup.width) * zoom + GUTTER_GAP;
      const y = origin.y * zoom;
      const page = this.rendered.get(index);
      if (!page || page.items !== items || page.width !== width || page.zoom !== zoom || page.height !== height) {
        const next = this.makePage(index, items, width, height, zoom);
        next.el.style.left = `${x}px`;
        next.el.style.top = `${y}px`;
        if (page) page.el.replaceWith(next.el);
        else this.el.append(next.el);
        this.positionCards(next);
        this.syncActive(next.cards);
        this.rendered.set(index, next);
      } else {
        page.el.style.left = `${x}px`;
        page.el.style.top = `${y}px`;
      }
    }
    if (focused?.isConnected && focused !== document.activeElement) focused.focus({ preventScroll: true });
  }

  private indexAnchors(): void {
    if (!this.anchorDirty) return;
    this.anchorDirty = false;
    this.placementDirty = true;
    this.anchors.clear();
    this.anchorParagraphs.clear();
    if (!this.count) return;
    const needed = new Set(this.model?.comments.map(({ id }) => id));
    const references = new Map<string, CaretPos>();
    const visit = (doc: Document, story: StoryRef) => {
      doc.paragraphs.each(({ data: p }) => {
        if (p.table) {
          for (const cell of cellsInReadingOrder(p.table)) visit(cell.document, { slot: "cell", cell });
        }
        if (p.blocks.some((b) => b.commentRef || b.commentIds?.length)) {
          for (const line of p.lines) {
            walkLine(line, (node) => {
              const { block } = node.data;
              if (!block || node.data.isEnterChar()) return;
              for (const id of block.commentIds ?? []) {
                if (needed.has(id) && !this.anchors.has(id)) this.anchors.set(id, new CaretPos(story, node));
              }
              if (block.commentRef && needed.has(block.commentRef) && !references.has(block.commentRef)) {
                references.set(block.commentRef, new CaretPos(story, node));
              }
            });
          }
        }
        for (const block of p.blocks) {
          const text = block.drawing?.shape?.text;
          if (text) visit(text, { slot: "textbox", block });
        }
      });
    };
    const seen = new Set<Document>();
    for (const { document: doc, story } of this.stories()) {
      if (seen.has(doc)) continue;
      seen.add(doc);
      visit(doc, story);
    }
    for (const [id, pos] of references) {
      if (!this.anchors.has(id)) this.anchors.set(id, pos);
    }
    for (const pos of this.anchors.values()) {
      const paragraph = pos.node?.data.paragraph;
      if (paragraph) this.anchorParagraphs.add(paragraph);
    }
  }

  private placeAnchors(ctx: HitContext): void {
    this.placements = new Map();
    this.placementDirty = false;
    this.bodyLines = ctx.body?.lines;
    this.pageCount = ctx.origins.length;
    const previousDraftPage = this.draftPage ?? 0;
    this.draftPage = undefined;
    if (!ctx.origins.length || !this.model) return;
    const linesByParagraph = new Map<Paragraph, Line[]>();
    for (const line of this.showSaved && this.anchorParagraphs.size ? this.bodyLines ?? [] : []) {
      if (line.type || !line.paragraph || !this.anchorParagraphs.has(line.paragraph)) continue;
      const list = linesByParagraph.get(line.paragraph) ?? [];
      list.push(line);
      linesByParagraph.set(line.paragraph, list);
    }
    const stride = ctx.pageSetup.height + ctx.pageSetup.pageGap;
    for (const comment of this.showSaved ? this.model.comments : []) {
      const pos = this.anchors.get(comment.id);
      const node = pos?.node;
      const paragraph = node?.data.paragraph;
      let y: number | undefined;
      if (pos && node && paragraph) {
        const lines = pos.story.slot === "body" ? linesByParagraph.get(paragraph) ?? [] : paragraph.lines;
        const line = lines.find((line) => walkLine(line, (item) => item === node));
        const origin = line && this.hit.lineOrigin(line, pos.story, ctx, node.data.left);
        if (origin && line) {
          y = origin.y + (isVerticalTextStory(pos.story) ? node.data.left : line.beforeHeight + line.contentOffsetY);
        }
      }
      const page = y === undefined ? 0 : pageFor(y);
      const offsetY = y === undefined ? PAGE_INSET : offsetFor(y, page);
      const items = this.placements.get(page) ?? [];
      items.push({ comment, offsetY, anchored: y !== undefined });
      this.placements.set(page, items);
    }
    if (this.draft) {
      const y = this.hit.caretBox(this.draft.anchor, ctx)?.y;
      const page = y === undefined ? Math.min(previousDraftPage, ctx.origins.length - 1) : pageFor(y);
      this.draftPage = page;
      const items = this.placements.get(page) ?? [];
      items.push({ form: this.draft.form, offsetY: y === undefined ? PAGE_INSET : offsetFor(y, page) });
      this.placements.set(page, items);
    }
    for (const list of this.placements.values()) list.sort((a, b) => a.offsetY - b.offsetY);

    function pageFor(y: number): number {
      return Math.max(0, Math.min(ctx.origins.length - 1, Math.floor((y - ctx.origins[0].y) / stride)));
    }

    function offsetFor(y: number, page: number): number {
      return Math.max(0, Math.min(ctx.pageSetup.height, y - ctx.origins[page].y));
    }
  }

  private makePage(index: number, items: PageComment[], width: number, height: number, zoom: number): RenderedPage {
    const el = document.createElement("section");
    el.className = "ho-word-comment-page";
    el.dataset.commentPage = String(index + 1);
    el.setAttribute("aria-label", `第 ${index + 1} 页批注`);
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    const cards = items.map((item) => {
      if ("form" in item) {
        el.append(item.form);
        return item.form;
      }
      const { comment, anchored } = item;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ho-word-comment-card";
      card.dataset.marginComment = comment.id;
      card.disabled = !anchored;
      const author = document.createElement("span");
      author.className = "ho-word-comment-author";
      author.textContent = anchored ? (comment.author || "批注") : `${comment.author || "批注"} · 未定位`;
      const text = document.createElement("span");
      text.className = "ho-word-comment-content";
      text.textContent = comment.text;
      card.append(author, text);
      el.append(card);
      return card;
    });
    return { el, cards, items, width, height, zoom };
  }

  private positionCards(page: RenderedPage): void {
    const measure = () => page.cards.map((card) => card.offsetHeight || 60);
    let heights = measure();
    const gap = CARD_GAP;
    const bottom = page.height - PAGE_INSET;
    const packedHeight = heights.reduce((sum, height) => sum + height, 0) + gap * (heights.length - 1);
    const overflow = packedHeight > bottom - PAGE_INSET;
    page.el.classList.toggle("is-overflowing", overflow);
    if (overflow) heights = measure();
    const positions: number[] = [];
    let top = PAGE_INSET;
    for (let i = 0; i < page.items.length; i += 1) {
      const target = overflow ? top : Math.max(top, Math.round(page.items[i].offsetY * page.zoom));
      positions.push(target);
      top = target + heights[i] + gap;
    }
    if (!overflow) {
      let limit = bottom;
      for (let i = positions.length - 1; i >= 0; i -= 1) {
        positions[i] = Math.min(positions[i], limit - heights[i]);
        limit = positions[i] - gap;
      }
    }
    page.cards.forEach((card, i) => { card.style.top = `${positions[i]}px`; });
  }

  private syncActive(cards: HTMLElement[]): void {
    for (const card of cards) {
      if (!card.dataset.marginComment) continue;
      const selected = card.dataset.marginComment === this.active;
      card.classList.toggle("is-active", selected);
      if (selected) card.setAttribute("aria-current", "true");
      else card.removeAttribute("aria-current");
    }
  }
}

function walkLine(line: Line, visit: (node: LinkedNode<Word>) => boolean | void): boolean {
  let node = line.startNode;
  for (let i = 0; node && i < line.length; i += 1, node = node.next) {
    if (visit(node)) return true;
  }
  return false;
}
