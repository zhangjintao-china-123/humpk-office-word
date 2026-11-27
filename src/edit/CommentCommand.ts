import type { Block } from "../model/block/Block";
import type { Document } from "../model/document/Document";
import type { DocComment } from "../model/review/Review";
import { nextReviewId } from "../model/review/Review";
import { CaretPos } from "../selection/CaretPos";
import { cellsInReadingOrder, coverFlow } from "../selection/MainWalk";
import { SelRange } from "../selection/SelRange";
import type { Selection } from "../selection/Selection";
import { SelectionText } from "../selection/SelectionText";
import { storyEquals } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import type { MutationPatch } from "./MutationPatch";
import type { Mutator } from "./Mutator";

type RunSnapshot = ReturnType<Mutator["applyComment"]>[number];
type MarkedRange = { document: Document; edit: EditImpact; runs: (RunSnapshot & { after: Block | null })[] };

export class CommentCommand implements EditCommand {
  private readonly ranges: SelRange[];
  private readonly reviewDocument: Document | null;
  private readonly originalSelection: Pick<Selection, "ranges" | "primary" | "flow">;
  private readonly marked: MarkedRange[] = [];
  private added?: DocComment;
  private reference?: { document: Document; patch: MutationPatch };

  constructor(private readonly ctx: EditContext, private readonly text: string) {
    this.reviewDocument = ctx.documentOf({ slot: "body" });
    const { ranges, primary, flow } = ctx.selection;
    this.originalSelection = { ranges: ranges.slice(), primary, flow };
    this.ranges = selectedRanges(ctx);
  }

  canApply(): boolean {
    const last = this.ranges.at(-1);
    return !!(this.reviewDocument && this.text.trim() && last &&
      this.ctx.documentOf(last.story) && last.end.node?.data.kind !== "table");
  }

  do(): void {
    if (!this.reviewDocument || !this.canApply()) return;
    if (this.added && this.reference) {
      this.reviewDocument.comments.push(this.added);
      this.restoreMarks("after");
      this.ctx.mutator.replay(this.reference.document, this.reference.patch);
      this.finish(this.reference.patch.caret);
      return;
    }

    const document = this.reviewDocument;
    const id = nextReviewId(document.comments.map((comment) => comment.id));
    const author = document.props.creator || "我";
    let pos = this.ranges.at(-1)!.end;
    for (const range of this.ranges) {
      const storyDocument = this.ctx.documentOf(range.story);
      if (!storyDocument || range.collapsed()) continue;
      const runs = this.ctx.mutator.applyComment(storyDocument, range, id)
        .map((item) => ({ ...item, after: item.node.data.block }));
      if (!runs.length) continue;
      const dirty = new Set(runs.flatMap(({ node }) => node.data.paragraph ? [node.data.paragraph] : []));
      this.marked.push({ document: storyDocument, edit: new EditImpact(range.story, [...dirty]), runs });
      pos = new CaretPos(range.story, runs[runs.length - 1].node, true);
    }
    if (pos.after && pos.node?.data.isEnterChar()) pos = new CaretPos(pos.story, pos.node, false);
    const referenceDocument = this.ctx.documentOf(pos.story);
    if (!referenceDocument) return;
    const patch = this.ctx.mutator.insert(referenceDocument, pos.story, pos, String(document.comments.length + 1),
      { color: "#C45911", fontSizePx: 11 }, { commentRef: id });
    if (!patch.inserted.length) {
      this.restoreMarks("block");
      return;
    }
    this.reference = { document: referenceDocument, patch };
    this.added = { id, author, date: new Date().toISOString(), initials: author.slice(0, 1), text: this.text.trim() };
    document.comments.push(this.added);
    this.finish(patch.caret);
  }

  undo(): void {
    if (!this.reference || !this.added || !this.reviewDocument) return;
    this.ctx.mutator.invert(this.reference.document, this.reference.patch);
    this.restoreMarks("block");
    this.reviewDocument.comments = this.reviewDocument.comments.filter((comment) => comment.id !== this.added?.id);
    Object.assign(this.ctx.selection, this.originalSelection);
    this.finish();
  }

  private restoreMarks(side: "block" | "after"): void {
    const ranges = side === "block" ? this.marked.slice().reverse() : this.marked;
    for (const { document, runs } of ranges) {
      this.ctx.mutator.restoreRunStyle(document, runs.map((item) => ({ node: item.node, block: item[side] })));
    }
  }

  private finish(caret?: CaretPos): void {
    if (!this.reference) return;
    const { patch } = this.reference;
    const dirty = new Set(patch.impact.dirty);
    for (const { edit } of this.marked) {
      if (storyEquals(edit.story, patch.story)) {
        for (const paragraph of edit.dirty) dirty.add(paragraph);
      } else {
        this.ctx.relayout.apply(edit);
      }
    }
    const impact = new EditImpact(patch.story, [...dirty]);
    this.ctx.relayout.apply(impact);
    if (caret) this.ctx.selection.collapse(caret);
    this.ctx.afterEdit(impact);
  }
}

function selectedRanges(ctx: EditContext): SelRange[] {
  const text = new SelectionText();
  const flow = ctx.selection.flow;
  if (flow) {
    const { anchor, focus } = flow;
    const linear = storyEquals(anchor.story, focus.story) && anchor.node?.data.kind !== "table" && focus.node?.data.kind !== "table";
    if (linear && anchor.node?.data.paragraph === focus.node?.data.paragraph) {
      return [new SelRange(anchor.story, anchor, focus).normalized()];
    }
    const owner = ctx.flowOwner?.(anchor) ?? ctx.flowOwner?.(focus);
    if (!owner) return linear ? [new SelRange(anchor.story, anchor, focus).normalized()] : [];
    const cover = coverFlow(owner.document, owner.story, anchor, focus);
    return cover.pieces.flatMap((item) => {
      if (item.type === "text") return [item.range.normalized()];
      const table = item.node.data.table;
      return table ? cellsInReadingOrder(table).map((cell) => text.cellContentRange(cell)) : [];
    });
  }
  return ctx.selection.normalized().map((range) => range.mode === "cell" && range.story.slot === "cell"
    ? text.cellContentRange(range.story.cell)
    : range);
}
