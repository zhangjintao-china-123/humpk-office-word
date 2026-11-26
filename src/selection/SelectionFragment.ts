import {
  ClipboardPayload,
  snapshotDrawing,
  type ClipboardBlock,
  type ClipboardParagraph,
  type ClipboardRun,
  type ClipboardTable,
} from "../edit/ClipboardPayload";
import { TableSnapshot } from "../edit/TableSnapshot";
import type { Document } from "../model/document/Document";
import type { Word } from "../model/inline/Word";
import type { Table, TableCell } from "../model/table/Table";
import { mergeRunStyle, type RunStyle } from "../model/style/RunStyle";
import { cellsInReadingOrder, coverFlow } from "./MainWalk";
import { Selection } from "./Selection";
import { SelectionText } from "./SelectionText";
import type { SelRange } from "./SelRange";
import type { StoryRef } from "./StoryRef";

export class SelectionFragment {
  private readonly text = new SelectionText();
  private readonly snapshot = new TableSnapshot();

  extract(
    selection: Selection,
    table?: Table,
    owner?: { document: Document; story: StoryRef } | null,
  ): ClipboardPayload {
    if (selection.flow && owner) {
      return this.extractFlow(selection, owner);
    }
    const ranges = selection.normalized();
    const cells: TableCell[] = [];
    const paragraphs: ClipboardParagraph[] = [];
    const blocks: ClipboardBlock[] = [];
    const tables: Table[] = [];
    const capturedTables: Table[] = [];
    const tableGrids: ClipboardTable[] = [];
    for (const range of ranges) {
      if (range.mode === "cell" && range.story.slot === "cell") {
        cells.push(range.story.cell);
      } else {
        const piece = this.extractRangeDetailed(range, tables, capturedTables);
        paragraphs.push(...piece.paragraphs);
        blocks.push(...piece.blocks);
        tableGrids.push(...piece.grids);
      }
    }
    if (cells.length) {
      paragraphs.push(...this.extractCells(cells));
    }
    if (!cells.length && !table && (tableGrids.length > 1 || (tableGrids.length >= 1 && paragraphs.length > 0))) {
      return new ClipboardPayload(this.blocksText(blocks), paragraphs, undefined, blocks);
    }
    const host = table ?? tables[0];
    const grid = host
      ? this.snapshot.capture(host, cells.length ? cells : host.rows.flatMap((row) => row.cells), (cell) =>
          this.extractRange(this.text.cellContentRange(cell)),
        )
      : undefined;
    const text = grid && !paragraphs.length ? this.tableText(grid) : this.joinText(paragraphs);
    return new ClipboardPayload(text, paragraphs, grid);
  }

  private extractFlow(selection: Selection, owner: { document: Document; story: StoryRef }): ClipboardPayload {
    const flow = selection.flow;
    if (!flow) {
      return new ClipboardPayload("", [], undefined);
    }
    const cover = coverFlow(owner.document, owner.story, flow.anchor, flow.focus);
    const paragraphs: ClipboardParagraph[] = [];
    const blocks: ClipboardBlock[] = [];
    const tables: ClipboardTable[] = [];
    const capturedTables: Table[] = [];
    for (const piece of cover.pieces) {
      if (piece.type === "text") {
        const extracted = this.extractRange(piece.range);
        for (const paragraph of extracted) {
          paragraphs.push(paragraph);
          blocks.push({ type: "paragraph", paragraph });
        }
      } else if (piece.node.data.table) {
        const table = piece.node.data.table;
        if (capturedTables.some((host) => tableContainsTable(host, table))) {
          continue;
        }
        capturedTables.push(table);
        const grid = this.snapshot.capture(table, cellsInReadingOrder(table), (cell) =>
          this.extractRange(this.text.cellContentRange(cell)),
        );
        if (grid) {
          tables.push(grid);
          blocks.push({ type: "table", table: grid });
        }
      }
    }
    if (!tables.length) {
      return new ClipboardPayload(this.joinText(paragraphs), paragraphs);
    }
    if (tables.length === 1 && !paragraphs.length) {
      return new ClipboardPayload(this.tableText(tables[0]), [], tables[0]);
    }
    return new ClipboardPayload(this.blocksText(blocks), paragraphs, undefined, blocks);
  }

  extractRange(range: SelRange, tables: Table[] = []): ClipboardParagraph[] {
    return this.extractRangeDetailed(range, tables, []).paragraphs;
  }

