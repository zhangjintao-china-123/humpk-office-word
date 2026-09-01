import type { Document } from "../model/document/Document";
import type { HeaderFooterType } from "../model/document/DocumentKind";
import type { Line } from "../model/line/Line";
import type { Table, TableCell } from "../model/table/Table";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { StoryEditor } from "../editor/StoryEditor";
import type { PageOrigin } from "../editor/StoryEditor";
import type { PageSetup } from "../render/page/PageSetup";
import { TableGeometry, type TableCellBox } from "../render/table/TableGeometry";
import { CELL_PAD } from "../layout/LayoutConstants";
import { CaretPos } from "./CaretPos";
import { storyKind, type StoryRef } from "./StoryRef";

export interface HitContext {
  pageSetup: PageSetup;
  origins: PageOrigin[];
  body?: StoryEditor;
  header?: StoryEditor;
  footer?: StoryEditor;
  headers?: Partial<Record<HeaderFooterType, StoryEditor>>;
  footers?: Partial<Record<HeaderFooterType, StoryEditor>>;
  bandType?: (slot: "header" | "footer", pageIndex: number) => HeaderFooterType;
}

export interface CaretBox {
  x: number;
  y: number;
  height: number;
}

export class HitTester {
  private readonly tables = new TableGeometry();

  hit(worldX: number, worldY: number, ctx: HitContext): CaretPos | null {
    return (
      this.hitCells(worldX, worldY, ctx) ??
      this.hitBody(worldX, worldY, ctx) ??
      this.hitBand(worldX, worldY, ctx, "header") ??
      this.hitBand(worldX, worldY, ctx, "footer") ??
      this.hitNearestBody(worldX, worldY, ctx)
    );
  }

  wordBox(pos: CaretPos, ctx: HitContext): CaretBox & { width: number } | null {
    const located = this.locateNode(pos, ctx);
    if (!located) {
      return null;
    }
    const word = located.node.data;
    return {
      x: located.originX + word.left,
      y: located.originY,
      width: Math.max(word.kernedWidth, 2),
      height: Math.max(located.line.height, 14),
    };
  }

  caretBox(pos: CaretPos, ctx: HitContext): CaretBox | null {
    const located = this.locateNode(pos, ctx);
    if (!located) {
      return null;
    }
    const { line, originX, originY, node } = located;
    const word = node.data;
    const x = originX + (pos.after ? word.left + word.kernedWidth : word.left);
    const y = originY + line.beforeHeight + line.contentOffsetY;
    const height = Math.max(line.maxCharHeight, 14);
    return { x, y, height };
  }

  storyLines(story: StoryRef, ctx: HitContext): Line[] {
    if (story.slot === "body") {
      return ctx.body?.lines ?? [];
    }
    if (story.slot === "header" || story.slot === "footer") {
      return this.bandEditor(ctx, story.slot, storyKind(story))?.lines ?? [];
    }
    return story.cell.document.paragraphs.toArray().flatMap((paragraph) => paragraph.lines);
  }

  lineOf(pos: CaretPos, ctx: HitContext): Line | null {
    return this.locateNode(pos, ctx)?.line ?? null;
  }

  hitLine(line: Line, localX: number, story: StoryRef): CaretPos {
    return this.hitWords(line, localX, story);
  }

  lineOrigin(line: Line, story: StoryRef, ctx: HitContext): { x: number; y: number } | null {
    if (story.slot === "cell") {
      const box = this.cellBoxes(story.cell, ctx)[0];
      if (!box) {
        return null;
      }
      return { x: box.x + CELL_PAD, y: box.y + CELL_PAD + line.top };
    }
    if (!ctx.origins.length) {
      return null;
    }
    const pageH = ctx.pageSetup.contentHeight;
    if (story.slot === "body") {
      const pageIndex = Math.min(ctx.origins.length - 1, Math.floor(line.top / pageH));
      const origin = ctx.origins[pageIndex];
      return {
        x: origin.x + ctx.pageSetup.contentLeft(),
        y: origin.y + ctx.pageSetup.contentTop() + (line.top - pageIndex * pageH),
      };
    }
    const kind = storyKind(story);
    const slot = story.slot === "footer" ? "footer" : "header";
    let pageIndex = ctx.origins.findIndex((_, index) => (ctx.bandType?.(slot, index) ?? "default") === kind);
    if (pageIndex < 0) {
      pageIndex = 0;
    }
    const origin = ctx.origins[pageIndex];
    const left = origin.x + ctx.pageSetup.contentLeft();
    const top = origin.y + ctx.pageSetup.bandTop(slot);
    return { x: left, y: top + line.top };
  }

