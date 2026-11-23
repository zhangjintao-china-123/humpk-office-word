import type { Document } from "../model/document/Document";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { Table, TableCell } from "../model/table/Table";
import { CaretPos } from "./CaretPos";
import { SelRange } from "./SelRange";
import { storyEquals, type StoryRef } from "./StoryRef";

interface WordMark {
  kind: "word";
  story: StoryRef;
  node: LinkedNode<Word>;
  before: number;
}

interface TableMark {
  kind: "table-before" | "table-after";
  story: StoryRef;
  node: LinkedNode<Word>;
  before: number;
  table: Table;
}

type Mark = WordMark | TableMark;

export type FlowPiece =
  | { type: "text"; range: SelRange }
  | { type: "table"; story: StoryRef; node: LinkedNode<Word> };

export interface FlowCover {
  glyphs: { story: StoryRef; node: LinkedNode<Word> }[];
  fullCells: TableCell[];
  ranges: SelRange[];
  tables: { story: StoryRef; node: LinkedNode<Word>; table: Table }[];
  pieces: FlowPiece[];
}

export function cellsInReadingOrder(table: Table): TableCell[] {
  const cells: TableCell[] = [];
  for (const row of table.rows) {
    cells.push(...[...row.cells].sort((a, b) => a.colIndex - b.colIndex));
  }
  return cells;
}

export function caretRank(document: Document, story: StoryRef, pos: CaretPos): number | null {
  return rankOf(marksOf(document, story), pos);
}

export function coverFlow(document: Document, story: StoryRef, anchor: CaretPos, focus: CaretPos): FlowCover {
  const marks = marksOf(document, story);
  const left = rankOf(marks, anchor);
  const right = rankOf(marks, focus);
  const empty: FlowCover = { glyphs: [], fullCells: [], ranges: [], tables: [], pieces: [] };
  if (left == null || right == null || left === right) {
    return empty;
  }
  const start = Math.min(left, right);
  const end = Math.max(left, right);
  const included = (mark: WordMark): boolean => mark.before >= start && mark.before < end;
  const fullTables = new Set<Table>();
  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i];
    if (mark.kind !== "table-before") {
      continue;
    }
    const after = marks.slice(i + 1).find((item) => item.kind === "table-after" && item.table === mark.table);
    if (after && start <= mark.before && end >= after.before) {
      fullTables.add(mark.table);
    }
  }
  const wordsByCell = new Map<TableCell, WordMark[]>();
  for (const mark of marks) {
    if (mark.kind === "word" && mark.story.slot === "cell") {
      const list = wordsByCell.get(mark.story.cell) ?? [];
      list.push(mark);
      wordsByCell.set(mark.story.cell, list);
    }
  }
  const fullCells = new Set<TableCell>();
  for (const [cell, words] of wordsByCell) {
    if (words.length && words.every(included)) {
      fullCells.add(cell);
    }
  }
  const glyphs: FlowCover["glyphs"] = [];
  const ranges: SelRange[] = [];
  const pieces: FlowPiece[] = [];
  const tables: FlowCover["tables"] = [];
  const emittedCells = new Set<TableCell>();
  let run: WordMark[] = [];
  const flush = (): void => {
    if (!run.length) {
      return;
    }
    const runStory = run[0].story;
    const range = new SelRange(
      runStory,
      new CaretPos(runStory, run[0].node, false),
      new CaretPos(runStory, run[run.length - 1].node, true),
    );
    ranges.push(range);
    pieces.push({ type: "text", range });
    run = [];
  };
  for (const mark of marks) {
    if (mark.kind === "table-before" && fullTables.has(mark.table)) {
      flush();
      pieces.push({ type: "table", story: mark.story, node: mark.node });
      tables.push({ story: mark.story, node: mark.node, table: mark.table });
      continue;
    }
    if (mark.kind !== "word" || !included(mark)) {
      flush();
      continue;
    }
    const cell = mark.story.slot === "cell" ? mark.story.cell : null;
    if (cell && (fullCells.has(cell) || cellInTable(cell, fullTables))) {
      flush();
      if (fullCells.has(cell) && !cellInTable(cell, fullTables) && !emittedCells.has(cell)) {
        const range = cellContentRange(cell);
        ranges.push(range);
        pieces.push({ type: "text", range });
        emittedCells.add(cell);
      }
      continue;
    }
    if (run.length && !storyEquals(run[0].story, mark.story)) {
      flush();
    }
    glyphs.push({ story: mark.story, node: mark.node });
    run.push(mark);
  }
  flush();
  return {
    glyphs,
    fullCells: [...fullCells].filter((cell) => !cellInTable(cell, fullTables)),
    ranges,
    tables,
    pieces,
  };
}

export function formatRanges(cover: FlowCover): SelRange[] {
  const ranges = [...cover.ranges];
  for (const item of cover.tables) {
    for (const cell of cellsInReadingOrder(item.table)) {
      ranges.push(cellContentRange(cell));
    }
  }
  return ranges.filter((range) => !range.collapsed());
}

