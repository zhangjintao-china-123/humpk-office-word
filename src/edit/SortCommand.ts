import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import type { Table, TableRow } from "../model/table/Table";
import { CaretPos } from "../selection/CaretPos";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import { renumberStory } from "./OutlineNumbering";
import { headerRowCount } from "../layout/table/TableMetrics";

export type SortOrder = "asc" | "desc";
export type SortKind = "text" | "number" | "date";

export interface SortOptions {
  order: SortOrder;
  kind: SortKind;
  hasHeader?: boolean;
  columnIndex?: number;
}

export interface SortTargetInfo {
  mode: "table" | "paragraphs";
  count: number;
  columnCount: number;
  activeColumn: number;
  headerRows?: number;
}

const zhCollator = new Intl.Collator("zh-CN-u-co-pinyin", { numeric: true, sensitivity: "base" });

export function inspectSortTarget(ctx: EditContext, tableTarget?: { table: Table; colIndex: number }): SortTargetInfo {
  if (tableTarget) {
    return {
      mode: "table",
      count: tableTarget.table.rows.length,
      columnCount: Math.max(1, tableTarget.table.columnWidths.length || tableTarget.table.columns.length),
      activeColumn: tableTarget.colIndex,
      headerRows: headerRowCount(tableTarget.table),
    };
  }
  const range = ctx.selection.primaryRange()?.normalized();
  const document = range ? ctx.documentOf(range.story) : null;
  if (!document || !range) {
    return { mode: "paragraphs", count: 0, columnCount: 1, activeColumn: 0 };
  }
  const slice = paragraphSliceForSort(document, range.start.node?.data.paragraph, range.end.node?.data.paragraph, range.collapsed());
  return {
    mode: "paragraphs",
    count: slice.end - slice.start,
    columnCount: 1,
    activeColumn: 0,
  };
}

export class SortCommand implements EditCommand {
  private played = false;
  private tableHost: { table: Table; story: StoryRef; paragraph: Paragraph } | null = null;
  private beforeRows: TableRow[] = [];
  private afterRows: TableRow[] = [];

  private docTarget: { document: Document; story: StoryRef } | null = null;
  private beforeParagraphs: Paragraph[] = [];
  private afterParagraphs: Paragraph[] = [];
  private beforeCaret: CaretPos | null = null;

  constructor(
    private readonly ctx: EditContext,
    private readonly options: SortOptions,
    private readonly tableArg?: { table: Table; story: StoryRef; paragraph: Paragraph; colIndex: number },
  ) {}

  do(): void {
    if (this.played) {
      if (this.tableHost) {
        this.applyRows(this.afterRows);
      } else if (this.docTarget) {
        this.applyParagraphs(this.afterParagraphs);
      }
      return;
    }
    this.played = true;

    if (this.tableArg) {
      const { table, story, paragraph, colIndex } = this.tableArg;
      if (table.rows.length < 2 || table.rows.some((row) => row.cells.some((cell) => cell.rowSpan > 1))) {
        return;
      }
      this.tableHost = { table, story, paragraph };
      this.beforeRows = table.rows.slice();
      const headCount = Math.max(headerRowCount(table), Number(!!this.options.hasHeader));
      const head = table.rows.slice(0, headCount);
      const body = table.rows.slice(headCount);
      const columnCount = table.columnWidths.length || table.columns.length;
      const col = Math.max(0, Math.min(this.options.columnIndex ?? colIndex, columnCount - 1));
      const sortedBody = [...body].sort((a, b) =>
        compareSortValues(rowCellText(a, col), rowCellText(b, col), this.options.kind, this.options.order),
      );
      this.afterRows = [...head, ...sortedBody];
      this.applyRows(this.afterRows);
      return;
    }

    const range = this.ctx.selection.primaryRange()?.normalized();
    if (!range) {
      return;
    }
    const document = this.ctx.documentOf(range.story);
    if (!document) {
      return;
    }
    this.docTarget = { document, story: range.story };
    this.beforeCaret = this.ctx.selection.caret() ?? range.start;
    const all = document.paragraphs.toArray();
    const { start, end } = paragraphSliceForSort(
      document,
      range.start.node?.data.paragraph,
      range.end.node?.data.paragraph,
      range.collapsed(),
    );
    const slice = all.slice(start, end);
    if (slice.length < 2 || slice.some((p) => p.isTable)) {
      return;
    }
    this.beforeParagraphs = all;
    const headCount = this.options.hasHeader ? 1 : 0;
    const header = slice.slice(0, headCount);
    const body = slice.slice(headCount);
    const sortedBody = [...body].sort((a, b) =>
      compareSortValues(a.getFullText(), b.getFullText(), this.options.kind, this.options.order),
    );
    this.afterParagraphs = [
      ...all.slice(0, start),
      ...header,
      ...sortedBody,
      ...all.slice(end),
    ];
    this.applyParagraphs(this.afterParagraphs);
  }

