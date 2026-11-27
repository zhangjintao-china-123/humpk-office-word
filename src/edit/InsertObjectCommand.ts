import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import { Document } from "../model/document/Document";
import type { Drawing } from "../model/inline/Drawing";
import { Table, TableCell, TableColumn, TableRow, type TableBorder, type TableBorders } from "../model/table/Table";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import type { MutationPatch } from "./MutationPatch";

export type InsertObjectAction =
  | { type: "table"; rows: number; cols: number }
  | { type: "pageBreak" }
  | { type: "blankPage" }
  | { type: "formula"; instruction: string; result: string }
  | { type: "picture"; drawing: Drawing };

/** 在光标处插入表格、分页符、空白页或图片。 */
export class InsertObjectCommand implements EditCommand {
  private patches: MutationPatch[] = [];
  private played = false;

  constructor(
    private readonly ctx: EditContext,
    private readonly action: InsertObjectAction,
  ) {}

  do(): void {
    if (this.played) {
      for (const patch of this.patches) {
        const document = this.ctx.documentOf(patch.story);
        if (!document) {
          continue;
        }
        this.ctx.mutator.replay(document, patch);
        this.ctx.relayout.apply(patch.impact);
      }
      const last = this.patches.at(-1);
      if (last) {
        this.placeCaret(last);
        this.ctx.afterEdit(last.impact);
      }
      return;
    }
    this.played = true;
    const range = this.ctx.selection.primaryRange()?.normalized();
    if (!range) {
      return;
    }
    const document = this.ctx.documentOf(range.story);
    if (!document) {
      return;
    }
    let pos = range.start;
    if (!range.collapsed()) {
      const deleted = this.ctx.mutator.deleteRange(document, range.story, range);
      this.patches.push(deleted);
      pos = deleted.caret;
      this.ctx.relayout.apply(deleted.impact);
    }
    if (this.action.type === "blankPage") {
      const first = this.ctx.mutator.insertPageBreak(document, range.story, pos);
      if (!first.inserted.length) {
        return;
      }
      this.patches.push(first);
      this.ctx.relayout.apply(first.impact);
      const second = this.ctx.mutator.insertPageBreak(document, range.story, first.caret);
      if (second.inserted.length) {
        this.patches.push(second);
        this.ctx.relayout.apply(second.impact);
        this.placeCaret(second);
        this.ctx.afterEdit(second.impact);
        return;
      }
      this.placeCaret(first);
      this.ctx.afterEdit(first.impact);
      return;
    }
    const patch =
      this.action.type === "pageBreak"
        ? this.ctx.mutator.insertPageBreak(document, range.story, pos)
        : this.action.type === "picture"
          ? this.ctx.mutator.insertDrawing(document, range.story, pos, this.action.drawing)
          : this.action.type === "formula"
            ? this.ctx.mutator.insert(document, range.story, pos, this.action.result, this.ctx.pendingRunStyle?.(), {
              field: "FORMULA", fieldInstr: this.action.instruction,
            })
            : this.ctx.mutator.insertTable(document, range.story, pos, blankTable(this.action.rows, this.action.cols));
    if (!patch.inserted.length) {
      return;
    }
    this.patches.push(patch);
    this.ctx.relayout.apply(patch.impact);
    this.placeCaret(patch);
    this.ctx.afterEdit(patch.impact);
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

  private placeCaret(patch: MutationPatch): void {
    if (this.action.type === "picture") {
      const node = patch.inserted.find((item) => item.data.kind === "drawing");
      if (node) {
        this.ctx.selection.setRange(new SelRange(patch.story, new CaretPos(patch.story, node, false), new CaretPos(patch.story, node, true)));
        return;
      }
    }
    if (this.action.type !== "table") {
      this.ctx.selection.collapse(patch.caret);
      return;
    }
    const table = patch.inserted.find((node) => node.data.kind === "table")?.data.table;
    const cell = table?.rows[0]?.cells[0];
    if (cell && cell.document.words.length === 0) {
      new WordStreamBuilder().buildStoryOnly(cell.document);
    }
    const word = cell?.document.words.head;
    if (cell && word) {
      this.ctx.selection.collapse(new CaretPos({ slot: "cell", cell }, word, false));
      return;
    }
    this.ctx.selection.collapse(patch.caret);
  }
}

export function blankTable(rows: number, cols: number): Table {
  const table = new Table();
  const rowCount = Math.max(1, Math.min(10, rows));
  const colCount = Math.max(1, Math.min(10, cols));
  table.width = { type: "pct", value: 100 };
  table.borders = gridBorders();
  for (let col = 0; col < colCount; col += 1) {
    table.columns.push(new TableColumn());
  }
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = new TableRow();
    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      row.cells.push(blankCell(rowIndex, colIndex));
    }
    table.rows.push(row);
  }
  return table;
}

function blankCell(rowIndex: number, colIndex: number): TableCell {
  const document = new Document();
  document.kind = "cell";
  const paragraph = new Paragraph(1);
  paragraph.addBlock(new Block());
  document.addParagraph(paragraph);
  const cell = new TableCell(document);
  cell.rowIndex = rowIndex;
  cell.colIndex = colIndex;
  return cell;
}

function gridBorders(): TableBorders {
  const side: TableBorder = { type: "single", size: "8", color: "2E75B6" };
  return { top: side, left: side, bottom: side, right: side, insideH: side, insideV: side };
}
