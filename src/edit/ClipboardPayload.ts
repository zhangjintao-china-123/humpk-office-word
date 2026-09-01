import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { RunStyle } from "../model/style/RunStyle";
import type { TableBorders } from "../model/table/Table";

export interface ClipboardRun {
  text: string;
  style: RunStyle;
}

export interface ClipboardParagraph {
  attrs: ParagraphAttrs;
  inheritedRunStyle?: RunStyle;
  runs: ClipboardRun[];
}

export interface ClipboardTableCell {
  colSpan: number;
  rowSpan: number;
  borders?: TableBorders;
  paragraphs: ClipboardParagraph[];
}

export interface ClipboardTableRow {
  cells: ClipboardTableCell[];
}

export interface ClipboardTable {
  columnWidths: number[];
  borders?: TableBorders;
  rows: ClipboardTableRow[];
}

export class ClipboardPayload {
  constructor(
    readonly text: string,
    readonly paragraphs: ClipboardParagraph[],
    readonly table?: ClipboardTable,
  ) {}

  static plain(text: string): ClipboardPayload {
    if (!text) {
      return new ClipboardPayload("", []);
    }
    return new ClipboardPayload(text, [{ attrs: {}, runs: [{ text, style: {} }] }]);
  }

  get empty(): boolean {
    return !this.text && !this.table;
  }
}