  cellBoxes(cell: TableCell, ctx: HitContext): TableCellBox[] {
    const found: TableCellBox[] = [];
    if (!ctx.body) {
      return found;
    }
    this.walkTables(ctx.body.lines, ctx, true, 0, 0, (box) => {
      if (box.cell === cell) {
        found.push(box);
      }
    });
    return found;
  }

  findTable(cell: TableCell, ctx: HitContext): Table | undefined {
    for (const editor of this.allEditors(ctx)) {
      const table = this.findTableIn(editor?.document ?? null, cell);
      if (table) {
        return table;
      }
    }
    return undefined;
  }

  cellsInRect(from: TableCell, to: TableCell, ctx: HitContext): TableCell[] {
    const table = this.findTable(from, ctx);
    if (!table || !this.tableHasCell(table, to)) {
      return from === to ? [from] : [];
    }
    const top = Math.min(from.rowIndex, to.rowIndex);
    const bottom = Math.max(from.rowIndex + from.rowSpan - 1, to.rowIndex + to.rowSpan - 1);
    const left = Math.min(from.colIndex, to.colIndex);
    const right = Math.max(from.colIndex + from.colSpan - 1, to.colIndex + to.colSpan - 1);
    const cells: TableCell[] = [];
    for (const row of table.rows) {
      for (const cell of row.cells) {
        const r1 = cell.rowIndex + cell.rowSpan - 1;
        const c1 = cell.colIndex + cell.colSpan - 1;
        if (cell.rowIndex <= bottom && r1 >= top && cell.colIndex <= right && c1 >= left) {
          cells.push(cell);
        }
      }
    }
    return cells;
  }

  private hitCells(worldX: number, worldY: number, ctx: HitContext): CaretPos | null {
    if (!ctx.body) {
      return null;
    }
    return this.hitTableLines(ctx.body.lines, ctx, true, 0, 0, worldX, worldY);
  }

  private hitTableLines(
    lines: Line[],
    ctx: HitContext,
    paginate: boolean,
    originX: number,
    originY: number,
    worldX: number,
    worldY: number,
  ): CaretPos | null {
    for (const placed of this.tablePlacements(lines, ctx, paginate, originX, originY)) {
      for (const box of placed.boxes) {
        if (!this.contains(worldX, worldY, box.x, box.y, box.width, box.height)) {
          continue;
        }
        const inner = this.storyLines({ slot: "cell", cell: box.cell }, ctx);
        const nested = this.hitTableLines(inner, ctx, false, box.x + CELL_PAD, box.y + CELL_PAD, worldX, worldY);
        if (nested) {
          return nested;
        }
        const localX = worldX - box.x - CELL_PAD;
        const localY = worldY - box.y - CELL_PAD;
        const story: StoryRef = { slot: "cell", cell: box.cell };
        return this.hitLines(inner, localX, localY, story) ?? this.fallbackLine(inner, localY, story);
      }
    }
    return null;
  }

  private walkTables(
    lines: Line[],
    ctx: HitContext,
    paginate: boolean,
    originX: number,
    originY: number,
    visit: (box: TableCellBox) => void,
  ): void {
    for (const placed of this.tablePlacements(lines, ctx, paginate, originX, originY)) {
      for (const box of placed.boxes) {
        visit(box);
        this.walkTables(
          this.storyLines({ slot: "cell", cell: box.cell }, ctx),
          ctx,
          false,
          box.x + CELL_PAD,
          box.y + CELL_PAD,
          visit,
        );
      }
    }
  }

