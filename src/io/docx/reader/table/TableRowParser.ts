import { TableRow } from "../../../../model/table/Table";
import { children } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";
import { TableCellParser } from "./TableCellParser";

export class TableRowParser {
  private cells = new TableCellParser();

  parse(trNode: Element, ctx: ParseContext, rowIndex: number, prevRows: TableRow[]): TableRow {
    const row = new TableRow();
    let colIndex = 0;
    for (const tc of children(trNode, "w:tc")) {
      const cell = this.cells.parse(tc, ctx, rowIndex, colIndex);
      if (!cell) {
        this.cells.applyContinuedRowSpan(prevRows, colIndex);
        colIndex += 1;
        continue;
      }
      row.cells.push(cell);
      colIndex += cell.colSpan;
    }
    return row;
  }
}
