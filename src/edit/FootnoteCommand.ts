import type { DocNote, NoteKind } from "../model/review/Review";
import { nextReviewId } from "../model/review/Review";
import type { StoryRef } from "../selection/StoryRef";
import { CaretPos } from "../selection/CaretPos";
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
    private readonly kind: NoteKind = "footnote",
  ) {}

  private get entries(): "footnotes" | "endnotes" {
    return this.kind === "footnote" ? "footnotes" : "endnotes";
  }

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
    const bodyDocument = this.ctx.documentOf({ slot: "body" });
    if (!document || !bodyDocument) {
      return;
    }
    this.story = range.story;
    const notes = bodyDocument[this.entries];
    const id = nextReviewId(notes.map((note) => note.id));
    const label = String(notes.length + 1);
    const mark = this.kind === "footnote" ? { footnoteId: id } : { endnoteId: id };
    const at = range.end.after && range.end.node?.data.isEnterChar()
      ? new CaretPos(range.story, range.end.node) : range.end;
    this.patch = this.ctx.mutator.insert(document, range.story, at, label, NOTE_STYLE, mark);
    if (!this.patch.inserted.length) return;
    this.added = { id, text: body };
    notes.push(this.added);
    this.finish();
  }

  undo(): void {
    const document = this.story ? this.ctx.documentOf(this.story) : undefined;
    const body = this.ctx.documentOf({ slot: "body" });
    if (!document || !body || !this.patch || !this.added) {
      return;
    }
    const impact = this.ctx.mutator.invert(document, this.patch);
    body[this.entries] = body[this.entries].filter((note) => note.id !== this.added?.id);
    this.ctx.relayout.apply(impact);
    this.ctx.selection.collapse(this.patch.originalCaret);
    this.ctx.afterEdit(impact);
  }

  private replay(): void {
    const document = this.story ? this.ctx.documentOf(this.story) : undefined;
    const body = this.ctx.documentOf({ slot: "body" });
    if (!document || !body || !this.patch || !this.added) {
      return;
    }
    if (!body[this.entries].some((note) => note.id === this.added?.id)) {
      body[this.entries].push(this.added);
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
