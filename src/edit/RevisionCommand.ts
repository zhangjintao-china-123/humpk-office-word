import type { Block } from "../model/block/Block";
import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import type { RevisionMark } from "../model/review/Review";
import type { CaretPos } from "../selection/CaretPos";
import type { Selection } from "../selection/Selection";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import type { MutationPatch } from "./MutationPatch";
import { revisionOf, selectedRevisions } from "./ReviewNavigation";

type ReviewAction = "accept" | "reject";

interface RevisionChanges {
  document: Document;
  story: StoryRef;
  cleared: Map<Block, RevisionMark>;
  removed: MutationPatch[];
  dirty: Set<Paragraph>;
}

export class RevisionCommand implements EditCommand {
  private readonly changes = new Map<Document, RevisionChanges>();
  private originalSelection?: Pick<Selection, "ranges" | "primary" | "flow">;
  private caret?: CaretPos;

  constructor(
    private readonly ctx: EditContext,
    private readonly action: ReviewAction,
    private readonly targets = selectedRevisions(ctx),
  ) {}

  do(): void {
    if (this.originalSelection) {
      for (const change of this.changes.values()) {
        for (const block of change.cleared.keys()) block.revision = undefined;
        for (const patch of change.removed) this.ctx.mutator.replay(change.document, patch);
      }
    } else {
      const { ranges, primary, flow } = this.ctx.selection;
      this.originalSelection = { ranges: ranges.slice(), primary, flow };
      const drop = this.action === "accept" ? "del" : "ins";
      for (const range of [...this.targets].reverse()) {
        const first = range.start.node;
        const mark = revisionOf(first);
        const document = this.ctx.documentOf(range.story);
        if (!first || !mark || !document) continue;

        let change = this.changes.get(document);
        if (!change) {
          change = { document, story: range.story, cleared: new Map(), removed: [], dirty: new Set() };
          this.changes.set(document, change);
        }
        if (mark.kind === drop) {
          const patch = this.ctx.mutator.deleteRange(document, range.story, range);
          change.removed.push(patch);
          for (const paragraph of patch.impact.dirty) change.dirty.add(paragraph);
          this.caret = patch.caret;
        } else {
          for (let node: typeof range.start.node = first; node; node = node.next) {
            const { block, paragraph } = node.data;
            if (block?.revision) {
              change.cleared.set(block, block.revision);
              block.revision = undefined;
            }
            if (paragraph) change.dirty.add(paragraph);
            if (node === range.end.node) break;
          }
          this.caret = range.start;
        }
      }
    }
    if (this.caret) this.ctx.selection.collapse(this.caret);
    this.finish();
  }

  undo(): void {
    for (const change of this.changes.values()) {
      for (const patch of [...change.removed].reverse()) this.ctx.mutator.invert(change.document, patch);
      for (const [block, revision] of change.cleared) block.revision = revision;
    }
    if (this.originalSelection) Object.assign(this.ctx.selection, this.originalSelection);
    this.finish();
  }

  private finish(): void {
    const impacts = [...this.changes.values()].map(({ story, dirty }) => new EditImpact(story, [...dirty]));
    for (const impact of impacts) this.ctx.relayout.apply(impact);
    for (const impact of impacts) this.ctx.afterEdit(impact);
  }
}
