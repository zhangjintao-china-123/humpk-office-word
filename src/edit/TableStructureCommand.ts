import type { Paragraph } from "../model/block/Paragraph";
import { Document } from "../model/document/Document";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import { LinkedList } from "../model/list/LinkedList";
import type { Table, TableCell } from "../model/table/Table";
import { CaretPos } from "../selection/CaretPos";
import type { SelRange } from "../selection/SelRange";
import type { FlowAnchor } from "../selection/Selection";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import { TableStructure } from "./TableStructure";

export type TableStructureOp =
  | { type: "insertRow"; index: number; focusNewRow?: boolean }
  | { type: "deleteRow" | "insertColumn" | "deleteColumn"; index: number }
  | { type: "deleteRows" | "deleteColumns"; indexes: number[] }
  | { type: "merge"; cells: TableCell[] }
  | { type: "splitInto"; cell: TableCell; rows: number; columns: number; fraction?: number }
  | { type: "split"; cell: TableCell };

interface CellState {
  cell: TableCell;
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  document: Document;
  width: TableCell["width"];
}

interface TableSnap {
  columns: Table["columns"];
  rows: { row: Table["rows"][number]; cells: TableCell[]; height: number; heightRule: Table["rows"][number]["heightRule"] }[];
  states: CellState[];
}

export class TableStructureCommand implements EditCommand {
  private readonly structure = new TableStructure();
  private played = false;
  private before: TableSnap | null = null;
  private after: TableSnap | null = null;
  private beforeSelection?: { ranges: SelRange[]; flow: FlowAnchor | null; primary: number };
  private hostParagraph: Paragraph | undefined;

  constructor(
    private readonly ctx: EditContext,
    private readonly table: Table,
    private readonly story: StoryRef,
    private readonly anchor: TableCell,
    private readonly op: TableStructureOp,
  ) {}

  do(): void {
    if (this.played && this.after) {
      restore(this.table, this.after);
      this.commit(() => this.focusAfterEdit());
      return;
    }
    this.played = true;
    const { ranges, flow, primary } = this.ctx.selection;
    this.beforeSelection = { ranges: ranges.slice(), flow, primary };
    this.hostParagraph = this.ctx.relayout.findCellHost?.(this.anchor)?.paragraph;
    this.before = snap(this.table);
    this.apply();
    this.after = snap(this.table);
    this.commit(() => this.focusAfterEdit());
  }

  undo(): void {
    if (this.before) {
      restore(this.table, this.before);
      this.commit(() => {
        if (this.beforeSelection) Object.assign(this.ctx.selection, this.beforeSelection);
      });
    }
  }

  private focusAfterEdit(): void {
    let cell: TableCell | undefined;
    if (this.op.type === "insertRow" && this.op.focusNewRow) {
      cell = this.table.rows[this.op.index]?.cells[0];
    } else if (this.op.type === "merge") {
      const flow = this.beforeSelection?.flow;
      if (flow && flow.anchor.node === flow.focus.node && flow.anchor.node?.data.table === this.table) {
        this.ctx.selection.setFlow(flow.anchor, flow.focus);
        return;
      }
      cell = this.op.cells.find((item) => this.table.rows[item.rowIndex]?.cells.includes(item));
    } else if (!this.table.rows[this.anchor.rowIndex]?.cells.includes(this.anchor)) {
      const row = this.table.rows[Math.min(this.anchor.rowIndex, this.table.rows.length - 1)];
      cell = row?.cells.find((item) => item.colIndex >= this.anchor.colIndex);
      cell ??= row?.cells.at(-1) ?? this.table.rows.flatMap((item) => item.cells)[0];
    } else if (this.op.type.startsWith("delete")) {
      const removed = this.ctx.selection.ranges.some(({ story }) => story.slot === "cell"
        && !this.table.rows[story.cell.rowIndex]?.cells.includes(story.cell));
      if (removed) cell = this.anchor;
    }
    if (!cell) {
      return;
    }
    this.ctx.selection.collapse(new CaretPos({ slot: "cell", cell }, cell.document.words.head, false));
  }

