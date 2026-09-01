import type { Document } from "../model/document/Document";
import type { Paragraph } from "../model/block/Paragraph";
import type { Table, TableCell } from "../model/table/Table";
import type { StoryEditor } from "../editor/StoryEditor";
import type { PageSetup } from "../render/page/PageSetup";
import { CELL_PAD, MIN_ROW_HEIGHT } from "../layout/LayoutConstants";
import { FallbackMeasurer } from "../layout/measure/FallbackMeasurer";
import { CanvasMeasurer } from "../layout/measure/CanvasMeasurer";
import type { ITextMeasurer } from "../layout/measure/ITextMeasurer";
import { StoryLayout } from "../layout/StoryLayout";
import { Draw } from "../render/canvas/Draw";
import type { StoryRef } from "../selection/StoryRef";
import type { EditImpact } from "./EditImpact";

export interface CellHost {
  table: Table;
  paragraph: Paragraph;
  parent: StoryRef;
}

export interface RelayoutHost {
  pageSetup: PageSetup;
  draw?: unknown;
  documentOf(story: StoryRef): Document | null;
  editorOf(story: StoryRef): StoryEditor | undefined;
  stories(): { story: StoryRef; document: Document }[];
  afterBodyLayout(pageCount: number): void;
  syncBandExtents?(): boolean;
}

export class Relayout {
  private readonly layout = new StoryLayout();

  constructor(private readonly host: RelayoutHost) {}

  apply(impact: EditImpact): boolean {
    let story = impact.story;
    let dirty = [...impact.dirty];
    let bubbled = false;

    while (dirty.length) {
      const document = this.host.documentOf(story);
      if (!document) {
        break;
      }
      const lines = this.layout.reflow(document, this.constraints(story), dirty);
      const editor = this.host.editorOf(story);
      if (editor) {
        editor.lines = lines;
      }
      if (story.slot !== "cell") {
        if (story.slot === "body") {
          this.host.afterBodyLayout(editor?.pageCount() ?? 1);
        } else if (this.host.syncBandExtents?.()) {
          this.relayoutBody();
        }
        break;
      }
      const host = this.findCellHost(story.cell);
      if (!host) {
        break;
      }
      const content = this.contentHeight(document);
      if (!this.growKnownCell(host, story.cell, content)) {
        break;
      }
      bubbled = true;
      host.paragraph.changed = true;
      story = host.parent;
      dirty = [host.paragraph];
    }
    return bubbled;
  }

  private relayoutBody(): void {
    const body = this.host.editorOf({ slot: "body" });
    const document = body?.document ?? this.host.documentOf({ slot: "body" });
    if (!body || !document) {
      return;
    }
    body.lines = this.layout.layout(document, this.constraints({ slot: "body" }));
    this.host.afterBodyLayout(body.pageCount());
  }

  findCellHost(cell: TableCell): CellHost | undefined {
    for (const entry of this.host.stories()) {
      const found = this.walkHost(entry.document, entry.story, cell);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private walkHost(document: Document, story: StoryRef, cell: TableCell): CellHost | undefined {
    let found: CellHost | undefined;
    document.paragraphs.each((node) => {
      const table = node.data.table;
      if (!table) {
        return undefined;
      }
      if (table.rows.some((row) => row.cells.includes(cell))) {
        found = { table, paragraph: node.data, parent: story };
        return true;
      }
      for (const row of table.rows) {
        for (const nested of row.cells) {
          const inner = this.walkHost(nested.document, { slot: "cell", cell: nested }, cell);
          if (inner) {
            found = inner;
            return true;
          }
        }
      }
      return undefined;
    });
    return found;
  }

  private growKnownCell(host: CellHost, cell: TableCell, contentHeight: number): boolean {
    const spanned = Math.max(1, cell.rowSpan);
    const current = this.sumRange(host.table.rowHeights, cell.rowIndex, spanned);
    const next = Math.max(MIN_ROW_HEIGHT * spanned, contentHeight + CELL_PAD * 2);
    if (next === current) {
      return false;
    }
    const heights = host.table.rowHeights;
    heights[cell.rowIndex] = (heights[cell.rowIndex] ?? MIN_ROW_HEIGHT) + (next - current);
    return true;
  }

  private contentHeight(document: Document): number {
    return document.paragraphs
      .toArray()
      .flatMap((paragraph) => paragraph.lines)
      .reduce((sum, line) => sum + line.height, 0);
  }

  private sumRange(heights: number[], start: number, count: number): number {
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      sum += heights[start + i] ?? 0;
    }
    return sum;
  }

  private constraints(story: StoryRef) {
    const measurer = this.measurer();
    if (story.slot === "cell") {
      const width = this.cellWidth(story.cell);
      return {
        contentWidth: Math.max(20, width - CELL_PAD * 2),
        contentHeight: Number.POSITIVE_INFINITY,
        linePitchPx: this.host.pageSetup.adjustLineHeightInTable ? this.host.pageSetup.linePitchPx : undefined,
        adjustLineHeightInTable: this.host.pageSetup.adjustLineHeightInTable,
        measurer,
        paginate: false as const,
      };
    }
    const editor = this.host.editorOf(story);
    if (editor) {
      return editor.constraints();
    }
    return {
      contentWidth: this.host.pageSetup.contentWidth,
      contentHeight: this.host.pageSetup.contentHeight,
      leftMargin: this.host.pageSetup.leftMargin,
      pageWidth: this.host.pageSetup.width,
      linePitchPx: this.host.pageSetup.linePitchPx,
      adjustLineHeightInTable: this.host.pageSetup.adjustLineHeightInTable,
      measurer,
      paginate: story.slot === "body",
    };
  }

  private cellWidth(cell: TableCell): number {
    const host = this.findCellHost(cell);
    if (!host) {
      return this.host.pageSetup.contentWidth;
    }
    let width = 0;
    for (let i = 0; i < cell.colSpan; i += 1) {
      width += host.table.columnWidths[cell.colIndex + i] ?? 0;
    }
    return width || this.host.pageSetup.contentWidth;
  }

  private measurer(): ITextMeasurer {
    return this.host.draw instanceof Draw ? new CanvasMeasurer(this.host.draw) : new FallbackMeasurer();
  }
}
