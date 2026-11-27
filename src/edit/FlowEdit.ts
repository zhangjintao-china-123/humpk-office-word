import { CaretPos } from "../selection/CaretPos";
import { cellsInReadingOrder, coverFlow } from "../selection/MainWalk";
import { SelRange } from "../selection/SelRange";
import { SelectionText } from "../selection/SelectionText";
import type { Table } from "../model/table/Table";
import type { EditContext } from "./EditContext";
import type { MutationPatch } from "./MutationPatch";
import { refreshNumbering } from "./OutlineNumbering";
import type { RevisionMark } from "../model/review/Review";

/** 删掉阅读顺序上的这次选择，并停在起点。没有这种选择时返回 null。 */
export function consumeFlow(ctx: EditContext, revision?: RevisionMark): MutationPatch[] | null {
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
  const selectionText = new SelectionText();
  const tableRanges = (table: Table): SelRange[] => cellsInReadingOrder(table).flatMap((cell) => [
    selectionText.cellContentRange(cell),
    ...cell.document.paragraphs.toArray().flatMap((paragraph) => paragraph.table ? tableRanges(paragraph.table) : []),
  ]);
  const ranges = pieces.flatMap((piece) => {
    if (piece.type === "text") return [piece.range];
    if (revision && piece.node.data.table) return tableRanges(piece.node.data.table);
    return [new SelRange(piece.story, new CaretPos(piece.story, piece.node), new CaretPos(piece.story, piece.node, true))];
  });
  const patches: MutationPatch[] = [];
  let caret = flow.anchor;
  for (const range of ranges.reverse()) {
    const story = range.story;
    const document = ctx.documentOf(story);
    if (!document) {
      continue;
    }
    if (range.collapsed()) {
      continue;
    }
    const patch = ctx.mutator.deleteRange(document, story, range, revision);
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
