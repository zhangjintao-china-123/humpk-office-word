import type { Paragraph } from "../../../../model/block/Paragraph";
import type { Table, TableBorders, TableCell, TableInsets, TableLength, TableRow } from "../../../../model/table/Table";
import { pxToTwip } from "../../../../shared/units";
import { escapeXml, hexColor } from "../../ooxml/XmlEscape";
import type { ParagraphSerializer } from "../paragraph/ParagraphSerializer";

const BORDER_TAGS: [keyof TableBorders, string][] = [
  ["top", "w:top"],
  ["left", "w:left"],
  ["bottom", "w:bottom"],
  ["right", "w:right"],
  ["insideH", "w:insideH"],
  ["insideV", "w:insideV"],
  ["tl2br", "w:tl2br"],
  ["tr2bl", "w:tr2bl"],
];

export class TableSerializer {
  constructor(private readonly paragraphs: ParagraphSerializer) {}

  serialize(table: Table): string {
    const widths = this.columnWidths(table);
    const total = widths.reduce((sum, width) => sum + width, 0);
    const style = table.styleId ? `<w:tblStyle w:val="${escapeXml(table.styleId)}"/>` : "";
    const borders = tableBordersXml(table.borders, "w:tblBorders");
    const tblPr = `<w:tblPr>${style}${this.anchorXml(table)}${this.widthXml("w:tblW", table.width, total)}${this.alignXml(table)}${this.indentXml(table)}${tableInsetsXml("w:tblCellMar", table.cellMargin)}${borders}</w:tblPr>`;
    const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
    const rows = table.rows.map((_, index) => this.rowXml(table, index, widths)).join("");
    return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
  }

  private anchorXml(table: Table): string {
    if (!table.anchorType) {
      return "";
    }
    const set = table.anchorSet;
    const attrs: [string, string | number | undefined][] = [
      ["horzAnchor", set?.leftFrom === "column" || set?.leftFrom === "paragraph" ? "text" : set?.leftFrom ?? "text"],
      ["vertAnchor", set?.topFrom === "paragraph" || set?.topFrom === "line" ? "text" : set?.topFrom ?? "margin"],
      ["tblpXSpec", set?.leftAlign],
      ["tblpYSpec", set?.topAlign],
      ["tblpX", set?.leftAlign ? undefined : pxToTwip(set?.left ?? 0)],
      ["tblpY", set?.topAlign ? undefined : pxToTwip(set?.top ?? 0)],
      ["leftFromText", set?.distLeft === undefined ? undefined : pxToTwip(set.distLeft)],
      ["rightFromText", set?.distRight === undefined ? undefined : pxToTwip(set.distRight)],
      ["topFromText", set?.distTop === undefined ? undefined : pxToTwip(set.distTop)],
      ["bottomFromText", set?.distBottom === undefined ? undefined : pxToTwip(set.distBottom)],
    ];
    const values = attrs.filter(([, value]) => value !== undefined).map(([name, value]) => `w:${name}="${escapeXml(String(value))}"`);
    const overlap = set?.allowOverlap === undefined ? "" : `<w:tblOverlap w:val="${set.allowOverlap ? "overlap" : "never"}"/>`;
    return `<w:tblpPr ${values.join(" ")}/>${overlap}`;
  }

  private rowXml(table: Table, rowIndex: number, widths: number[]): string {
    const cells: string[] = [];
    let col = 0;
    while (col < widths.length) {
      const cover = this.coverAt(table, rowIndex, col);
      if (cover) {
        if (cover.colIndex === col) {
          cells.push(
            cover.rowIndex === rowIndex ? this.cellXml(cover, widths) : this.continueXml(cover, widths),
          );
        }
        col = cover.colIndex === col ? col + Math.max(1, cover.colSpan) : col + 1;
        continue;
      }
      cells.push(this.emptyCell(widths[col] ?? 0));
      col += 1;
    }
    return `<w:tr>${this.rowProps(table.rows[rowIndex])}${cells.join("")}</w:tr>`;
  }

  private cellXml(cell: TableCell, widths: number[]): string {
    const paragraphs = cell.document.paragraphs.toArray();
    const body = paragraphs.length
      ? paragraphs.map((paragraph) => this.paragraphXml(paragraph)).join("")
      : "<w:p/>";
    return `<w:tc>${this.cellProps(cell, widths, false)}${body}</w:tc>`;
  }

  private continueXml(cell: TableCell, widths: number[]): string {
    return `<w:tc>${this.cellProps(cell, widths, true)}<w:p/></w:tc>`;
  }

  private emptyCell(width: number): string {
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
  }

