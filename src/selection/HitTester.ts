import type { Block } from "../model/block/Block";
import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import type { HeaderFooterType } from "../model/document/DocumentKind";
import type { Line } from "../model/line/Line";
import type { Table, TableCell } from "../model/table/Table";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Drawing } from "../model/inline/Drawing";
import type { Word } from "../model/inline/Word";
import type { StoryEditor } from "../editor/StoryEditor";
import type { PageOrigin } from "../editor/StoryEditor";
import type { PageSetup } from "../render/page/PageSetup";
import { cellVisibleRect, TableGeometry, type TableCellBox } from "../render/table/TableGeometry";
import { cellContentOrigin, cellDocumentHeight } from "../layout/table/TableMetrics";
import { CaretPos } from "./CaretPos";
import { storyKind, storySection, type StoryRef } from "./StoryRef";
import { guidesFromBoxes, pickGuide, type TableGuide, type TableGuideKind } from "./TableGuides";

export interface HitContext {
  pageSetup: PageSetup;
  origins: PageOrigin[];
  body?: StoryEditor;
  header?: StoryEditor;
  footer?: StoryEditor;
  headers?: Partial<Record<HeaderFooterType, StoryEditor>>;
  footers?: Partial<Record<HeaderFooterType, StoryEditor>>;
  bandType?: (slot: "header" | "footer", pageIndex: number) => HeaderFooterType;
  bandAt?: (slot: "header" | "footer", pageIndex: number) => BandHit;
}

export interface BandHit {
  type: HeaderFooterType;
  sectionIndex: number;
  editor?: StoryEditor;
}

export interface CaretBox {
  x: number;
  y: number;
  height: number;
}

export const TABLE_HANDLE = 14;

export interface TableHandle {
  story: StoryRef;
  node: LinkedNode<Word>;
  x: number;
  y: number;
  size: number;
}

export interface PictureBox {
  drawing: Drawing;
  paragraph: Paragraph;
  story: StoryRef;
  node?: LinkedNode<Word>;
  x: number;
  y: number;
  width: number;
  height: number;
  behind: boolean;
}

export class HitTester {
  private readonly tables = new TableGeometry();

  hit(worldX: number, worldY: number, ctx: HitContext): CaretPos | null {
    const handle = this.tableHandleAt(worldX, worldY, ctx);
    if (handle?.node) {
      return new CaretPos(handle.story, handle.node, false);
    }
    return (
      this.hitTextBoxes(worldX, worldY, ctx) ??
      this.hitCells(worldX, worldY, ctx) ??
      this.hitBody(worldX, worldY, ctx) ??
      this.hitBand(worldX, worldY, ctx, "header") ??
      this.hitBand(worldX, worldY, ctx, "footer") ??
      this.hitNearestBody(worldX, worldY, ctx)
    );
  }

  pictures(ctx: HitContext): PictureBox[] {
    const found: PictureBox[] = [];
    const seen = new Set<StoryEditor>();
    const add = (editor: StoryEditor | undefined, story: StoryRef) => {
      if (!editor || seen.has(editor)) {
        return;
      }
      seen.add(editor);
      this.collectPictures(editor, story, ctx, found);
    };
    if (ctx.body) {
      add(ctx.body, { slot: "body" });
    }
    for (const kind of ["default", "first", "even"] as const) {
      const header = ctx.headers?.[kind] ?? (kind === "default" ? ctx.header : undefined);
      if (header) {
        add(header, this.storyForEditor(header, ctx));
      }
      const footer = ctx.footers?.[kind] ?? (kind === "default" ? ctx.footer : undefined);
      if (footer) {
        add(footer, this.storyForEditor(footer, ctx));
      }
    }
    return found;
  }

  pictureAt(worldX: number, worldY: number, ctx: HitContext): PictureBox | null {
    const pictures = this.pictures(ctx);
    for (let i = pictures.length - 1; i >= 0; i -= 1) {
      const box = pictures[i];
      if (this.contains(worldX, worldY, box.x, box.y, box.width, box.height)) {
        return box;
      }
    }
    return null;
  }

