import { SelectionText } from "../selection/SelectionText";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import type { MutationPatch } from "./MutationPatch";
import type { SelRange } from "../selection/SelRange";

export type DeleteDirection = "backward" | "forward";

export class DeleteCommand implements EditCommand {
  private patches: MutationPatch[] = [];
  private played = false;

  constructor(
    private readonly ctx: EditContext,
    private readonly direction: DeleteDirection,
  ) {}

  do(): void {
    if (this.played) {
      for (const patch of this.patches) {
        const document = this.ctx.documentOf(patch.story);
        if (document) {
          this.ctx.mutator.replay(document, patch);
          this.ctx.relayout.apply(patch.impact);
        }
      }
      const last = this.patches.at(-1);
      if (last) {
        this.ctx.selection.collapse(last.caret);
        this.ctx.afterEdit(last.impact);
      }
      return;
    }
    this.played = true;
    const selectionText = new SelectionText();
    for (const raw of this.ctx.selection.normalized()) {
      const range = this.asTextRange(raw, selectionText);
      const document = this.ctx.documentOf(range.story);
      if (!document) {
        continue;
      }
      const patch = range.collapsed()
        ? this.direction === "backward"
          ? this.ctx.mutator.deleteBackward(document, range.story, range.start)
          : this.ctx.mutator.deleteForward(document, range.story, range.start)
        : this.ctx.mutator.deleteRange(document, range.story, range);
      this.patches.push(patch);
      this.ctx.relayout.apply(patch.impact);
      this.ctx.selection.collapse(patch.caret);
      this.ctx.afterEdit(patch.impact);
    }
  }

  undo(): void {
    for (const patch of [...this.patches].reverse()) {
      const document = this.ctx.documentOf(patch.story);
      if (!document) {
        continue;
      }
      const impact = this.ctx.mutator.invert(document, patch);
      this.ctx.relayout.apply(impact);
      this.ctx.selection.collapse(patch.originalCaret);
      this.ctx.afterEdit(impact);
    }
  }

  private asTextRange(range: SelRange, selectionText: SelectionText): SelRange {
    if (range.mode !== "cell" || range.story.slot !== "cell") {
      return range;
    }
    return selectionText.cellContentRange(range.story.cell);
  }
}