  private tablePlacements(
    lines: Line[],
    ctx: HitContext,
    paginate: boolean,
    originX: number,
    originY: number,
  ): { line: Line; boxes: TableCellBox[] }[] {
    const placed: { line: Line; boxes: TableCellBox[] }[] = [];
    const pageH = ctx.pageSetup.contentHeight;
    for (const line of lines) {
      if (line.type !== "table" || !line.startNode?.data.table) {
        continue;
      }
      const table = line.startNode.data.table;
      let x = originX;
      let y = originY + line.top;
      if (paginate) {
        const pageIndex = Math.min(ctx.origins.length - 1, Math.floor(line.top / pageH));
        const origin = ctx.origins[pageIndex];
        x = origin.x + ctx.pageSetup.contentLeft();
        y = origin.y + ctx.pageSetup.contentTop() + (line.top - pageIndex * pageH);
      }
      placed.push({
        line,
        boxes: this.tables.boxesInSlice(
          table,
          line.tableRowFrom,
          line.tableRowTo || table.rows.length,
          x,
          y,
        ),
      });
    }
    return placed;
  }

  private hitBody(worldX: number, worldY: number, ctx: HitContext): CaretPos | null {
    if (!ctx.body) {
      return null;
    }
    const pageH = ctx.pageSetup.contentHeight;
    const story: StoryRef = { slot: "body" };
    for (const line of ctx.body.lines) {
      if (line.type === "table" || line.type === "page") {
        continue;
      }
      const pageIndex = Math.min(ctx.origins.length - 1, Math.floor(line.top / pageH));
      const origin = ctx.origins[pageIndex];
      const x = origin.x + ctx.pageSetup.contentLeft();
      const y = origin.y + ctx.pageSetup.contentTop() + (line.top - pageIndex * pageH);
      if (!this.contains(worldX, worldY, x, y, ctx.pageSetup.contentWidth, line.height)) {
        continue;
      }
      return this.hitWords(line, worldX - x, story);
    }
    return null;
  }

  private hitNearestBody(worldX: number, worldY: number, ctx: HitContext): CaretPos | null {
    const page = this.pageAt(worldX, worldY, ctx);
    if (!page || !ctx.body) {
      return null;
    }
    const pageH = ctx.pageSetup.contentHeight;
    const storyY = page.index * pageH + (worldY - page.origin.y - ctx.pageSetup.contentTop());
    let best: Line | null = null;
    let dist = Number.POSITIVE_INFINITY;
    for (const line of ctx.body.lines) {
      if (line.type === "table" || line.type === "page") {
        continue;
      }
      const mid = line.top + line.height / 2;
      const d = Math.abs(mid - storyY);
      if (d < dist) {
        dist = d;
        best = line;
      }
    }
    if (!best) {
      return null;
    }
    const localX = worldX - page.origin.x - ctx.pageSetup.contentLeft();
    return this.hitWords(best, localX, { slot: "body" });
  }

  private hitBand(worldX: number, worldY: number, ctx: HitContext, slot: "header" | "footer"): CaretPos | null {
    for (let i = 0; i < ctx.origins.length; i += 1) {
      const type = ctx.bandType?.(slot, i) ?? "default";
      const editor = this.bandEditor(ctx, slot, type);
      if (!editor) {
        continue;
      }
      const origin = ctx.origins[i];
      const left = origin.x + ctx.pageSetup.contentLeft();
      const top = origin.y + ctx.pageSetup.bandTop(slot);
      const story: StoryRef = { slot, kind: type };
      for (const line of editor.lines) {
        if (!this.contains(worldX, worldY, left, top + line.top, ctx.pageSetup.contentWidth, line.height)) {
          continue;
        }
        return this.hitWords(line, worldX - left, story);
      }
    }
    return null;
  }