  /** 表格第一页左上角外侧的小方块，用来选中整张表。 */
  tableHandles(ctx: HitContext): TableHandle[] {
    const found: TableHandle[] = [];
    if (ctx.body) {
      this.collectHandles(ctx.body.lines, { slot: "body" }, ctx, true, 0, 0, found);
    }
    return found;
  }

  private tableHandleAt(worldX: number, worldY: number, ctx: HitContext): TableHandle | null {
    for (const handle of this.tableHandles(ctx)) {
      if (this.contains(worldX, worldY, handle.x, handle.y, handle.size, handle.size)) {
        return handle;
      }
    }
    return null;
  }

  /** 指针靠近表格竖线或横线时，返回可以拖的那一条。嵌套表优先。 */
  tableGuide(worldX: number, worldY: number, ctx: HitContext, slop: number): TableGuide | null {
    const best: { current: { guide: TableGuide; dist: number; depth: number } | null } = { current: null };
    const take = (guide: TableGuide | null, dist: number, depth: number) => {
      if (!guide) {
        return;
      }
      const current = best.current;
      const closer = current == null || dist < current.dist - 0.01;
      const nested = current != null && Math.abs(dist - current.dist) <= 0.01 && depth > current.depth;
      if (closer || nested) {
        best.current = { guide, dist, depth };
      }
    };
    const visit = (lines: Line[], story: StoryRef, paginate: boolean, originX: number, originY: number, depth: number) => {
      for (const line of lines) {
        const table = line.startNode?.data.table;
        const paragraph = line.paragraph;
        const boxes = this.placeTableLine(line, ctx, paginate, originX, originY);
        if (!table || !paragraph || !boxes) {
          continue;
        }
        const found = pickGuide(guidesFromBoxes(boxes), worldX, worldY, slop);
        if (found) {
          take(guideFromLine(table, story, paragraph, line, found.segment.kind, found.segment.index), found.dist, depth);
        }
        for (const box of boxes) {
          const nested: StoryRef = { slot: "cell", cell: box.cell };
          const inner = this.storyLines(nested, ctx);
          const origin = cellContentOrigin(table, box, cellDocumentHeight(box.cell.document));
          visit(inner, nested, false, origin.x, origin.y, depth + 1);
        }
      }
    };
    if (ctx.body) {
      visit(ctx.body.lines, { slot: "body" }, true, 0, 0, 0);
    }
    for (const slot of ["header", "footer"] as const) {
      for (let i = 0; i < ctx.origins.length; i += 1) {
        const at = ctx.bandAt?.(slot, i);
        const type = at?.type ?? ctx.bandType?.(slot, i) ?? "default";
        const editor = at?.editor ?? this.bandEditor(ctx, slot, type);
        const origin = ctx.origins[i];
        if (!editor || !origin) {
          continue;
        }
        const story: StoryRef = { slot, kind: type, sectionIndex: at?.sectionIndex ?? 0 };
        visit(
          editor.lines,
          story,
          false,
          origin.x + ctx.pageSetup.contentLeft(),
          origin.y + ctx.pageSetup.bandTop(slot),
          0,
        );
      }
    }
    return best.current?.guide ?? null;
  }

  private collectPictures(editor: StoryEditor, story: StoryRef, ctx: HitContext, found: PictureBox[]): void {
    const document = editor.document;
    if (!document) {
      return;
    }
    this.collectInlinePictures(editor.lines, story, ctx, found);
    this.collectCellPictures(editor.lines, ctx, found);
    this.collectAnchorPictures(editor, story, ctx, found);
  }

