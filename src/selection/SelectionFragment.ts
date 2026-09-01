import { ClipboardPayload, type ClipboardParagraph, type ClipboardRun } from "../edit/ClipboardPayload";
import { TableSnapshot } from "../edit/TableSnapshot";
import type { Word } from "../model/inline/Word";
import type { Table, TableCell } from "../model/table/Table";
import { mergeRunStyle, type RunStyle } from "../model/style/RunStyle";
import { Selection } from "./Selection";
import { SelectionText } from "./SelectionText";
import type { SelRange } from "./SelRange";

export class SelectionFragment {
  private readonly text = new SelectionText();
  private readonly snapshot = new TableSnapshot();

  extract(selection: Selection, table?: Table): ClipboardPayload {
    const ranges = selection.normalized();
    const cells: TableCell[] = [];
    const paragraphs: ClipboardParagraph[] = [];
    const tables: Table[] = [];
    for (const range of ranges) {
      if (range.mode === "cell" && range.story.slot === "cell") {
        cells.push(range.story.cell);
      } else {
        paragraphs.push(...this.extractRange(range, tables));
      }
    }
    if (cells.length) {
      paragraphs.push(...this.extractCells(cells));
    }
    const host = table ?? tables[0];
    const grid = host
      ? this.snapshot.capture(host, cells.length ? cells : host.rows.flatMap((row) => row.cells), (cell) =>
          this.extractRange(this.text.cellContentRange(cell)),
        )
      : undefined;
    return new ClipboardPayload(this.joinText(paragraphs), paragraphs, grid);
  }

  extractRange(range: SelRange, tables: Table[] = []): ClipboardParagraph[] {
    const normalized = range.normalized();
    if (normalized.collapsed()) {
      return [];
    }
    const paragraphs: ClipboardParagraph[] = [];
    let current: ClipboardParagraph | null = null;
    let run: ClipboardRun | null = null;
    for (const node of this.text.nodesOf(normalized)) {
      const word = node.data;
      if (word.kind === "table" && word.table) {
        tables.push(word.table);
        continue;
      }
      if (word.kind !== "text") {
        continue;
      }
      if (word.isEnterChar()) {
        if (current) {
          paragraphs.push(current);
        }
        current = null;
        run = null;
        continue;
      }
      if (!current) {
        current = this.startParagraph(word);
        run = null;
      }
      const style = this.snapshotStyle(word);
      if (!run || !sameStyle(run.style, style)) {
        run = { text: "", style };
        current.runs.push(run);
      }
      run.text += word.char;
    }
    if (current) {
      paragraphs.push(current);
    }
    return paragraphs;
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
    return paragraphs.map((paragraph) => paragraph.runs.map((item) => item.text).join("")).join("\n");
  }
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
