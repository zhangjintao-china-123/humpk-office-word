import type { Paragraph } from "../../../../model/block/Paragraph";
import type { Table, TableBorder, TableBorders, TableCell } from "../../../../model/table/Table";
import { hexColor } from "../../ooxml/XmlEscape";
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
    const borders = this.bordersXml(table.borders, "w:tblBorders");
    const tblPr = `<w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${borders}</w:tblPr>`;
    const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
    const rows = table.rows.map((_, index) => this.rowXml(table, index, widths)).join("");
    return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
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
    return `<w:tr>${cells.join("")}</w:tr>`;
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
    const parts = [`<w:tcW w:w="${width}" w:type="dxa"/>`];
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
    const borders = this.bordersXml(cell.borders, "w:tcBorders");
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

  private bordersXml(borders: TableBorders | undefined, tag: "w:tblBorders" | "w:tcBorders"): string {
    if (!borders) {
      return "";
    }
    const parts: string[] = [];
    for (const [side, name] of BORDER_TAGS) {
      const border = borders[side];
      const xml = border ? this.borderXml(name, border) : "";
      if (xml) {
        parts.push(xml);
      }
    }
    return parts.length ? `<${tag}>${parts.join("")}</${tag}>` : "";
  }

  private borderXml(tag: string, border: TableBorder): string {
    const type = border.type || "single";
    const size = border.size || "4";
    const color = hexColor(border.color) ?? "000000";
    return `<${tag} w:val="${type}" w:sz="${size}" w:space="0" w:color="${color}"/>`;
  }

  private twip(px: number): number {
    return Math.max(0, Math.round(px * 15));
  }
}