  private collectInlinePictures(lines: Line[], story: StoryRef, ctx: HitContext, found: PictureBox[]): void {
    for (const line of lines) {
      if (line.type === "table" || line.type === "page") {
        continue;
      }
      const origin = this.lineOrigin(line, story, ctx);
      if (!origin) {
        continue;
      }
      let node = line.startNode;
      for (let i = 0; i < line.length && node; i += 1) {
        const drawing = node.data.drawing;
        if (node.data.kind === "drawing" && drawing && !node.data.block?.math && node.data.paragraph) {
          found.push({
            drawing,
            paragraph: node.data.paragraph,
            story,
            node,
            x: origin.x + node.data.left,
            y: origin.y + line.beforeHeight + line.contentOffsetY,
            width: Math.max(drawing.width, 1),
            height: Math.max(drawing.height, 1),
            behind: false,
          });
        }
        node = node.next;
      }
    }
  }

  private collectCellPictures(lines: Line[], ctx: HitContext, found: PictureBox[]): void {
    for (const line of lines) {
      if (line.type !== "table") {
        continue;
      }
      const boxes = this.placeTableLine(line, ctx, true, 0, 0);
      if (!boxes) {
        continue;
      }
      const table = line.startNode?.data.table;
      for (const box of boxes) {
        const nested: StoryRef = { slot: "cell", cell: box.cell };
        const inner = this.storyLines(nested, ctx);
        this.collectInlinePictures(inner, nested, ctx, found);
        if (!table) {
          continue;
        }
        const origin = cellContentOrigin(table, box, cellDocumentHeight(box.cell.document));
        for (const anchor of box.cell.document.anchors) {
          if (anchor.drawing.shape?.text || !anchor.paragraph) {
            continue;
          }
          found.push({
            drawing: anchor.drawing,
            paragraph: anchor.paragraph,
            story: nested,
            x: origin.x + anchor.x,
            y: origin.y + anchor.y,
            width: Math.max(anchor.width, 1),
            height: Math.max(anchor.height, 1),
            behind: anchor.behind,
          });
        }
      }
    }
  }

  private collectAnchorPictures(editor: StoryEditor, story: StoryRef, ctx: HitContext, found: PictureBox[]): void {
    const document = editor.document;
    if (!document) {
      return;
    }
    const pageH = Math.max(1, ctx.pageSetup.contentHeight);
    for (const anchor of document.anchors) {
      if (anchor.drawing.shape?.text || !anchor.paragraph) {
        continue;
      }
      const pageIndex = Math.min(ctx.origins.length - 1, Math.max(0, Math.floor(anchor.y / pageH)));
      const origin = ctx.origins[pageIndex];
      if (!origin) {
        continue;
      }
      const x = origin.x + ctx.pageSetup.contentLeft() + anchor.x;
      const y =
        editor.slot === "header" || editor.slot === "footer"
          ? origin.y + ctx.pageSetup.bandTop(editor.slot) + anchor.y
          : origin.y + ctx.pageSetup.contentTop() + (anchor.y - pageIndex * pageH);
      found.push({
        drawing: anchor.drawing,
        paragraph: anchor.paragraph,
        story,
        x,
        y,
        width: Math.max(anchor.width, 1),
        height: Math.max(anchor.height, 1),
        behind: anchor.behind,
      });
    }
  }

  worldToStory(worldX: number, worldY: number, ctx: HitContext): { x: number; y: number } | null {
    const page = this.pageAt(worldX, worldY, ctx);
    if (!page) {
      return null;
    }
    const pageH = Math.max(1, ctx.pageSetup.contentHeight);
    return {
      x: worldX - page.origin.x - ctx.pageSetup.contentLeft(),
      y: page.index * pageH + (worldY - page.origin.y - ctx.pageSetup.contentTop()),
    };
  }

