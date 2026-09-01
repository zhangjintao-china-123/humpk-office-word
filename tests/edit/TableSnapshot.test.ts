import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { TableSnapshot } from "../../src/edit/TableSnapshot";

function cellDoc(text: string): Document {
  const document = new Document();
  document.kind = "cell";
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

describe("TableSnapshot", () => {
  it("按选区矩形截取子表并物化", () => {
    const table = new Table();
    table.columns = [100, 120, 140].map((width) => {
      const column = new TableColumn();
      column.width = width;
      return column;
    });
    for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
      const row = new TableRow();
      for (let colIndex = 0; colIndex < 3; colIndex += 1) {
        const cell = new TableCell(cellDoc(`${rowIndex}${colIndex}`));
        cell.rowIndex = rowIndex;
        cell.colIndex = colIndex;
        row.cells.push(cell);
      }
      table.rows.push(row);
    }
    const picked = [table.rows[0].cells[1], table.rows[1].cells[1], table.rows[1].cells[2]];
    const snapshot = new TableSnapshot().capture(table, picked, (cell) => [
      { attrs: {}, runs: [{ text: cell.document.paragraphText()[0] ?? "", style: {} }] },
    ]);
    expect(snapshot?.columnWidths).toEqual([120, 140]);
    expect(snapshot?.rows).toHaveLength(2);
    const next = new TableSnapshot().materialize(snapshot!);
    expect(next.rows[0].cells[0].document.paragraphText()).toEqual(["01"]);
    expect(next.rows[1].cells[1].document.paragraphText()).toEqual(["12"]);
    expect(next.columns.map((column) => column.width)).toEqual([120, 140]);
  });
});
