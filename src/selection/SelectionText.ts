import type { Document } from "../model/document/Document";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { Table, TableCell } from "../model/table/Table";
import { CaretPos } from "./CaretPos";
import { caretRank, coverFlow } from "./MainWalk";
import { SelRange } from "./SelRange";
import { Selection } from "./Selection";
import { storyEquals, type StoryRef } from "./StoryRef";

export class SelectionText {
  extract(selection: Selection): string {
    const ranges = selection.normalized();
    const cells: TableCell[] = [];
    const texts: string[] = [];
    for (const range of ranges) {
      if (range.mode === "cell" && range.story.slot === "cell") {
        cells.push(range.story.cell);
      } else {
        texts.push(this.extractRange(range));
      }
    }
    const parts: string[] = [];
    if (texts.length) {
      parts.push(texts.join("\n"));
    }
    if (cells.length) {
      parts.push(this.extractCellsTsv(cells));
    }
    return parts.join("\n");
  }

  extractRange(range: SelRange): string {
    const normalized = range.normalized();
    if (normalized.collapsed()) {
      return "";
    }
    let text = "";
    for (const node of this.nodesOf(normalized)) {
      if (node.data.kind === "text") {
        text += node.data.char;
      }
    }
    return text;
  }

  extractCell(cell: TableCell): string {
    return this.extractRange(this.cellContentRange(cell));
  }

  extractCellsTsv(cells: TableCell[]): string {
    const unique = [...new Map(cells.map((cell) => [cell, cell])).values()];
    unique.sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);
    const rows: string[][] = [];
    let currentRow = -1;
    for (const cell of unique) {
      if (cell.rowIndex !== currentRow) {
        rows.push([]);
        currentRow = cell.rowIndex;
      }
      rows[rows.length - 1].push(this.extractCell(cell));
    }
    return rows.map((row) => row.join("\t")).join("\n");
  }

  cellContentRange(cell: TableCell): SelRange {
    const story: StoryRef = { slot: "cell", cell };
    const head = cell.document.words.head;
    const tail = cell.document.words.tail;
    if (!head) {
      const pos = new CaretPos(story, null, false);
      return new SelRange(story, pos, pos);
    }
    if (head === tail && head.data.isEnterChar()) {
      const pos = new CaretPos(story, head, false);
      return new SelRange(story, pos, pos);
    }
    const end = tail && tail.data.isEnterChar()
      ? new CaretPos(story, tail, false)
      : new CaretPos(story, tail, true);
    return new SelRange(story, new CaretPos(story, head, false), end);
  }

  hasCopyableContent(selection: Selection): boolean {
    if (selection.flow && !selection.flow.anchor.equals(selection.flow.focus)) {
      return true;
    }
    return selection.normalized().some((range) => range.mode === "cell" || !range.collapsed());
  }

  covers(selection: Selection, pos: CaretPos, owner?: { document: Document; story: StoryRef } | null): boolean {
    const flow = selection.flow;
    if (flow && !flow.anchor.equals(flow.focus)) {
      if (owner) {
        const start = caretRank(owner.document, owner.story, flow.anchor);
        const end = caretRank(owner.document, owner.story, flow.focus);
        if (start != null && end != null) {
          const target = caretRank(owner.document, owner.story, pos);
          if (target != null) {
            return Math.min(start, end) <= target && target <= Math.max(start, end);
          }
          if (pos.story.slot === "cell") {
            const targetCell = pos.story.cell;
            const cover = coverFlow(owner.document, owner.story, flow.anchor, flow.focus);
            if (cover.tables.some((item) => tableContainsCell(item.table, targetCell))) {
              return true;
            }
          }
        }
      }
      const anchorNode = flow.anchor.node;
      if (anchorNode && anchorNode === flow.focus.node && anchorNode.data.kind === "table") {
        if (pos.node === anchorNode) {
          return true;
        }
        if (pos.story.slot === "cell" && anchorNode.data.table && tableContainsCell(anchorNode.data.table, pos.story.cell)) {
          return true;
        }
      }
    }
    for (const range of selection.normalized()) {
      if (range.mode === "cell" && range.story.slot === "cell") {
        if (pos.story.slot === "cell" && pos.story.cell === range.story.cell) {
          return true;
        }
        continue;
      }
      if (!storyEquals(range.story, pos.story)) {
        continue;
      }
      if (range.start.compare(pos) <= 0 && pos.compare(range.end) <= 0) {
        return true;
      }
    }
    return false;
  }

  nodesOf(range: SelRange): LinkedNode<Word>[] {
    const from = range.start.after ? (range.start.node?.next ?? null) : range.start.node;
    const to = range.end.after ? range.end.node : (range.end.node?.pre ?? null);
    if (!from || !to) {
      return [];
    }
    const nodes: LinkedNode<Word>[] = [];
    let node: LinkedNode<Word> | null = from;
    while (node) {
      nodes.push(node);
      if (node === to) {
        break;
      }
      node = node.next;
    }
    return nodes;
  }
}

function tableContainsCell(table: Table, target: TableCell): boolean {
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell === target) {
        return true;
      }
      let nested = cell.document.words.head;
      while (nested) {
        if (nested.data.kind === "table" && nested.data.table && tableContainsCell(nested.data.table, target)) {
          return true;
        }
        nested = nested.next;
      }
    }
  }
  return false;
}
