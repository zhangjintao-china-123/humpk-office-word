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

export interface TableAnchor {
  leftFrom?: string;
  left?: number;
  topFrom?: string;
  top?: number;
}

export class TableCell {
  colIndex = 0;
  rowIndex = 0;
  colSpan = 1;
  rowSpan = 1;
  borders?: TableBorders;

  constructor(public document: Document) {}
}

export class TableRow {
  cells: TableCell[] = [];
}

export class TableColumn {
  width = 0;
}

export class Table {
  columns: TableColumn[] = [];
  rows: TableRow[] = [];
  columnWidths: number[] = [];
  rowHeights: number[] = [];
  borders?: TableBorders;
  anchorType?: "relative";
  anchorSet?: TableAnchor;
}