  undo(): void {
    if (this.tableHost) {
      this.applyRows(this.beforeRows);
      return;
    }
    if (this.docTarget && this.beforeParagraphs.length) {
      this.applyParagraphs(this.beforeParagraphs, this.beforeCaret);
    }
  }

  private applyRows(rows: TableRow[]): void {
    if (!this.tableHost) {
      return;
    }
    const { table, story, paragraph } = this.tableHost;
    table.rows = rows.slice();
    rows.forEach((row, rIdx) => {
      row.cells.forEach((cell) => {
        cell.rowIndex = rIdx;
      });
    });
    paragraph.changed = true;
    const impact = new EditImpact(story, [paragraph], "split");
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }

  private applyParagraphs(order: Paragraph[], restoreCaret?: CaretPos | null): void {
    if (!this.docTarget || !order.length) {
      return;
    }
    const { document, story } = this.docTarget;
    document.paragraphs.clear();
    for (const p of order) {
      p.changed = true;
      document.addParagraph(p);
    }
    new WordStreamBuilder().buildStoryOnly(document);
    renumberStory(document);
    const impact = new EditImpact(story, order, "split");
    if (typeof this.ctx.relayout.layoutStory === "function") {
      this.ctx.relayout.layoutStory(story);
    } else {
      this.ctx.relayout.apply(impact);
    }
    if (restoreCaret?.node && restoreCaret.node.data.paragraph?.node) {
      this.ctx.selection.collapse(restoreCaret);
    } else if (document.words.head) {
      this.ctx.selection.collapse(new CaretPos(story, document.words.head, false));
    }
    this.ctx.afterEdit(impact);
  }
}

export function compareSortValues(a: string, b: string, kind: SortKind, order: SortOrder): number {
  const factor = order === "desc" ? -1 : 1;
  if (kind === "number") {
    const na = extractNumber(a);
    const nb = extractNumber(b);
    if (na != null && nb != null) {
      if (na !== nb) {
        return (na - nb) * factor;
      }
      return zhCollator.compare(a.trim(), b.trim()) * factor;
    }
    if (na != null) {
      return -1 * factor;
    }
    if (nb != null) {
      return 1 * factor;
    }
  } else if (kind === "date") {
    const da = extractDateMs(a);
    const db = extractDateMs(b);
    if (da != null && db != null) {
      if (da !== db) {
        return (da - db) * factor;
      }
      return zhCollator.compare(a.trim(), b.trim()) * factor;
    }
    if (da != null) {
      return -1 * factor;
    }
    if (db != null) {
      return 1 * factor;
    }
  }
  return zhCollator.compare(a.trim(), b.trim()) * factor;
}

function extractNumber(raw: string): number | null {
  const match = /-?\d+(?:,\d{3})*(?:\.\d+)?/.exec(raw.trim());
  if (!match) {
    return null;
  }
  const num = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function extractDateMs(raw: string): number | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const cn = /^(\d{4})年(\d{1,2})月(\d{1,2})日?/.exec(text);
  if (cn) {
    const ms = Date.UTC(Number(cn[1]), Number(cn[2]) - 1, Number(cn[3]));
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowCellText(row: TableRow, colIndex: number): string {
  const cell = row.cells.find((item) => item.colIndex <= colIndex && colIndex < item.colIndex + item.colSpan);
  if (!cell) {
    return "";
  }
  return cell.document.paragraphText().join(" ");
}

function paragraphSliceForSort(
  document: Document,
  startPara: Paragraph | null | undefined,
  endPara: Paragraph | null | undefined,
  collapsed: boolean,
): { start: number; end: number } {
  const all = document.paragraphs.toArray();
  if (!collapsed && startPara && endPara && startPara !== endPara) {
    const i0 = all.indexOf(startPara);
    const i1 = all.indexOf(endPara);
    if (i0 >= 0 && i1 >= i0) {
      return { start: i0, end: i1 + 1 };
    }
  }
  return { start: 0, end: all.length };
}
