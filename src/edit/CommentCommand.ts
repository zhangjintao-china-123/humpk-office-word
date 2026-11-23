import type { Block } from "../model/block/Block";
import type { Paragraph } from "../model/block/Paragraph";
import type { DocComment } from "../model/review/Review";
import { nextReviewId } from "../model/review/Review";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { CaretPos } from "../selection/CaretPos";
import type { StoryRef } from "../selection/StoryRef";
import type { SelRange } from "../selection/SelRange";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import type { MutationPatch } from "./MutationPatch";

const REF_STYLE = { color: "#C45911", fontSizePx: 11 };

export class CommentCommand implements EditCommand {
  private played = false;
  private story: StoryRef | null = null;
  private added?: DocComment;
  private patch?: MutationPatch;
  private marked?: { block: Block; commentIds?: string[]; background?: string };
  private snaps: { node: LinkedNode<Word>; before: Block | null; after: Block | null }[] = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly text: string,
  ) {}

  do(): void {
    if (this.played) {
      this.replay();
      return;
    }
    this.played = true;
    const body = this.text.trim();
    const range = this.ctx.selection.primaryRange()?.normalized();
    if (!body || !range) {
      return;
    }
    const document = this.ctx.documentOf(range.story);
    if (!document) {
      return;
    }
    this.story = range.story;
    const id = nextReviewId(document.comments.map((comment) => comment.id));
    const author = document.props.creator || "我";
    this.added = {
      id,
      author,
      date: new Date().toISOString(),
      initials: author.slice(0, 1),
      text: body,
    };
    document.comments.push(this.added);
    if (range.collapsed()) {
      this.markCaret(range.start, id);
    } else {
      const before = this.ctx.mutator.applyComment(document, range, id);
      this.snaps = before.map((item) => ({ node: item.node, before: item.block, after: item.node.data.block }));
    }
    const label = String(document.comments.length);
    this.patch = this.ctx.mutator.insert(document, range.story, referencePos(range), label, REF_STYLE);
    for (const node of this.patch.inserted) {
      if (node.data.block) {
        node.data.block.commentRef = id;
      }
    }
    const dirty = new Set<Paragraph>(this.patch.impact.dirty);
    for (const snap of this.snaps) {
      const paragraph = snap.node.data.paragraph;
      if (paragraph) {
        dirty.add(paragraph);
      }
    }
    this.finish(new EditImpact(range.story, [...dirty], this.patch.impact.structure), this.patch.caret);
  }

  undo(): void {
    const document = this.story ? this.ctx.documentOf(this.story) : undefined;
    if (!document || !this.added) {
      return;
    }
    if (this.patch) {
      this.ctx.mutator.invert(document, this.patch);
    }
    if (this.marked) {
      this.marked.block.commentIds = this.marked.commentIds;
      this.marked.block.style = { ...this.marked.block.style, backgroundColor: this.marked.background };
    }
    if (this.snaps.length && this.story) {
      this.ctx.mutator.restoreRunStyle(
        document,
        this.snaps.map((item) => ({ node: item.node, block: item.before })),
      );
    }
    document.comments = document.comments.filter((comment) => comment.id !== this.added?.id);
    const impact = new EditImpact(this.story ?? { slot: "body" }, this.patch?.impact.dirty ?? []);
    this.ctx.relayout.apply(impact);
    if (this.patch) {
      this.ctx.selection.collapse(this.patch.originalCaret);
    }
    this.ctx.afterEdit(impact);
  }

  private replay(): void {
    const document = this.story ? this.ctx.documentOf(this.story) : undefined;
    if (!document || !this.added) {
      return;
    }
    if (!document.comments.some((comment) => comment.id === this.added?.id)) {
      document.comments.push(this.added);
    }
    if (this.snaps.length) {
      this.ctx.mutator.restoreRunStyle(
        document,
        this.snaps.map((item) => ({ node: item.node, block: item.after })),
      );
    }
    if (this.marked) {
      const ids = [...(this.marked.commentIds ?? [])];
      if (!ids.includes(this.added.id)) {
        ids.push(this.added.id);
      }
      this.marked.block.commentIds = ids;
      if (!this.marked.background) {
        this.marked.block.style = { ...this.marked.block.style, backgroundColor: "#FFF2CC" };
      }
    }
    if (this.patch) {
      this.ctx.mutator.replay(document, this.patch);
      this.finish(this.patch.impact, this.patch.caret);
    }
  }

  private markCaret(pos: CaretPos, id: string): void {
    const node = pos.after ? pos.node : (pos.node?.pre ?? pos.node);
    const block = node?.data.block;
    if (!block || node?.data.isEnterChar() || !block.text) {
      return;
    }
    this.marked = { block, commentIds: block.commentIds?.slice(), background: block.style.backgroundColor };
    const ids = [...(block.commentIds ?? [])];
    if (!ids.includes(id)) {
      ids.push(id);
    }
    block.commentIds = ids;
    if (!block.style.backgroundColor) {
      block.style = { ...block.style, backgroundColor: "#FFF2CC" };
    }
  }

  private finish(impact: EditImpact, caret: CaretPos): void {
    this.ctx.relayout.apply(impact);
    this.ctx.selection.collapse(caret);
    this.ctx.afterEdit(impact);
  }
}

function referencePos(range: SelRange): CaretPos {
  const end = range.end;
  if (end.node?.data.isEnterChar() && end.after) {
    return new CaretPos(range.story, end.node, false);
  }
  return end;
}
