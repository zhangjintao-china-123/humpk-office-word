import { TableColumn } from "../../../../model/table/Table";
import { attr, children } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";

export class TableGridParser {
  parse(tblGrid: Element | null, ctx: ParseContext): TableColumn[] {
    if (!tblGrid) {
      return [];
    }
    return children(tblGrid, "w:gridCol").map((col) => {
      const column = new TableColumn();
      column.width = ctx.units.twipToPx(attr(col, "w:w")) ?? 80;
      return column;
    });
  }
}
