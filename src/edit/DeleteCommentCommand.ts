import type { Block } from "../model/block/Block";
import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import type { Word } from "../model/inline/Word";
import type { LinkedNode } from "../model/list/LinkedList";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import type { Selection } from "../selection/Selection";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import type { StorySource } from "./Find";
import type { MutationPatch } from "./MutationPatch";

interface ReferenceLabel {
  node: LinkedNode<Word>;
  before: string;
  after: string;
}

interface CommentChanges extends StorySource {
  marks: Map<Block, string[]>;
  labels: ReferenceLabel[];
  removed: MutationPatch[];
  dirty: Set<Paragraph>;
}

export class DeleteCommentCommand implements EditCommand {
  private readonly changes: CommentChanges[] = [];
  private readonly original: Pick<Selection, "ranges" | "primary" | "flow">;
  private readonly comments: Document["comments"];
  private readonly remaining: Document["comments"];
  private applied = false;
  private caret: CaretPos | undefined;

  constructor(
    private readonly ctx: EditContext,
    private readonly model: Document,
    private readonly stories: StorySource[],
    private readonly id: string,
    anchor: CaretPos | undefined,
  ) {
    const { ranges, primary, flow } = ctx.selection;
    this.original = { ranges: ranges.slice(), primary, flow };
    this.comments = model.comments.slice();
    this.remaining = this.comments.filter((comment) => comment.id !== id);
    this.caret = anchor ?? ctx.selection.caret();
  }

  do(): void {
    this.model.comments = this.remaining.slice();
    if (this.applied) {
      for (const change of this.changes) {
        this.clearMarks(change);
        for (const patch of change.removed) this.ctx.mutator.replay(change.document, patch);
        this.restoreLabels(change, "after");
      }
    } else {
      this.applied = true;
      const numbers = new Map(this.remaining.map((comment, index) => [comment.id, String(index + 1)]));
      for (const source of this.stories) this.removeInStory(source, numbers);
    }
    if (this.caret) this.ctx.selection.collapse(this.caret);
    this.finish();
  }

  undo(): void {
    this.model.comments = this.comments.slice();
    for (const change of this.changes) {
      for (const patch of [...change.removed].reverse()) this.ctx.mutator.invert(change.document, patch);
      for (const [block, ids] of change.marks) block.commentIds = ids;
      this.restoreLabels(change, "before");
    }
    Object.assign(this.ctx.selection, this.original);
    this.finish();
  }

  private removeInStory(source: StorySource, numbers: ReadonlyMap<string, string>): void {
    const change: CommentChanges = { ...source, marks: new Map(), labels: [], removed: [], dirty: new Set() };
    const { document, story, marks, dirty, labels } = change;
    document.paragraphs.each(({ data: paragraph }) => {
      for (const block of paragraph.blocks) {
        if (block.commentIds?.includes(this.id)) {
          marks.set(block, block.commentIds);
          dirty.add(paragraph);
        }
      }
    });
    this.clearMarks(change);
    for (let node = document.words.tail; node;) {
      const previous = node.pre;
      const id = node.data.block?.commentRef;
      const paragraph = node.data.paragraph;
      if (id && paragraph && !node.data.isEnterChar()) {
        if (id === this.id) {
          const range = new SelRange(story, new CaretPos(story, node), new CaretPos(story, node, true));
          const patch = this.ctx.mutator.deleteRange(document, story, range);
          change.removed.push(patch);
          dirty.add(paragraph);
          if (this.caret?.node === node) this.caret = patch.caret;
        } else {
          const after = numbers.get(id);
          if (after && after !== node.data.char) {
            labels.push({ node, before: node.data.char, after });
            dirty.add(paragraph);
          }
        }
      }
      node = previous;
    }
    this.restoreLabels(change, "after");
    if (dirty.size) this.changes.push(change);
  }

  private clearMarks(change: CommentChanges): void {
    for (const [block, ids] of change.marks) {
      const keep = ids.filter((id) => id !== this.id);
      block.commentIds = keep.length ? keep : undefined;
    }
  }

  private restoreLabels(change: CommentChanges, version: "before" | "after"): void {
    for (const label of change.labels) {
      const word = label.node.data;
      const text = label[version];
      word.char = text;
      word.intChar = text.charCodeAt(0);
      if (word.block) word.block.text = text;
    }
  }

  private finish(): void {
    const impacts = this.changes.map(({ story, dirty }) => new EditImpact(story, [...dirty]));
    for (const impact of impacts) this.ctx.relayout.apply(impact);
    if (!impacts.length) impacts.push(new EditImpact({ slot: "body" }, []));
    for (const impact of impacts) this.ctx.afterEdit(impact);
  }
}