  private extractRangeDetailed(
    range: SelRange,
    tables: Table[],
    capturedTables: Table[],
  ): { paragraphs: ClipboardParagraph[]; blocks: ClipboardBlock[]; grids: ClipboardTable[] } {
    const normalized = range.normalized();
    if (normalized.collapsed()) {
      return { paragraphs: [], blocks: [], grids: [] };
    }
    const paragraphs: ClipboardParagraph[] = [];
    const blocks: ClipboardBlock[] = [];
    const grids: ClipboardTable[] = [];
    let current: ClipboardParagraph | null = null;
    let run: ClipboardRun | null = null;
    const flushCurrent = (): void => {
      if (current) {
        paragraphs.push(current);
        blocks.push({ type: "paragraph", paragraph: current });
      }
      current = null;
      run = null;
    };
    for (const node of this.text.nodesOf(normalized)) {
      const word = node.data;
      if (word.kind === "table" && word.table) {
        flushCurrent();
        tables.push(word.table);
        if (!capturedTables.some((host) => tableContainsTable(host, word.table!))) {
          capturedTables.push(word.table);
          const grid = this.snapshot.capture(word.table, cellsInReadingOrder(word.table), (cell) =>
            this.extractRange(this.text.cellContentRange(cell)),
          );
          if (grid) {
            grids.push(grid);
            blocks.push({ type: "table", table: grid });
          }
        }
        continue;
      }
      if (word.kind === "drawing" && word.drawing && !word.block?.math) {
        if (!current) {
          current = this.startParagraph(word);
          run = null;
        }
        current.runs.push({ text: "", style: {}, drawing: snapshotDrawing(word.drawing) });
        run = null;
        continue;
      }
      if (word.kind !== "text") {
        continue;
      }
      if (word.isEnterChar()) {
        flushCurrent();
        continue;
      }
      if (!current) {
        current = this.startParagraph(word);
        run = null;
      }
      const style = this.snapshotStyle(word);
      if (word.block?.enclosed) {
        current.runs.push({ text: word.char, style, enclosed: { ...word.block.enclosed } });
        run = null;
        continue;
      }
      if (word.block?.asianLayout) {
        current.runs.push({ text: word.char, style, asianLayout: { ...word.block.asianLayout } });
        run = null;
        continue;
      }
      if (!run || !sameStyle(run.style, style)) {
        run = { text: "", style };
        current.runs.push(run);
      }
      run.text += word.char;
    }
    flushCurrent();
    return { paragraphs, blocks, grids };
  }

  private extractCells(cells: TableCell[]): ClipboardParagraph[] {
    const unique = [...new Map(cells.map((cell) => [cell, cell])).values()];
    unique.sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex);
    const paragraphs: ClipboardParagraph[] = [];
    let current: ClipboardParagraph = { attrs: {}, runs: [] };
    let row = unique[0]?.rowIndex ?? 0;
    for (let i = 0; i < unique.length; i += 1) {
      const cell = unique[i];
      if (cell.rowIndex !== row) {
        paragraphs.push(current);
        current = { attrs: {}, runs: [] };
        row = cell.rowIndex;
      } else if (i > 0) {
        current.runs.push({ text: "\t", style: {} });
      }
      const cellParas = this.extractRange(this.text.cellContentRange(cell));
      cellParas.forEach((paragraph, index) => {
        if (index > 0) {
          paragraphs.push(current);
          current = { attrs: { ...paragraph.attrs }, inheritedRunStyle: paragraph.inheritedRunStyle, runs: [] };
        } else if (!current.runs.length) {
          current.attrs = { ...paragraph.attrs };
          current.inheritedRunStyle = paragraph.inheritedRunStyle;
        }
        current.runs.push(...paragraph.runs);
      });
    }
    if (current.runs.length || !paragraphs.length) {
      paragraphs.push(current);
    }
    return paragraphs;
  }

  private startParagraph(word: Word): ClipboardParagraph {
    const paragraph = word.paragraph;
    return {
      attrs: { ...paragraph?.attrs },
      inheritedRunStyle: paragraph?.inheritedRunStyle ? { ...paragraph.inheritedRunStyle } : undefined,
      runs: [],
    };
  }

  private snapshotStyle(word: Word): RunStyle {
    return mergeRunStyle(word.paragraph?.inheritedRunStyle, word.block?.style);
  }

  private joinText(paragraphs: ClipboardParagraph[]): string {
    return paragraphs
      .map((paragraph) =>
        paragraph.runs.map((item) => (item.drawing ? item.text || "\uFFFC" : item.text)).join(""),
      )
      .join("\n");
  }

  private tableText(table: ClipboardTable): string {
    return table.rows
      .map((row) =>
        row.cells
          .map((cell) => this.joinText(cell.paragraphs))
          .join("\t"),
      )
      .join("\n");
  }

  private blocksText(blocks: ClipboardBlock[]): string {
    return blocks
      .map((block) => (block.type === "table" ? this.tableText(block.table) : this.joinText([block.paragraph])))
      .join("\n");
  }
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function tableContainsTable(outer: Table, inner: Table): boolean {
  if (outer === inner) {
    return true;
  }
  for (const row of outer.rows) {
    for (const cell of row.cells) {
      let node = cell.document.words.head;
      while (node) {
        if (node.data.kind === "table" && node.data.table && tableContainsTable(node.data.table, inner)) {
          return true;
        }
        node = node.next;
      }
    }
  }
  return false;
}
