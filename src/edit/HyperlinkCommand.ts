import type { Block } from "../model/block/Block";
import type { Paragraph } from "../model/block/Paragraph";
import type { TextLink } from "../model/field/TextLink";
import { linkLabel } from "../model/field/TextLink";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { CaretPos } from "../selection/CaretPos";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import type { MutationPatch } from "./MutationPatch";

const LINK_STYLE = { color: "#0563C1", underline: "single" as const };

export class HyperlinkCommand implements EditCommand {
  private played = false;
  private story: StoryRef | null = null;
  private patch?: MutationPatch;
  private cleared?: { block: Block; link: TextLink };
  private snaps: { node: LinkedNode<Word>; before: Block | null; after: Block | null }[] = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly link: TextLink | undefined,
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
    this.story = range.story;
    if (range.collapsed()) {
      if (!this.link) {
        this.clearCaretLink(range.start);
        return;
      }
      const text = linkLabel(this.link);
      if (!text) {
        return;
      }
      this.patch = this.ctx.mutator.insert(document, range.story, range.start, text, LINK_STYLE);
      for (const node of this.patch.inserted) {
        if (node.data.block) {
          node.data.block.link = { ...this.link };
        }
      }
      this.finish(this.patch.impact, this.patch.caret);
      return;
    }
    const before = this.ctx.mutator.applyLink(document, range, this.link);
    this.snaps = before.map((item) => ({
      node: item.node,
      before: item.block,
      after: item.node.data.block,
    }));
    const dirty = paragraphsOf(this.snaps);
    const impact = new EditImpact(range.story, dirty);
    this.finish(impact, range.end);
  }

  undo(): void {
    if (this.cleared) {
      this.cleared.block.link = this.cleared.link;
      this.ctx.afterEdit(new EditImpact(this.story ?? { slot: "body" }, []));
      return;
    }
    if (this.patch) {
      const document = this.ctx.documentOf(this.patch.story);
      if (!document) {
        return;
      }
      const impact = this.ctx.mutator.invert(document, this.patch);
      this.ctx.relayout.apply(impact);
      this.ctx.selection.collapse(this.patch.originalCaret);
      this.ctx.afterEdit(impact);
      return;
    }
    this.restore("before");
  }

  private replay(): void {
    if (this.cleared) {
      this.cleared.block.link = undefined;
      this.ctx.afterEdit(new EditImpact(this.story ?? { slot: "body" }, []));
      return;
    }
    if (this.patch) {
      const document = this.ctx.documentOf(this.patch.story);
      if (!document) {
        return;
      }
      this.ctx.mutator.replay(document, this.patch);
      this.finish(this.patch.impact, this.patch.caret);
      return;
    }
    this.restore("after");
  }

  private restore(side: "before" | "after"): void {
    if (!this.snaps.length || !this.story) {
      return;
    }
    const document = this.ctx.documentOf(this.story);
    if (!document) {
      return;
    }
    const dirty = this.ctx.mutator.restoreRunStyle(
      document,
      this.snaps.map((item) => ({ node: item.node, block: item[side] })),
    );
    const impact = new EditImpact(this.story, dirty);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }

  private clearCaretLink(pos: CaretPos): void {
    const node = pos.after ? pos.node : (pos.node?.pre ?? pos.node);
    const block = node?.data.block;
    if (!block?.link) {
      return;
    }
    this.cleared = { block, link: block.link };
    block.link = undefined;
    this.ctx.afterEdit(new EditImpact(this.story ?? pos.story, []));
  }

  private finish(impact: EditImpact, caret: CaretPos): void {
    this.ctx.relayout.apply(impact);
    this.ctx.selection.collapse(caret);
    this.ctx.afterEdit(impact);
  }
}

function paragraphsOf(snaps: { node: LinkedNode<Word> }[]): Paragraph[] {
  const dirty: Paragraph[] = [];
  for (const snap of snaps) {
    const paragraph = snap.node.data.paragraph;
    if (paragraph && !dirty.includes(paragraph)) {
      dirty.push(paragraph);
    }
  }
  return dirty;
}
