import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { sameRevision } from "../model/review/Review";
import { CaretPos } from "../selection/CaretPos";
import { cellsInReadingOrder, coverFlow, formatRanges } from "../selection/MainWalk";
import { SelRange } from "../selection/SelRange";
import { SelectionText } from "../selection/SelectionText";
import { storyEquals } from "../selection/StoryRef";
import type { EditContext } from "./EditContext";
import type { StorySource } from "./Find";

export type ReviewDirection = -1 | 1;

type WordNode = LinkedNode<Word>;

export function revisionOf(node: WordNode | null | undefined) {
  const word = node?.data;
  return word?.kind === "text" && !word.isEnterChar() && !word.block?.commentRef
    ? word.block?.revision
    : undefined;
}

export function revisionRange(pos: CaretPos): SelRange | undefined {
  const node = pos.node;
  if (!node) return undefined;
  const neighbor = pos.after ? node.next : node.pre;
  const start = revisionOf(node) ? node : revisionOf(neighbor) ? neighbor : null;
  if (!start) return undefined;
  const mark = revisionOf(start);
  let first = start;
  let last = start;
  while (first.pre && sameRevision(mark, revisionOf(first.pre))) first = first.pre;
  while (last.next && sameRevision(mark, revisionOf(last.next))) last = last.next;
  return new SelRange(pos.story, new CaretPos(pos.story, first), new CaretPos(pos.story, last, true));
}

/** 顺着字流经过表格和文本框，使跳转顺序与阅读顺序一致。 */
function* reviewWords(roots: StorySource[]): Generator<CaretPos> {
  const seen = new Set<StorySource["document"]>();
  function* visit({ document, story }: StorySource): Generator<CaretPos> {
    if (seen.has(document)) return;
    seen.add(document);
    for (let node = document.words.head; node; node = node.next) {
      yield new CaretPos(story, node);
      if (node.data.table) {
        for (const cell of cellsInReadingOrder(node.data.table)) {
          yield* visit({ document: cell.document, story: { slot: "cell", cell } });
        }
      }
      if (!node.next || node.next.data.paragraph !== node.data.paragraph) {
        for (const block of node.data.paragraph?.blocks ?? []) {
          if (block.drawing?.shape?.text) {
            yield* visit({ document: block.drawing.shape.text, story: { slot: "textbox", block } });
          }
        }
      }
    }
  }
  for (const root of roots) yield* visit(root);
}

function adjacent<T>(
  roots: StorySource[],
  caret: CaretPos | undefined,
  direction: ReviewDirection,
  at: (pos: CaretPos) => readonly T[],
  current?: T,
): { value: T; pos: CaretPos } | undefined {
  const targets: { value: T; pos: CaretPos; rank: number }[] = [];
  let rank = 0;
  let caretRank: number | undefined;
  for (const pos of reviewWords(roots)) {
    if (caret && caret.node === pos.node && storyEquals(caret.story, pos.story)) {
      caretRank = rank + Number(caret.after);
    }
    for (const value of at(pos)) targets.push({ value, pos, rank });
    rank += 2;
  }
  if (!targets.length) return undefined;
  const index = targets.findIndex(({ value }) => value === current);
  if (index >= 0) return targets[(index + direction + targets.length) % targets.length];
  const ordered = direction === 1 ? targets : targets.reverse();
  return ordered.find((item) => caretRank === undefined || (item.rank - caretRank) * direction >= 0) ?? ordered[0];
}

export function adjacentComment(
  roots: StorySource[],
  caret: CaretPos | undefined,
  direction: ReviewDirection,
  anchors: ReadonlyMap<string, CaretPos>,
  current?: string,
): string | undefined {
  const byNode = new Map<WordNode, string[]>();
  for (const [id, pos] of anchors) {
    if (!pos.node) continue;
    const ids = byNode.get(pos.node) ?? [];
    ids.push(id);
    byNode.set(pos.node, ids);
  }
  return adjacent(roots, caret, direction, (pos) => byNode.get(pos.node!) ?? [], current)?.value;
}

export function adjacentRevision(
  roots: StorySource[],
  caret: CaretPos | undefined,
  direction: ReviewDirection,
  fromSelection: boolean,
): SelRange | undefined {
  const current = fromSelection && caret ? revisionRange(caret)?.start.node : undefined;
  const target = adjacent(roots, caret, direction, (pos) =>
    revisionOf(pos.node) && !sameRevision(revisionOf(pos.node?.pre), revisionOf(pos.node)) ? [pos.node] : [],
  current);
  return target && revisionRange(target.pos);
}

/** 会触及的完整修订，每个连续修订只处理一次。 */
export function selectedRevisions(ctx: EditContext): SelRange[] {
  const selection = ctx.selection;
  const flow = selection.flow;
  let ranges = selection.normalized();
  if (flow) {
    const { anchor, focus } = flow;
    if (storyEquals(anchor.story, focus.story) && anchor.node?.data.paragraph === focus.node?.data.paragraph &&
      anchor.node?.data.kind !== "table" && focus.node?.data.kind !== "table") {
      ranges = [new SelRange(anchor.story, anchor, focus).normalized()];
    } else {
      const owner = ctx.flowOwner?.(anchor) ?? ctx.flowOwner?.(focus);
      if (owner) ranges = formatRanges(coverFlow(owner.document, owner.story, anchor, focus));
      else if (storyEquals(anchor.story, focus.story)) ranges = [new SelRange(anchor.story, anchor, focus).normalized()];
    }
  }
  const targets = new Map<WordNode, SelRange>();
  const text = new SelectionText();
  const add = (pos: CaretPos) => {
    const range = revisionRange(pos);
    if (range?.start.node) targets.set(range.start.node, range);
    return range;
  };
  for (const selected of ranges) {
    const range = selected.mode === "cell" && selected.story.slot === "cell"
      ? text.cellContentRange(selected.story.cell) : selected;
    if (range.collapsed()) {
      add(range.start);
      continue;
    }
    const stop = range.end.after ? range.end.node?.next : range.end.node;
    const start = range.start.after ? range.start.node?.next : range.start.node;
    let previous;
    for (let node = start; node && node !== stop; node = node.next) {
      const mark = revisionOf(node);
      if (mark && !sameRevision(previous, mark)) add(new CaretPos(range.story, node));
      previous = mark;
    }
  }
  return [...targets.values()];
}
