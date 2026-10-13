import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { TableStructure } from "../../src/edit/TableStructure";

function grid(rows: number, cols: number): Table {
  const table = new Table();
  table.columns = Array.from({ length: cols }, (_, index) => {
    const column = new TableColumn();
    column.width = 80 + index;
    return column;
  });
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = new TableRow();
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      const document = new Document();
      const paragraph = new Paragraph(1);
      const block = new Block();
      block.text = `${rowIndex}${colIndex}`;
      paragraph.addBlock(block);
      document.addParagraph(paragraph);
      const cell = new TableCell(document);
      cell.rowIndex = rowIndex;
      cell.colIndex = colIndex;
      row.cells.push(cell);
    }
    table.rows.push(row);
  }
  return table;
}

describe("TableStructure", () => {
  const structure = new TableStructure();

  it("在指定位置插入和删除行", () => {
    const table = grid(2, 2);
    structure.insertRow(table, 1);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[1].cells.map((cell) => cell.document.paragraphText()[0])).toEqual(["", ""]);
    expect(table.rows[2].cells[0].rowIndex).toBe(2);
    expect(table.rows[2].cells[0].document.paragraphText()[0]).toBe("10");
    expect(structure.deleteRow(table, 1)).toBe(true);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1].cells[0].document.paragraphText()[0]).toBe("10");
    expect(table.rows[1].cells[0].rowIndex).toBe(1);
  });

  it("在指定位置插入和删除列", () => {
    const table = grid(2, 2);
    structure.insertColumn(table, 1);
    expect(table.columns).toHaveLength(3);
    expect(table.rows[0].cells.map((cell) => cell.colIndex)).toEqual([0, 1, 2]);
    expect(table.rows[0].cells[1].document.paragraphText()[0]).toBe("");
    expect(table.rows[0].cells[2].document.paragraphText()[0]).toBe("01");
    expect(structure.deleteColumn(table, 1)).toBe(true);
    expect(table.columns).toHaveLength(2);
    expect(table.rows[0].cells.map((cell) => cell.document.paragraphText()[0])).toEqual(["00", "01"]);
  });

  it("合并矩形后再拆开", () => {
    const table = grid(2, 2);
    const cells = [table.rows[0].cells[0], table.rows[0].cells[1], table.rows[1].cells[0], table.rows[1].cells[1]];
    expect(structure.merge(table, cells)).toBe(true);
    expect(table.rows[0].cells).toHaveLength(1);
    expect(table.rows[0].cells[0].colSpan).toBe(2);
    expect(table.rows[0].cells[0].rowSpan).toBe(2);
    expect(table.rows[1].cells).toHaveLength(0);
    expect(structure.split(table, table.rows[0].cells[0])).toBe(true);
    expect(table.rows[0].cells[0].colSpan).toBe(1);
    expect(table.rows[1].cells).toHaveLength(2);
    expect(table.rows[0].cells).toHaveLength(2);
  });
});
