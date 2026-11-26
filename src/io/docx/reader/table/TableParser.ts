import { Paragraph } from "../../../../model/block/Paragraph";
import { Table } from "../../../../model/table/Table";
import { attr, children, first } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";
import { TableBordersParser } from "./TableBordersParser";
import { TableGridParser } from "./TableGridParser";
import { readInsets, readLength } from "./TableMetricParser";
import { TableRowParser } from "./TableRowParser";

export class TableParser {
  private grid = new TableGridParser();
  private rows = new TableRowParser();
  private borders = new TableBordersParser();

  parse(tblNode: Element, ctx: ParseContext): Paragraph {
    const table = new Table();
    table.columns = this.grid.parse(first(tblNode, "w:tblGrid"), ctx);

    const tblPr = first(tblNode, "w:tblPr");
    const styleId = attr(first(tblPr, "w:tblStyle"), "w:val") || undefined;
    const resolvedStyleId = styleId ?? ctx.styles.defaultTableStyleId;
    const styleDef = resolvedStyleId ? ctx.styles.getResolved(resolvedStyleId) : undefined;
    table.styleId = styleId;
    const ownBorders = this.borders.parse(tblPr, "w:tblBorders");
    table.borders =
      styleDef?.tableBorders || ownBorders
        ? { ...styleDef?.tableBorders, ...ownBorders }
        : undefined;
    table.width = readLength(first(tblPr, "w:tblW"));
    table.align = attr(first(tblPr, "w:jc"), "w:val") || undefined;
    table.indent = readLength(first(tblPr, "w:tblInd"));
    table.cellMargin = readInsets(first(tblPr, "w:tblCellMar")) ?? styleDef?.tableCellMargin;
    const tblpPr = first(tblPr, "w:tblpPr");
    if (tblpPr) {
      table.anchorType = "relative";
      table.anchorSet = {
        leftFrom: "page",
        left: ctx.units.twipToPx(attr(tblpPr, "w:tblpX")),
        topFrom: "paragraph",
        top: ctx.units.twipToPx(attr(tblpPr, "w:tblpY")),
      };
    }

    for (const tr of children(tblNode, "w:tr")) {
      table.rows.push(this.rows.parse(tr, ctx, table.rows.length, table.rows));
    }

    const paragraph = new Paragraph(ctx.nextId());
    paragraph.isTable = true;
    paragraph.table = table;
    paragraph.hasAnchor = table.anchorType != null;
    return paragraph;
  }
}