/** 方向键在格子边缘或表格词上改走阅读顺序，格内仍按原来的逐字移动。 */
export function moveInFlow(document: Document, story: StoryRef, pos: CaretPos, dir: -1 | 1): CaretPos {
  const stepped = dir < 0 ? stepLeft(pos) : stepRight(pos);
  if (stepped.node?.data.kind === "table") {
    const landed = dir > 0 ? firstIn(document, story, stepped.node) : lastBefore(document, story, stepped.node);
    return landed ?? pos;
  }
  if (!stepped.equals(pos)) {
    return stepped;
  }
  const listed = marksOf(document, story);
  const here = rankOf(listed, pos);
  if (here == null) {
    return pos;
  }
  let picked: WordMark | null = null;
  for (const mark of listed) {
    if (mark.kind !== "word") {
      continue;
    }
    if (dir > 0 && mark.before > here && !picked) {
      picked = mark;
    }
    if (dir < 0 && mark.before < here) {
      picked = mark;
    }
  }
  return picked ? new CaretPos(picked.story, picked.node, false) : pos;
}

function firstIn(document: Document, story: StoryRef, tableNode: LinkedNode<Word>): CaretPos | null {
  const listed = marksOf(document, story);
  const gate = listed.find((mark) => mark.kind === "table-before" && mark.node === tableNode);
  if (!gate) {
    return null;
  }
  const word = listed.find((mark) => mark.kind === "word" && mark.before > gate.before);
  return word && word.kind === "word" ? new CaretPos(word.story, word.node, false) : null;
}

function lastBefore(document: Document, story: StoryRef, tableNode: LinkedNode<Word>): CaretPos | null {
  const listed = marksOf(document, story);
  const gate = listed.find((mark) => mark.kind === "table-before" && mark.node === tableNode);
  if (!gate) {
    return null;
  }
  let picked: WordMark | null = null;
  for (const mark of listed) {
    if (mark.kind === "word" && mark.before < gate.before) {
      picked = mark;
    }
  }
  return picked ? new CaretPos(picked.story, picked.node, false) : null;
}

function stepLeft(pos: CaretPos): CaretPos {
  if (!pos.node) {
    return pos;
  }
  if (pos.after) {
    return new CaretPos(pos.story, pos.node, false);
  }
  const pre = pos.node.pre;
  if (!pre) {
    return pos;
  }
  return new CaretPos(pos.story, pre, false);
}

function stepRight(pos: CaretPos): CaretPos {
  if (!pos.node) {
    return pos;
  }
  if (!pos.after && !pos.node.data.isEnterChar()) {
    return new CaretPos(pos.story, pos.node, true);
  }
  const next = pos.node.next;
  if (!next) {
    return pos;
  }
  if (pos.node.data.isEnterChar() || next.data.isEnterChar()) {
    return new CaretPos(pos.story, next, false);
  }
  return new CaretPos(pos.story, next, true);
}

function cellContentRange(cell: TableCell): SelRange {
  const story: StoryRef = { slot: "cell", cell };
  const head = cell.document.words.head;
  const tail = cell.document.words.tail;
  if (!head || (head === tail && head.data.isEnterChar())) {
    const caret = new CaretPos(story, head, false);
    return new SelRange(story, caret, caret);
  }
  const end = tail?.data.isEnterChar() ? new CaretPos(story, tail, false) : new CaretPos(story, tail, true);
  return new SelRange(story, new CaretPos(story, head, false), end);
}

function cellInTable(cell: TableCell, tables: Set<Table>): boolean {
  for (const table of tables) {
    if (cellsInReadingOrder(table).includes(cell)) {
      return true;
    }
  }
  return false;
}

function marksOf(document: Document, story: StoryRef): Mark[] {
  const marks: Mark[] = [];
  let rank = 0;
  const take = (): number => {
    const value = rank;
    rank += 2;
    return value;
  };
  const walk = (doc: Document, current: StoryRef): void => {
    let node = doc.words.head;
    while (node) {
      const table = node.data.kind === "table" ? node.data.table : undefined;
      if (table) {
        marks.push({ kind: "table-before", story: current, node, before: take(), table });
        for (const item of cellsInReadingOrder(table)) {
          walk(item.document, { slot: "cell", cell: item });
        }
        marks.push({ kind: "table-after", story: current, node, before: rank, table });
        rank += 2;
      } else {
        marks.push({ kind: "word", story: current, node, before: take() });
      }
      node = node.next;
    }
  };
  walk(document, story);
  return marks;
}

function rankOf(marks: Mark[], pos: CaretPos): number | null {
  for (const mark of marks) {
    if (!storyEquals(mark.story, pos.story) || mark.node !== pos.node) {
      continue;
    }
    if (mark.kind === "word") {
      return mark.before + (pos.after ? 1 : 0);
    }
    if (mark.kind === "table-before" && !pos.after) {
      return mark.before;
    }
    if (mark.kind === "table-after" && pos.after) {
      return mark.before;
    }
  }
  return null;
}