  private collectHandles(
    lines: Line[],
    story: StoryRef,
    ctx: HitContext,
    paginate: boolean,
    originX: number,
    originY: number,
    found: TableHandle[],
  ): void {
    for (const placed of this.tablePlacements(lines, ctx, paginate, originX, originY)) {
      if (
        placed.boxes.length &&
        placed.line.tableRowFrom <= 0 &&
        placed.line.tableClipTop <= 0 &&
        placed.line.startNode
      ) {
        const left = Math.min(...placed.boxes.map((box) => box.x));
        const top = Math.min(...placed.boxes.map((box) => box.visibleY ?? box.y));
        found.push({
          story,
          node: placed.line.startNode,
          x: left - TABLE_HANDLE - 2,
          y: top - TABLE_HANDLE - 2,
          size: TABLE_HANDLE,
        });
      }
      for (const box of placed.boxes) {
        const nested: StoryRef = { slot: "cell", cell: box.cell };
        const inner = this.storyLines(nested, ctx);
        const origin = cellContentOrigin(placed.line.startNode?.data.table, box, cellDocumentHeight(box.cell.document));
        this.collectHandles(inner, nested, ctx, false, origin.x, origin.y, found);
      }
    }
  }

  locateBand(
    worldX: number,
    worldY: number,
    ctx: HitContext,
  ): { slot: "header" | "footer"; pageIndex: number; type: HeaderFooterType; sectionIndex: number } | null {
    for (let pageIndex = 0; pageIndex < ctx.origins.length; pageIndex += 1) {
      const origin = ctx.origins[pageIndex];
      const localX = worldX - origin.x;
      const localY = worldY - origin.y;
      if (localX < 0 || localX > ctx.pageSetup.width || localY < 0 || localY > ctx.pageSetup.height) {
        continue;
      }
      let slot: "header" | "footer" | null = null;
      if (localY >= ctx.pageSetup.headerFromEdge && localY < ctx.pageSetup.contentTop()) {
        slot = "header";
      } else if (localY > ctx.pageSetup.contentBottom() && localY <= ctx.pageSetup.height) {
        slot = "footer";
      }
      if (!slot) {
        return null;
      }
      const at = ctx.bandAt?.(slot, pageIndex);
      return {
        slot,
        pageIndex,
        type: at?.type ?? ctx.bandType?.(slot, pageIndex) ?? "default",
        sectionIndex: at?.sectionIndex ?? 0,
      };
    }
    return null;
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
    const span = caretSpan(line, word);
    return { x, y: originY + span.top, height: span.height };
  }