  private apply(): void {
    if (this.op.type === "insertRow") {
      this.structure.insertRow(this.table, this.op.index);
    } else if (this.op.type === "deleteRow") {
      this.structure.deleteRow(this.table, this.op.index);
    } else if (this.op.type === "insertColumn") {
      this.structure.insertColumn(this.table, this.op.index);
    } else if (this.op.type === "deleteColumn") {
      this.structure.deleteColumn(this.table, this.op.index);
    } else if (this.op.type === "deleteRows" || this.op.type === "deleteColumns") {
      for (const index of this.op.indexes.slice().sort((a, b) => b - a)) {
        if (this.op.type === "deleteRows") this.structure.deleteRow(this.table, index);
        else this.structure.deleteColumn(this.table, index);
      }
    } else if (this.op.type === "merge") {
      const cells = this.op.cells.slice().sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);
      if (this.structure.merge(this.table, cells)) {
        const origin = cells[0];
        const document = Object.assign(new Document(), origin.document, {
          paragraphs: new LinkedList(),
          words: new LinkedList(),
          anchors: [],
        });
        const paragraphs = [];
        for (const cell of cells) {
          const source = cell.document;
          const first = source.paragraphs.head?.data;
          if (first && source.paragraphs.length === 1 && source.words.length === 1 &&
            source.words.head?.data.isEnterChar() && !first.bookmarks.length &&
            !Object.keys(first.attrs).length && first.blocks.every((block) =>
              !block.drawing && !block.field && !block.commentIds?.length && !block.revision)) continue;
          paragraphs.push(...source.paragraphs.toArray());
        }
        for (const paragraph of paragraphs.length ? paragraphs : origin.document.paragraphs.toArray()) {
          document.addParagraph(paragraph);
        }
        new WordStreamBuilder().buildStoryOnly(document);
        origin.document = document;
      }
    } else if (this.op.type === "split") {
      this.structure.split(this.table, this.op.cell);
    } else if (this.op.type === "splitInto") {
      this.structure.splitInto(this.table, this.op.cell, this.op.rows, this.op.columns, this.op.fraction);
    }
  }

  private commit(select?: () => void): void {
    const dirty = this.hostParagraph ? [this.hostParagraph] : [];
    if (dirty.length) {
      this.ctx.relayout.apply(new EditImpact(this.story, dirty));
    }
    select?.();
    this.ctx.afterEdit(new EditImpact(this.story, dirty));
  }
}

function snap(table: Table): TableSnap {
  const states: CellState[] = [];
  for (const row of table.rows) {
    for (const cell of row.cells) {
      states.push({
        cell,
        rowIndex: cell.rowIndex,
        colIndex: cell.colIndex,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        document: cell.document,
        width: cell.width,
      });
    }
  }
  return {
    columns: table.columns.slice(),
    rows: table.rows.map((row) => ({ row, cells: row.cells.slice(), height: row.height, heightRule: row.heightRule })),
    states,
  };
}

function restore(table: Table, shot: TableSnap): void {
  table.columns = shot.columns.slice();
  table.rows = shot.rows.map((item) => {
    item.row.cells = item.cells.slice();
    item.row.height = item.height;
    item.row.heightRule = item.heightRule;
    return item.row;
  });
  for (const state of shot.states) {
    state.cell.rowIndex = state.rowIndex;
    state.cell.colIndex = state.colIndex;
    state.cell.rowSpan = state.rowSpan;
    state.cell.colSpan = state.colSpan;
    state.cell.document = state.document;
    state.cell.width = state.width;
    if (state.cell.document.paragraphs.head?.data.node !== state.cell.document.paragraphs.head) {
      state.cell.document.paragraphs.each((node) => { node.data.node = node; });
    }
  }
}
