import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { TableCell } from "../model/table/Table";
import { CaretPos } from "./CaretPos";
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
    return selection.normalized().some((range) => range.mode === "cell" || !range.collapsed());
  }

  covers(selection: Selection, pos: CaretPos): boolean {
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
