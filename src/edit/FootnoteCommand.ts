import type { DocNote } from "../model/review/Review";
import { nextReviewId } from "../model/review/Review";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import type { MutationPatch } from "./MutationPatch";

const NOTE_STYLE = { color: "#1F4E79", fontSizePx: 11 };

export class FootnoteCommand implements EditCommand {
  private played = false;
  private story: StoryRef | null = null;
  private added?: DocNote;
  private patch?: MutationPatch;

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
    const id = nextReviewId(document.footnotes.map((note) => note.id));
    this.added = { id, text: body };
    document.footnotes.push(this.added);
    const label = String(document.footnotes.length);
    this.patch = this.ctx.mutator.insert(document, range.story, range.end, label, NOTE_STYLE);
    for (const node of this.patch.inserted) {
      if (node.data.block) {
        node.data.block.footnoteId = id;
      }
    }
    this.finish();
  }

  undo(): void {
    const document = this.story ? this.ctx.documentOf(this.story) : undefined;
    if (!document || !this.patch || !this.added) {
      return;
    }
    const impact = this.ctx.mutator.invert(document, this.patch);
    document.footnotes = document.footnotes.filter((note) => note.id !== this.added?.id);
    this.ctx.relayout.apply(impact);
    this.ctx.selection.collapse(this.patch.originalCaret);
    this.ctx.afterEdit(impact);
  }

  private replay(): void {
    const document = this.story ? this.ctx.documentOf(this.story) : undefined;
    if (!document || !this.patch || !this.added) {
      return;
    }
    if (!document.footnotes.some((note) => note.id === this.added?.id)) {
      document.footnotes.push(this.added);
    }
    this.ctx.mutator.replay(document, this.patch);
    this.finish();
  }

  private finish(): void {
    if (!this.patch) {
      return;
    }
    this.ctx.relayout.apply(this.patch.impact);
    this.ctx.selection.collapse(this.patch.caret);
    this.ctx.afterEdit(this.patch.impact);
  }
}
