import type { Document } from "../model/document/Document";
import type { RunStyle } from "../model/style/RunStyle";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import { storyEquals } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import type { FindHit } from "./Find";
import type { MutationPatch } from "./MutationPatch";
import { refreshNumbering, renumberStory, restoreNumbering } from "./OutlineNumbering";

/** 一次替换一批命中，撤销时整批还原。从后往前改，避免前面的字节点失效。 */
export class ReplaceCommand implements EditCommand {
  private patches: MutationPatch[] = [];
  private played = false;

  constructor(
    private readonly ctx: EditContext,
    private readonly hits: FindHit[],
    private readonly replacement: string,
  ) {}

  do(): void {
    if (this.played) {
      for (const patch of this.patches) {
        const document = this.ctx.documentOf(patch.story);
        if (!document) {
          continue;
        }
        this.ctx.mutator.replay(document, patch);
        renumberStory(document);
        this.ctx.relayout.apply(patch.impact);
      }
      const last = this.patches.at(-1);
      if (last) {
        this.ctx.selection.collapse(last.caret);
        this.ctx.afterEdit(last.impact);
      }
      return;
    }
    this.played = true;
    let last: MutationPatch | undefined;
    for (const group of this.groups()) {
      const story = group[0].story;
      const document = this.ctx.documentOf(story);
      if (!document) {
        continue;
      }
      for (const hit of [...group].reverse()) {
        last = this.replaceHit(document, hit) ?? last;
      }
    }
    if (last) {
      this.ctx.selection.collapse(last.caret);
      this.ctx.afterEdit(last.impact);
    }
  }

  undo(): void {
    for (const patch of [...this.patches].reverse()) {
      const document = this.ctx.documentOf(patch.story);
      if (!document) {
        continue;
      }
      restoreNumbering(patch.numberingBefore);
      const impact = this.ctx.mutator.invert(document, patch);
      this.ctx.relayout.apply(impact);
      this.ctx.selection.collapse(patch.originalCaret);
      this.ctx.afterEdit(impact);
    }
  }

  private replaceHit(document: Document, hit: FindHit): MutationPatch | undefined {
    const style = hit.start.data.getStyle();
    const range = new SelRange(
      hit.story,
      new CaretPos(hit.story, hit.start, false),
      new CaretPos(hit.story, hit.end, true),
    );
    const deleted = this.ctx.mutator.deleteRange(document, hit.story, range);
    if (!deleted.removed.length && !deleted.inserted.length) {
      return undefined;
    }
    this.apply(document, deleted);
    if (!this.replacement) {
      return deleted;
    }
    const inserted = this.ctx.mutator.insert(document, hit.story, deleted.caret, this.replacement, copyStyle(style));
    this.apply(document, inserted);
    return inserted;
  }

  private apply(document: Document, patch: MutationPatch): void {
    this.patches.push(patch);
    refreshNumbering(document, patch);
    this.ctx.relayout.apply(patch.impact);
  }

  private groups(): FindHit[][] {
    const groups: FindHit[][] = [];
    for (const hit of this.hits) {
      const last = groups.at(-1);
      if (last && storyEquals(last[0].story, hit.story)) {
        last.push(hit);
      } else {
        groups.push([hit]);
      }
    }
    return groups;
  }
}

function copyStyle(style: RunStyle | undefined): RunStyle | undefined {
  return style ? { ...style } : undefined;
}
