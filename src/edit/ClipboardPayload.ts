import { Drawing } from "../model/inline/Drawing";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { RunStyle } from "../model/style/RunStyle";
import type { TableBorders } from "../model/table/Table";

export interface ClipboardDrawing {
  url?: string;
  sourceUrl?: string;
  width: number;
  height: number;
  lockAspect?: boolean;
}

export interface ClipboardRun {
  text: string;
  style: RunStyle;
  drawing?: ClipboardDrawing;
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

  static picture(drawing: Drawing | ClipboardDrawing): ClipboardPayload {
    const snap = drawing instanceof Drawing ? snapshotDrawing(drawing) : drawing;
    return new ClipboardPayload("\uFFFC", [{ attrs: {}, runs: [{ text: "", style: {}, drawing: snap }] }]);
  }

  get empty(): boolean {
    return !this.text && !this.table && !this.paragraphs.some((paragraph) => paragraph.runs.some((run) => run.drawing));
  }
}

export function snapshotDrawing(drawing: Drawing): ClipboardDrawing {
  return {
    url: drawing.url,
    sourceUrl: drawing.sourceUrl ?? drawing.url,
    width: drawing.width,
    height: drawing.height,
    lockAspect: drawing.lockAspect !== false,
  };
}

export function drawingFromSnapshot(snap: ClipboardDrawing): Drawing {
  const drawing = new Drawing();
  drawing.url = snap.url;
  drawing.sourceUrl = snap.sourceUrl ?? snap.url;
  drawing.width = snap.width;
  drawing.height = snap.height;
  drawing.position = "inline";
  drawing.lockAspect = snap.lockAspect !== false;
  return drawing;
}
