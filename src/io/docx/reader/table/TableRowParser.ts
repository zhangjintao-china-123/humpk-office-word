import { TableRow } from "../../../../model/table/Table";
import { twipToPx } from "../../../../shared/units";
import { attr, children, first } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";
import { TableCellParser } from "./TableCellParser";

export class TableRowParser {
  private cells = new TableCellParser();

  parse(trNode: Element, ctx: ParseContext, rowIndex: number, prevRows: TableRow[]): TableRow {
    const row = new TableRow();
    const trPr = first(trNode, "w:trPr");
    const height = first(trPr, "w:trHeight");
    if (height) {
      const rule = attr(height, "w:hRule");
      row.heightRule = rule === "exact" || rule === "atLeast" ? rule : "auto";
      row.height = twipToPx(Number(attr(height, "w:val")) || 0);
    }
    const header = first(trPr, "w:tblHeader");
    if (header) {
      const val = attr(header, "w:val");
      row.header = val !== "0" && val !== "false" && val !== "off";
    }
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
