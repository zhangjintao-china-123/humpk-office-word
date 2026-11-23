import type { Block } from "../model/block/Block";
import type { Paragraph } from "../model/block/Paragraph";
import type { RevisionMark } from "../model/review/Review";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
import type { RunStyle } from "../model/style/RunStyle";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import type { MutationPatch } from "./MutationPatch";

type ReviewAction = "accept" | "reject";

interface KeptMark {
  block: Block;
  revision: RevisionMark;
  style: RunStyle;
}

export class RevisionCommand implements EditCommand {
  private played = false;
  private story: StoryRef | null = null;
  private kept: KeptMark[] = [];
  private patches: MutationPatch[] = [];
  private caret?: CaretPos;

  constructor(
    private readonly ctx: EditContext,
    private readonly action: ReviewAction,
  ) {}

  do(): void {
    if (this.played) {
      this.replay();
      return;
    }
    this.played = true;
    const range = this.ctx.selection.primaryRange()?.normalized();
    if (!range) {
      return;
    }
    const document = this.ctx.documentOf(range.story);
    if (!document) {
      return;
    }
    const dropKind = this.action === "accept" ? "del" : "ins";
    const clearKind = this.action === "accept" ? "ins" : "del";
    const words = range.collapsed() ? caretWords(range.start) : wordsBetween(range);
    const dropping = words.filter((node) => node.data.block?.revision?.kind === dropKind && !node.data.isEnterChar());
    const dropBlocks = new Set(dropping.map((node) => node.data.block));
    const seen = new Set<Block>();
    for (const node of words) {
      const block = node.data.block;
      if (!block?.revision || block.revision.kind !== clearKind || dropBlocks.has(block) || seen.has(block)) {
        continue;
      }
      seen.add(block);
      this.kept.push({ block, revision: { ...block.revision }, style: { ...block.style } });
      block.revision = undefined;
      block.style = clearedStyle(block.style, clearKind);
    }
    this.story = range.story;
    for (let index = dropping.length - 1; index >= 0; index -= 1) {
      const node = dropping[index];
      const target = new SelRange(range.story, new CaretPos(range.story, node, false), new CaretPos(range.story, node, true));
      this.patches.push(this.ctx.mutator.deleteRange(document, range.story, target));
    }
    if (!this.kept.length && !this.patches.length) {
      return;
    }
    this.caret = this.patches.length ? this.patches[this.patches.length - 1].caret : range.start;
    this.finish();
  }

  undo(): void {
    const document = this.story ? this.ctx.documentOf(this.story) : undefined;
    if (!document) {
      return;
    }
    for (let index = this.patches.length - 1; index >= 0; index -= 1) {
      this.ctx.mutator.invert(document, this.patches[index]);
    }
    for (const item of this.kept) {
      item.block.revision = item.revision;
      item.block.style = { ...item.style };
    }
    const impact = this.impact();
    this.ctx.relayout.apply(impact);
    if (this.patches[0]) {
      this.ctx.selection.collapse(this.patches[0].originalCaret);
    }
    this.ctx.afterEdit(impact);
  }

  private replay(): void {
    const document = this.story ? this.ctx.documentOf(this.story) : undefined;
    if (!document) {
      return;
    }
    for (const item of this.kept) {
      item.block.revision = undefined;
      item.block.style = clearedStyle(item.style, item.revision.kind);
    }
    for (const patch of this.patches) {
      this.ctx.mutator.replay(document, patch);
    }
    this.finish();
  }

  private finish(): void {
    const impact = this.impact();
    this.ctx.relayout.apply(impact);
    if (this.caret) {
      this.ctx.selection.collapse(this.caret);
    }
    this.ctx.afterEdit(impact);
  }

  private impact(): EditImpact {
    const dirty: Paragraph[] = [];
    const add = (paragraph: Paragraph | null | undefined): void => {
      if (paragraph && !dirty.includes(paragraph)) {
        dirty.push(paragraph);
      }
    };
    for (const patch of this.patches) {
      for (const paragraph of patch.impact.dirty) {
        add(paragraph);
      }
    }
    return new EditImpact(this.story ?? { slot: "body" }, dirty);
  }
}

function clearedStyle(style: RunStyle, kind: "ins" | "del"): RunStyle {
  const next = { ...style };
  if (kind === "ins" && next.color === "#2E75B6") {
    delete next.color;
    if (next.underline === "single") {
      delete next.underline;
    }
  }
  if (kind === "del" && next.color === "#C00000") {
    delete next.color;
    if (next.strike === "single") {
      delete next.strike;
    }
  }
  return next;
}

function caretWords(pos: CaretPos): LinkedNode<Word>[] {
  const node = pos.after ? pos.node : (pos.node?.pre ?? pos.node);
  return node ? [node] : [];
}

function wordsBetween(range: SelRange): LinkedNode<Word>[] {
  const from = range.start.after ? (range.start.node?.next ?? null) : range.start.node;
  const to = range.end.after ? range.end.node : (range.end.node?.pre ?? null);
  const nodes: LinkedNode<Word>[] = [];
  let node = from;
  while (node) {
    nodes.push(node);
    if (node === to) {
      break;
    }
    node = node.next;
  }
  return nodes;
}
