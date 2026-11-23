import { CaretPos } from "../selection/CaretPos";
import { coverFlow } from "../selection/MainWalk";
import { SelRange } from "../selection/SelRange";
import type { EditContext } from "./EditContext";
import type { MutationPatch } from "./MutationPatch";
import { refreshNumbering } from "./OutlineNumbering";

/** 删掉阅读顺序上的这次选择，并停在起点。没有这种选择时返回 null。 */
export function consumeFlow(ctx: EditContext): MutationPatch[] | null {
  const flow = ctx.selection.flow;
  if (!flow || flow.anchor.equals(flow.focus)) {
    return null;
  }
  const owner = ctx.flowOwner?.(flow.anchor) ?? ctx.flowOwner?.(flow.focus);
  if (!owner) {
    return null;
  }
  const pieces = coverFlow(owner.document, owner.story, flow.anchor, flow.focus).pieces;
  if (!pieces.length) {
    return null;
  }
  const patches: MutationPatch[] = [];
  let caret = flow.anchor;
  for (const piece of [...pieces].reverse()) {
    const story = piece.type === "text" ? piece.range.story : piece.story;
    const document = ctx.documentOf(story);
    if (!document) {
      continue;
    }
    const range =
      piece.type === "text"
        ? piece.range
        : new SelRange(story, new CaretPos(story, piece.node, false), new CaretPos(story, piece.node, true));
    if (range.collapsed()) {
      continue;
    }
    const patch = ctx.mutator.deleteRange(document, story, range);
    patches.push(patch);
    refreshNumbering(document, patch);
    ctx.relayout.apply(patch.impact);
    caret = patch.caret;
  }
  ctx.selection.collapse(caret);
  const last = patches.at(-1);
  if (last) {
    ctx.afterEdit(last.impact);
  }
  return patches;
}
