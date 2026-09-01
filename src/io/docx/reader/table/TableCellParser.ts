import { Document } from "../../../../model/document/Document";
import { TableCell } from "../../../../model/table/Table";
import { first } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";
import { TableBordersParser } from "./TableBordersParser";
import { TableMergeParser } from "./TableMergeParser";

export class TableCellParser {
  private merges = new TableMergeParser();
  private borders = new TableBordersParser();

  parse(tcNode: Element, ctx: ParseContext, rowIndex: number, colIndex: number): TableCell | null {
    const tcPr = first(tcNode, "w:tcPr");
    const merge = this.merges.parse(tcPr);
    if (merge.continueRow) {
      return null;
    }

    const nested =
      ctx.storyParser?.parseRoot(tcNode, ctx, "cell") ?? new Document();

    const cell = new TableCell(nested);
    cell.rowIndex = rowIndex;
    cell.colIndex = colIndex;
    cell.colSpan = merge.colSpan;
    cell.rowSpan = merge.rowSpan;
    cell.borders = this.borders.parse(tcPr, "w:tcBorders");
    return cell;
  }

  applyContinuedRowSpan(prevRows: { cells: TableCell[] }[], colIndex: number): void {
    for (let i = prevRows.length - 1; i >= 0; i -= 1) {
      const origin = prevRows[i].cells.find((cell) => cell.colIndex === colIndex);
      if (origin) {
        origin.rowSpan += 1;
        return;
      }
    }
  }
}
