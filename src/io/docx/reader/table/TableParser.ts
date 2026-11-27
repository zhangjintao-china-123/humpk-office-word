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
    if (tblpPr?.attributes.length) {
      table.anchorType = "relative";
      const offset = (name: string) => ctx.units.twipToPx(attr(tblpPr, name));
      const overlap = attr(first(tblPr, "w:tblOverlap"), "w:val");
      table.anchorSet = {
        leftFrom: attr(tblpPr, "w:horzAnchor") ?? "text",
        left: offset("w:tblpX"),
        leftAlign: attr(tblpPr, "w:tblpXSpec"),
        topFrom: attr(tblpPr, "w:vertAnchor") ?? "margin",
        top: offset("w:tblpY"),
        topAlign: attr(tblpPr, "w:tblpYSpec"),
        distLeft: offset("w:leftFromText"),
        distRight: offset("w:rightFromText"),
        distTop: offset("w:topFromText"),
        distBottom: offset("w:bottomFromText"),
        allowOverlap: overlap ? overlap !== "never" : undefined,
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