  private cellProps(cell: TableCell, widths: number[], continued: boolean): string {
    const width = this.spanWidth(widths, cell.colIndex, cell.colSpan);
    const parts = [this.widthXml("w:tcW", cell.width, width)];
    if (cell.colSpan > 1) {
      parts.push(`<w:gridSpan w:val="${cell.colSpan}"/>`);
    }
    if (continued) {
      parts.push("<w:vMerge/>");
    } else if (cell.rowSpan > 1) {
      parts.push(`<w:vMerge w:val="restart"/>`);
    }
    const fill = hexColor(cell.fill);
    if (!continued && fill) {
      parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`);
    }
    if (cell.vAlign && cell.vAlign !== "top") {
      parts.push(`<w:vAlign w:val="${escapeXml(cell.vAlign)}"/>`);
    }
    const margin = tableInsetsXml("w:tcMar", cell.margin);
    if (margin) {
      parts.push(margin);
    }
    const borders = tableBordersXml(cell.borders, "w:tcBorders");
    if (borders) {
      parts.push(borders);
    }
    return `<w:tcPr>${parts.join("")}</w:tcPr>`;
  }

  private paragraphXml(paragraph: Paragraph): string {
    if (paragraph.isTable) {
      return paragraph.table ? this.serialize(paragraph.table) : "";
    }
    return this.paragraphs.serialize(paragraph);
  }

  private coverAt(table: Table, rowIndex: number, col: number): TableCell | undefined {
    for (let index = 0; index <= rowIndex; index += 1) {
      const row = table.rows[index];
      if (!row) {
        continue;
      }
      for (const cell of row.cells) {
        const rowEnd = cell.rowIndex + Math.max(1, cell.rowSpan);
        const colEnd = cell.colIndex + Math.max(1, cell.colSpan);
        if (rowIndex >= cell.rowIndex && rowIndex < rowEnd && col >= cell.colIndex && col < colEnd) {
          return cell;
        }
      }
    }
    return undefined;
  }

  private columnWidths(table: Table): number[] {
    const fromColumns = table.columns.map((column, index) =>
      this.twip(column.width || table.columnWidths[index] || 80),
    );
    const spanCount = table.rows.reduce((max, row) => {
      const end = row.cells.reduce((col, cell) => Math.max(col, cell.colIndex + cell.colSpan), 0);
      return Math.max(max, end);
    }, 0);
    const count = Math.max(fromColumns.length, spanCount, 1);
    const widths = fromColumns.slice(0, count);
    while (widths.length < count) {
      widths.push(this.twip(table.columnWidths[widths.length] || 80));
    }
    return widths;
  }

  private spanWidth(widths: number[], start: number, span: number): number {
    let total = 0;
    for (let index = 0; index < Math.max(1, span); index += 1) {
      total += widths[start + index] ?? 0;
    }
    return total;
  }

  private rowProps(row: TableRow | undefined): string {
    if (!row) {
      return "";
    }
    const parts: string[] = [];
    if (row.header) {
      parts.push("<w:tblHeader/>");
    }
    if ((row.heightRule === "atLeast" || row.heightRule === "exact") && row.height > 0) {
      parts.push(`<w:trHeight w:val="${pxToTwip(row.height)}" w:hRule="${row.heightRule}"/>`);
    }
    return parts.length ? `<w:trPr>${parts.join("")}</w:trPr>` : "";
  }

  private alignXml(table: Table): string {
    return table.align ? `<w:jc w:val="${escapeXml(table.align)}"/>` : "";
  }

  private indentXml(table: Table): string {
    if (!table.indent || table.indent.type === "auto") {
      return "";
    }
    return this.widthXml("w:tblInd", table.indent);
  }

  private widthXml(tag: string, length: TableLength | undefined, dxaFallback?: number): string {
    if (!length || length.type === "auto") {
      if (length?.type === "auto") {
        return `<${tag} w:w="0" w:type="auto"/>`;
      }
      if (dxaFallback == null) {
        return "";
      }
      return `<${tag} w:w="${this.twip(dxaFallback)}" w:type="dxa"/>`;
    }
    if (length.type === "pct") {
      return `<${tag} w:w="${Math.round(length.value * 50)}" w:type="pct"/>`;
    }
    return `<${tag} w:w="${this.twip(length.value)}" w:type="dxa"/>`;
  }

  private twip(px: number): number {
    return Math.max(0, Math.round(px * 15));
  }
}

export function tableBordersXml(
  borders: TableBorders | undefined,
  tag: "w:tblBorders" | "w:tcBorders",
): string {
  if (!borders) {
    return "";
  }
  const parts: string[] = [];
  for (const [side, name] of BORDER_TAGS) {
    const border = borders[side];
    if (!border) {
      continue;
    }
    const type = border.type || "single";
    const size = border.size || "4";
    const color = hexColor(border.color) ?? "000000";
    parts.push(`<${name} w:val="${type}" w:sz="${size}" w:space="0" w:color="${color}"/>`);
  }
  return parts.length ? `<${tag}>${parts.join("")}</${tag}>` : "";
}

export function tableInsetsXml(
  tag: "w:tblCellMar" | "w:tcMar",
  insets: TableInsets | undefined,
): string {
  if (!insets) {
    return "";
  }
  const side = (name: string, px: number) =>
    `<${name} w:w="${Math.max(0, Math.round(px * 15))}" w:type="dxa"/>`;
  return `<${tag}>${side("w:top", insets.top)}${side("w:left", insets.left)}${side("w:bottom", insets.bottom)}${side("w:right", insets.right)}</${tag}>`;
}
