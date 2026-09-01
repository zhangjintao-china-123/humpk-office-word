import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import { Document } from "../model/document/Document";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import { Table, TableCell, TableColumn, TableRow, type TableBorders } from "../model/table/Table";
import type { ClipboardParagraph, ClipboardTable, ClipboardTableCell } from "./ClipboardPayload";

export class TableSnapshot {
  capture(table: Table, cells: TableCell[], contentOf: (cell: TableCell) => ClipboardParagraph[]): ClipboardTable | undefined {
    if (!cells.length) {
      return undefined;
    }
    const top = Math.min(...cells.map((cell) => cell.rowIndex));
    const left = Math.min(...cells.map((cell) => cell.colIndex));
    const bottom = Math.max(...cells.map((cell) => cell.rowIndex + cell.rowSpan - 1));
    const right = Math.max(...cells.map((cell) => cell.colIndex + cell.colSpan - 1));
    const selected = new Set(cells);
    const rows: ClipboardTable["rows"] = [];
    for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
      const row = table.rows[rowIndex];
      if (!row) {
        continue;
      }
      const captured: ClipboardTableCell[] = [];
      for (const cell of row.cells) {
        if (cell.rowIndex < top || cell.colIndex < left || cell.rowIndex > bottom || cell.colIndex > right) {
          continue;
        }
        if (cell.rowIndex !== rowIndex) {
          continue;
        }
        captured.push({
          colSpan: Math.min(cell.colSpan, right - cell.colIndex + 1),
          rowSpan: Math.min(cell.rowSpan, bottom - cell.rowIndex + 1),
          borders: cloneBorders(cell.borders),
          paragraphs: selected.has(cell) ? contentOf(cell) : [],
        });
      }
      rows.push({ cells: captured });
    }
    const columnWidths = [];
    for (let col = left; col <= right; col += 1) {
      columnWidths.push(table.columns[col]?.width || table.columnWidths[col] || 80);
    }
    return {
      columnWidths,
      borders: cloneBorders(table.borders),
      rows,
    };
  }

  materialize(snapshot: ClipboardTable): Table {
    const table = new Table();
    table.borders = cloneBorders(snapshot.borders);
    table.columns = snapshot.columnWidths.map((width) => {
      const column = new TableColumn();
      column.width = width;
      return column;
    });
    snapshot.rows.forEach((source, rowIndex) => {
      const row = new TableRow();
      let colIndex = 0;
      for (const item of source.cells) {
        const cell = new TableCell(this.cellDocument(item.paragraphs));
        cell.rowIndex = rowIndex;
        cell.colIndex = colIndex;
        cell.colSpan = item.colSpan;
        cell.rowSpan = item.rowSpan;
        cell.borders = cloneBorders(item.borders);
        row.cells.push(cell);
        colIndex += item.colSpan;
      }
      table.rows.push(row);
    });
    return table;
  }

  private cellDocument(paragraphs: ClipboardParagraph[]): Document {
    const document = new Document();
    document.kind = "cell";
    if (!paragraphs.length) {
      const paragraph = new Paragraph(1);
      paragraph.addBlock(new Block());
      document.addParagraph(paragraph);
    } else {
      paragraphs.forEach((item, index) => {
        const paragraph = new Paragraph(index + 1);
        paragraph.attrs = { ...item.attrs };
        paragraph.inheritedRunStyle = item.inheritedRunStyle ? { ...item.inheritedRunStyle } : undefined;
        if (!item.runs.length) {
          paragraph.addBlock(new Block());
        } else {
          for (const run of item.runs) {
            const block = new Block();
            block.text = run.text;
            block.style = { ...run.style };
            paragraph.addBlock(block);
          }
        }
        document.addParagraph(paragraph);
      });
    }
    new WordStreamBuilder().buildStoryOnly(document);
    return document;
  }
}

function cloneBorders(borders?: TableBorders): TableBorders | undefined {
  if (!borders) {
    return undefined;
  }
  const next: TableBorders = {};
  for (const side of ["top", "left", "bottom", "right", "insideH", "insideV", "tl2br", "tr2bl"] as const) {
    const item = borders[side];
    if (item) {
      next[side] = { ...item };
    }
  }
  return next;
}
