import type { Document } from "../document/Document";

export type TableBorderSide =
  | "top"
  | "left"
  | "bottom"
  | "right"
  | "insideH"
  | "insideV"
  | "tl2br"
  | "tr2bl";

export interface TableBorders {
  top?: TableBorder;
  left?: TableBorder;
  bottom?: TableBorder;
  right?: TableBorder;
  insideH?: TableBorder;
  insideV?: TableBorder;
  tl2br?: TableBorder;
  tr2bl?: TableBorder;
}

export interface TableBorder {
  type?: string;
  size?: string;
  color?: string;
}

/** dxa 的 value 已换成像素；pct 的 value 是百分比，100 表示整行宽。 */
export interface TableLength {
  type: "auto" | "dxa" | "pct";
  value: number;
}

export interface TableInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TableAnchor {
  leftFrom?: string;
  left?: number;
  leftAlign?: string;
  topFrom?: string;
  top?: number;
  topAlign?: string;
  distLeft?: number;
  distRight?: number;
  distTop?: number;
  distBottom?: number;
  allowOverlap?: boolean;
}

export class TableCell {
  colIndex = 0;
  rowIndex = 0;
  colSpan = 1;
  rowSpan = 1;
  borders?: TableBorders;
  fill?: string;
  /** 单元格首选宽度，盖过同一列的网格宽。 */
  width?: TableLength;
  vAlign?: "top" | "center" | "bottom";
  textDirection?: "tbRl" | "tbRlV";
  /** 有 tcMar 时整组替换表级边距。 */
  margin?: TableInsets;

  constructor(public document: Document) {}
}

export class TableRow {
  cells: TableCell[] = [];
  /** auto 跟内容；atLeast 不低于 height；exact 固定为 height。 */
  heightRule?: "auto" | "atLeast" | "exact";
  height = 0;
  header = false;
}

export class TableColumn {
  width = 0;
}

export class Table {
  columns: TableColumn[] = [];
  rows: TableRow[] = [];
  columnWidths: number[] = [];
  rowHeights: number[] = [];
  styleId?: string;
  borders?: TableBorders;
  anchorType?: "relative";
  anchorSet?: TableAnchor;
  /** 缺省按网格宽，超出版心再缩小。 */
  width?: TableLength;
  layout?: "fixed" | "autofit";
  align?: string;
  indent?: TableLength;
  /** 缺省时左右 108 twip、上下 0，和 Word 的单元格边距一致。 */
  cellMargin?: TableInsets;
}