  storyLines(story: StoryRef, ctx: HitContext): Line[] {
    if (story.slot === "body") {
      return ctx.body?.lines ?? [];
    }
    if (story.slot === "header" || story.slot === "footer") {
      return this.resolveBand(ctx, story)?.lines ?? [];
    }
    if (story.slot === "textbox") {
      const inner = story.block.drawing?.shape?.text;
      return inner?.paragraphs.toArray().flatMap((paragraph) => paragraph.lines) ?? [];
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
    if (story.slot === "textbox") {
      const frame = this.textboxFrames(ctx).find((item) => item.block === story.block);
      if (!frame) {
        return null;
      }
      return { x: frame.x + frame.insetLeft, y: frame.y + frame.insetTop + line.top };
    }
    if (story.slot === "cell") {
      const boxes = this.cellBoxes(story.cell, ctx);
      const table = this.findTable(story.cell, ctx);
      const contentH = cellDocumentHeight(story.cell.document);
      const box = boxes.find((item) => this.lineHitsSlice(item, line, table, contentH)) ?? boxes[0];
      if (!box) {
        return null;
      }
      const origin = cellContentOrigin(table, box, contentH);
      return { x: origin.x, y: origin.y + line.top };
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
    const sectionIndex = storySection(story);
    const slot = story.slot === "footer" ? "footer" : "header";
    let pageIndex = ctx.origins.findIndex((_, index) => {
      const at = ctx.bandAt?.(slot, index);
      if (at) {
        return at.type === kind && at.sectionIndex === sectionIndex;
      }
      return (ctx.bandType?.(slot, index) ?? "default") === kind;
    });
    if (pageIndex < 0) {
      pageIndex = 0;
    }
    const origin = ctx.origins[pageIndex];
    const left = origin.x + ctx.pageSetup.contentLeft();
    const top = origin.y + ctx.pageSetup.bandTop(slot);
    return { x: left, y: top + line.top };
  }

  private lineHitsSlice(box: TableCellBox, line: Line, table: Table | undefined, contentH: number): boolean {
    const origin = cellContentOrigin(table, box, contentH);
    const top = origin.y + line.top;
    const bottom = top + Math.max(line.height, 1);
    const visTop = box.visibleY ?? box.y;
    const visBottom = visTop + (box.visibleHeight ?? box.height);
    return bottom > visTop + 0.5 && top < visBottom - 0.5;
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

  private hitTextBoxes(worldX: number, worldY: number, ctx: HitContext): CaretPos | null {
    const frames = this.textboxFrames(ctx);
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      const frame = frames[i];
      if (!this.contains(worldX, worldY, frame.x, frame.y, frame.width, frame.height)) {
        continue;
      }
      const story: StoryRef = { slot: "textbox", block: frame.block };
      const lines = this.storyLines(story, ctx);
      const localX = worldX - frame.x - frame.insetLeft;
      const localY = worldY - frame.y - frame.insetTop;
      return this.hitLines(lines, localX, localY, story) ?? this.fallbackLine(lines, localY, story);
    }
    return null;
  }

  private textboxFrames(ctx: HitContext): TextboxFrame[] {
    const frames: TextboxFrame[] = [];
    for (const editor of this.allEditors(ctx)) {
      if (!editor?.document) {
        continue;
      }
      this.scanLines(editor.lines, this.storyForEditor(editor, ctx), ctx, frames);
      this.scanAnchors(editor, ctx, frames);
    }
    if (ctx.body) {
      this.scanCellLines(ctx.body.lines, ctx, true, 0, 0, frames);
    }
    return frames;
  }

  private scanCellLines(
    lines: Line[],
    ctx: HitContext,
    paginate: boolean,
    originX: number,
    originY: number,
    frames: TextboxFrame[],
  ): void {
    for (const placed of this.tablePlacements(lines, ctx, paginate, originX, originY)) {
      for (const box of placed.boxes) {
        const story: StoryRef = { slot: "cell", cell: box.cell };
        const inner = this.storyLines(story, ctx);
        this.scanLines(inner, story, ctx, frames);
        const origin = cellContentOrigin(placed.line.startNode?.data.table, box, cellDocumentHeight(box.cell.document));
        this.scanCellLines(inner, ctx, false, origin.x, origin.y, frames);
      }
    }
  }

  private scanLines(lines: Line[], story: StoryRef, ctx: HitContext, frames: TextboxFrame[]): void {
    for (const line of lines) {
      if (line.type === "table" || line.type === "page") {
        continue;
      }
      let node = line.startNode;
      let hasBox = false;
      for (let i = 0; i < line.length && node; i += 1) {
        if (node.data.block?.drawing?.shape?.text) {
          hasBox = true;
          break;
        }
        node = node.next;
      }
      if (!hasBox) {
        continue;
      }
      const origin = this.lineOrigin(line, story, ctx);
      if (!origin) {
        continue;
      }
      node = line.startNode;
      for (let i = 0; i < line.length && node; i += 1) {
        const block = node.data.block;
        if (node.data.kind === "drawing" && block) {
          const frame = textboxFrame(block, origin.x + node.data.left, origin.y + line.beforeHeight + line.contentOffsetY);
          if (frame) {
            frames.push(frame);
          }
        }
        node = node.next;
      }
    }
  }

  private storyForEditor(editor: StoryEditor, ctx: HitContext): StoryRef {
    const slot = editor.slot ?? "body";
    if (slot === "body") {
      return { slot: "body" };
    }
    for (let i = 0; i < ctx.origins.length; i += 1) {
      const at = ctx.bandAt?.(slot, i);
      if (at?.editor === editor) {
        return { slot, kind: at.type, sectionIndex: at.sectionIndex };
      }
    }
    const mapped = slot === "header" ? ctx.headers : ctx.footers;
    for (const kind of ["default", "first", "even"] as const) {
      if (mapped?.[kind] === editor) {
        return { slot, kind, sectionIndex: 0 };
      }
    }
    return { slot, kind: "default", sectionIndex: 0 };
  }

  private scanAnchors(editor: StoryEditor, ctx: HitContext, frames: TextboxFrame[]): void {
    const document = editor.document;
    if (!document) {
      return;
    }
    for (const anchor of document.anchors) {
      const block = blockForDrawing(document, anchor.drawing);
      if (!block) {
        continue;
      }
      if (editor.slot !== "header" && editor.slot !== "footer") {
        const pageH = ctx.pageSetup.contentHeight;
        const pageIndex = Math.min(ctx.origins.length - 1, Math.max(0, Math.floor(anchor.y / pageH)));
        const origin = ctx.origins[pageIndex];
        if (!origin) {
          continue;
        }
        const frame = textboxFrame(
          block,
          origin.x + ctx.pageSetup.contentLeft() + anchor.x,
          origin.y + ctx.pageSetup.contentTop() + (anchor.y - pageIndex * pageH),
        );
        if (frame) {
          frames.push(frame);
        }
        continue;
      }
      for (let i = 0; i < ctx.origins.length; i += 1) {
        const at = ctx.bandAt?.(editor.slot, i);
        const type = at?.type ?? ctx.bandType?.(editor.slot, i) ?? "default";
        const shown = at?.editor ?? this.bandEditor(ctx, editor.slot, type);
        if (shown !== editor) {
          continue;
        }
        const origin = ctx.origins[i];
        const frame = textboxFrame(
          block,
          origin.x + ctx.pageSetup.contentLeft() + anchor.x,
          origin.y + ctx.pageSetup.bandTop(editor.slot) + anchor.y,
        );
        if (frame) {
          frames.push(frame);
        }
      }
    }
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
        const rect = cellVisibleRect(box);
        if (rect.height <= 0 || !this.contains(worldX, worldY, rect.x, rect.y, rect.width, rect.height)) {
          continue;
        }
        const story: StoryRef = { slot: "cell", cell: box.cell };
        const inner = this.storyLines(story, ctx);
        const origin = cellContentOrigin(placed.line.startNode?.data.table, box, cellDocumentHeight(box.cell.document));
        const nested = this.hitTableLines(inner, ctx, false, origin.x, origin.y, worldX, worldY);
        if (nested) {
          return nested;
        }
        const localX = worldX - origin.x;
        const localY = worldY - origin.y;
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
        const inner = this.storyLines({ slot: "cell", cell: box.cell }, ctx);
        const origin = cellContentOrigin(placed.line.startNode?.data.table, box, cellDocumentHeight(box.cell.document));
        this.walkTables(inner, ctx, false, origin.x, origin.y, visit);
      }
    }
  }