  private bandEditor(
    ctx: HitContext,
    slot: "header" | "footer",
    type: HeaderFooterType,
  ): StoryEditor | undefined {
    const mapped = slot === "header" ? ctx.headers?.[type] : ctx.footers?.[type];
    if (mapped) {
      return mapped;
    }
    if (type === "default") {
      return slot === "header" ? ctx.header : ctx.footer;
    }
    return undefined;
  }

  private allEditors(ctx: HitContext): Array<StoryEditor | undefined> {
    return [
      ctx.body,
      ctx.header,
      ctx.footer,
      ...Object.values(ctx.headers ?? {}),
      ...Object.values(ctx.footers ?? {}),
    ];
  }

  private hitLines(lines: Line[], localX: number, localY: number, story: StoryRef): CaretPos | null {
    for (const line of lines) {
      if (localY >= line.top && localY <= line.top + line.height) {
        return this.hitWords(line, localX, story);
      }
    }
    return null;
  }

  private fallbackLine(lines: Line[], localY: number, story: StoryRef): CaretPos | null {
    const line = lines.at(-1);
    if (!line) {
      return new CaretPos(story, null, false);
    }
    return this.hitWords(line, localY < line.top ? 0 : Number.POSITIVE_INFINITY, story);
  }

  private hitWords(line: Line, localX: number, story: StoryRef): CaretPos {
    let node = line.startNode;
    let lastText: LinkedNode<Word> | null = null;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      const word = node.data;
      if (word.kind === "text" && word.isEnterChar()) {
        return new CaretPos(story, node, false);
      }
      const start = word.left;
      const end = word.left + Math.max(word.kernedWidth, 0);
      if (localX < start + (end - start) / 2) {
        return new CaretPos(story, node, false);
      }
      if (localX < end) {
        return new CaretPos(story, node, true);
      }
      if (word.kind === "text" || word.kind === "drawing") {
        lastText = node;
      }
      node = node.next;
    }
    if (lastText) {
      return new CaretPos(story, lastText, true);
    }
    return new CaretPos(story, line.startNode, false);
  }

  private locateNode(
    pos: CaretPos,
    ctx: HitContext,
  ): { line: Line; originX: number; originY: number; node: LinkedNode<Word> } | null {
    if (!pos.node) {
      return null;
    }
    const line = this.lineContaining(this.storyLines(pos.story, ctx), pos.node);
    if (!line) {
      return null;
    }
    const origin = this.lineOrigin(line, pos.story, ctx);
    if (!origin) {
      return null;
    }
    return { line, originX: origin.x, originY: origin.y, node: pos.node };
  }

  private lineContaining(lines: Line[], node: LinkedNode<Word>): Line | null {
    for (const line of lines) {
      let current = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        if (current === node) {
          return line;
        }
        current = current?.next ?? null;
      }
    }
    return null;
  }

  private pageAt(
    worldX: number,
    worldY: number,
    ctx: HitContext,
  ): { origin: PageOrigin; index: number } | null {
    for (let i = 0; i < ctx.origins.length; i += 1) {
      const origin = ctx.origins[i];
      if (this.contains(worldX, worldY, origin.x, origin.y, ctx.pageSetup.width, ctx.pageSetup.height)) {
        return { origin, index: i };
      }
    }
    return null;
  }

  private findTableIn(document: Document | null, cell: TableCell): Table | undefined {
    if (!document) {
      return undefined;
    }
    let found: Table | undefined;
    document.paragraphs.each((node) => {
      const table = node.data.table;
      if (!table) {
        return undefined;
      }
      if (this.tableHasCell(table, cell)) {
        found = table;
        return true;
      }
      for (const row of table.rows) {
        for (const nested of row.cells) {
          found = this.findTableIn(nested.document, cell);
          if (found) {
            return true;
          }
        }
      }
      return undefined;
    });
    return found;
  }

  private tableHasCell(table: Table, cell: TableCell): boolean {
    return table.rows.some((row) => row.cells.includes(cell));
  }

  private contains(x: number, y: number, left: number, top: number, width: number, height: number): boolean {
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }
}