  private placeTableLine(
    line: Line,
    ctx: HitContext,
    paginate: boolean,
    originX: number,
    originY: number,
  ): TableCellBox[] | null {
    const table = line.startNode?.data.table;
    if (line.type !== "table" || !table) {
      return null;
    }
    let x = originX + line.leftBlankWidth;
    let y = originY + line.top;
    if (paginate) {
      const pageH = ctx.pageSetup.contentHeight;
      const pageIndex = Math.min(ctx.origins.length - 1, Math.floor(line.top / pageH));
      const origin = ctx.origins[pageIndex];
      if (!origin) {
        return null;
      }
      x = origin.x + ctx.pageSetup.contentLeft() + line.leftBlankWidth;
      y = origin.y + ctx.pageSetup.contentTop() + (line.top - pageIndex * pageH);
    }
    return this.tables.boxesForSlice(
      table,
      line.tableRowFrom,
      line.tableRowTo || table.rows.length,
      line.tableHeaderRows,
      x,
      y,
      line.tableClipTop,
      line.height,
    );
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
        x = origin.x + ctx.pageSetup.contentLeft() + line.leftBlankWidth;
        y = origin.y + ctx.pageSetup.contentTop() + (line.top - pageIndex * pageH);
      }
      placed.push({
        line,
        boxes: this.tables.boxesForSlice(
          table,
          line.tableRowFrom,
          line.tableRowTo || table.rows.length,
          line.tableHeaderRows,
          x,
          y,
          line.tableClipTop,
          line.height,
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
    const hits: { line: Line; localX: number }[] = [];
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
      hits.push({ line, localX: worldX - x });
    }
    const hit = this.closestSpan(hits);
    return hit ? this.hitWords(hit.line, hit.localX, story) : null;
  }

  private hitNearestBody(worldX: number, worldY: number, ctx: HitContext): CaretPos | null {
    const page = this.pageAt(worldX, worldY, ctx);
    if (!page || !ctx.body) {
      return null;
    }
    const pageH = ctx.pageSetup.contentHeight;
    const storyY = page.index * pageH + (worldY - page.origin.y - ctx.pageSetup.contentTop());
    const localX = worldX - page.origin.x - ctx.pageSetup.contentLeft();
    let bestDist = Number.POSITIVE_INFINITY;
    const hits: { line: Line; localX: number }[] = [];
    for (const line of ctx.body.lines) {
      if (line.type === "table" || line.type === "page") {
        continue;
      }
      const mid = line.top + line.height / 2;
      const d = Math.abs(mid - storyY);
      if (d < bestDist - 0.5) {
        bestDist = d;
        hits.length = 0;
        hits.push({ line, localX });
      } else if (Math.abs(d - bestDist) <= 0.5) {
        hits.push({ line, localX });
      }
    }
    const hit = this.closestSpan(hits);
    return hit ? this.hitWords(hit.line, hit.localX, { slot: "body" }) : null;
  }

  private hitBand(worldX: number, worldY: number, ctx: HitContext, slot: "header" | "footer"): CaretPos | null {
    for (let i = 0; i < ctx.origins.length; i += 1) {
      const at = ctx.bandAt?.(slot, i);
      const type = at?.type ?? ctx.bandType?.(slot, i) ?? "default";
      const editor = at?.editor ?? this.bandEditor(ctx, slot, type);
      if (!editor) {
        continue;
      }
      const origin = ctx.origins[i];
      const left = origin.x + ctx.pageSetup.contentLeft();
      const top = origin.y + ctx.pageSetup.bandTop(slot);
      const story: StoryRef = { slot, kind: type, sectionIndex: at?.sectionIndex ?? 0 };
      const hits: { line: Line; localX: number }[] = [];
      for (const line of editor.lines) {
        if (!this.contains(worldX, worldY, left, top + line.top, ctx.pageSetup.contentWidth, line.height)) {
          continue;
        }
        hits.push({ line, localX: worldX - left });
      }
      const hit = this.closestSpan(hits);
      if (hit) {
        return this.hitWords(hit.line, hit.localX, story);
      }
    }
    return null;
  }

  private resolveBand(ctx: HitContext, story: StoryRef): StoryEditor | undefined {
    if (story.slot !== "header" && story.slot !== "footer") {
      return undefined;
    }
    const kind = storyKind(story);
    const sectionIndex = storySection(story);
    if (ctx.bandAt) {
      for (let i = 0; i < ctx.origins.length; i += 1) {
        const at = ctx.bandAt(story.slot, i);
        if (at.type === kind && at.sectionIndex === sectionIndex && at.editor) {
          return at.editor;
        }
      }
    }
    return this.bandEditor(ctx, story.slot, kind);
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
    const hits: { line: Line; localX: number }[] = [];
    for (const line of lines) {
      if (localY >= line.top && localY <= line.top + line.height) {
        hits.push({ line, localX });
      }
    }
    const hit = this.closestSpan(hits);
    return hit ? this.hitWords(hit.line, hit.localX, story) : null;
  }

  /** 同一基线上有左右两段时，取横坐标更近的那一段。 */
  private closestSpan(hits: { line: Line; localX: number }[]): { line: Line; localX: number } | null {
    if (hits.length === 0) {
      return null;
    }
    let best = hits[0];
    let bestDist = this.spanDistance(best.line, best.localX);
    for (let i = 1; i < hits.length; i += 1) {
      const dist = this.spanDistance(hits[i].line, hits[i].localX);
      if (dist < bestDist) {
        best = hits[i];
        bestDist = dist;
      }
    }
    return best;
  }

  private spanDistance(line: Line, x: number): number {
    const first = line.getWord(0);
    const last = line.getWord(Math.max(0, line.length - 1));
    if (!first || !last) {
      return 0;
    }
    const left = first.left;
    const right = last.left + last.kernedWidth;
    if (x < left) {
      return left - x;
    }
    if (x > right) {
      return x - right;
    }
    return 0;
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

interface TextboxFrame {
  block: Block;
  x: number;
  y: number;
  width: number;
  height: number;
  insetLeft: number;
  insetTop: number;
}

function textboxFrame(block: Block, x: number, y: number): TextboxFrame | null {
  const drawing = block.drawing;
  const shape = drawing?.shape;
  if (!drawing || !shape?.text) {
    return null;
  }
  return {
    block,
    x,
    y,
    width: Math.max(drawing.width, 1),
    height: Math.max(drawing.height, 1),
    insetLeft: shape.insets.left,
    insetTop: shape.insets.top,
  };
}

function blockForDrawing(document: Document, drawing: Drawing): Block | undefined {
  let found: Block | undefined;
  document.paragraphs.each((node) => {
    if (found) {
      return;
    }
    for (const block of node.data.blocks) {
      if (block.drawing === drawing) {
        found = block;
      }
    }
  });
  return found;
}

/** 与 StoryPainter 共用：字框顶到基线约占字高的 0.85。 */
const BASELINE_RATIO = 0.85;

function guideFromLine(
  table: Table,
  story: StoryRef,
  paragraph: Paragraph,
  line: Line,
  kind: TableGuideKind,
  index: number,
): TableGuide | null {
  const widths = table.columnWidths.slice();
  if (!widths.length) {
    return null;
  }
  if (kind === "row") {
    const height = table.rowHeights[index];
    if (height == null) {
      return null;
    }
    return { table, story, paragraph, kind, index, size: height, widths, indent: line.leftBlankWidth };
  }
  if (index < 0 || index >= widths.length) {
    return null;
  }
  return { table, story, paragraph, kind, index, size: widths[index] ?? 0, widths, indent: line.leftBlankWidth };
}

/**
 * 光标跟着当前字，不跟着这一行最高的图形或字号。
 * 文字底边落在行的共用基线上；图形按它自己的外框，从行框顶起。
 */
export function caretSpan(line: Line, word: Word): { top: number; height: number } {
  const lineBox = Math.max(line.maxCharHeight, 14);
  const boxTop = line.beforeHeight + line.contentOffsetY;
  if (word.kind === "drawing") {
    return { top: boxTop, height: Math.max(word.height, 1) };
  }
  let glyph = word.height > 0 ? word.height : lineBox;
  let baseline = boxTop + lineBox * BASELINE_RATIO;
  if (word.block?.footnoteId || word.block?.commentRef || word.getStyle()?.vertAlign === "superscript") {
    glyph = Math.max(8, glyph * 0.72);
    baseline -= lineBox * 0.28;
  } else if (word.getStyle()?.vertAlign === "subscript") {
    glyph = Math.max(8, glyph * 0.72);
    baseline += lineBox * 0.12;
  }
  return { top: baseline - glyph * BASELINE_RATIO, height: glyph };
}
