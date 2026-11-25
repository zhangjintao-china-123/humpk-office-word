import type { Draw } from "../render/canvas/Draw";
import { cellVisibleRect, type TableCellBox } from "../render/table/TableGeometry";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { Document } from "../model/document/Document";
import { CaretPos } from "./CaretPos";
import { HitTester, type HitContext } from "./HitTester";
import { caretRank, coverFlow } from "./MainWalk";
import type { Selection } from "./Selection";
import type { SelRange } from "./SelRange";
import type { StoryRef } from "./StoryRef";

const HIGHLIGHT = "rgba(80, 140, 220, 0.28)";

export class SelectionPainter {
  constructor(private readonly hit = new HitTester()) {}

  paint(draw: Draw, selection: Selection, ctx: HitContext): void {
    draw.setFill(HIGHLIGHT);
    if (selection.flow) {
      this.paintFlow(draw, selection, ctx);
      return;
    }
    for (const range of selection.normalized()) {
      if (range.mode === "cell" && range.story.slot === "cell") {
        for (const box of this.hit.cellBoxes(range.story.cell, ctx)) {
          this.fillCell(draw, box);
        }
        continue;
      }
      if (range.collapsed()) {
        continue;
      }
      this.paintText(draw, range, ctx);
    }
  }

  private paintFlow(draw: Draw, selection: Selection, ctx: HitContext): void {
    const flow = selection.flow;
    if (!flow) {
      return;
    }
    const owner = this.ownerOf(flow.anchor, ctx) ?? this.ownerOf(flow.focus, ctx);
    if (!owner) {
      return;
    }
    const cover = coverFlow(owner.document, owner.story, flow.anchor, flow.focus);
    for (const cell of cover.fullCells) {
      for (const box of this.hit.cellBoxes(cell, ctx)) {
        this.fillCell(draw, box);
      }
    }
    for (const table of cover.tables) {
      for (const row of table.table.rows) {
        for (const cell of row.cells) {
          for (const box of this.hit.cellBoxes(cell, ctx)) {
            this.fillCell(draw, box);
          }
        }
      }
    }
    for (const glyph of cover.glyphs) {
      this.paintNode(draw, glyph.node, glyph.story, ctx);
    }
  }

  private fillCell(draw: Draw, box: TableCellBox): void {
    const rect = cellVisibleRect(box);
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    draw.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  private ownerOf(pos: CaretPos, ctx: HitContext): { document: Document; story: StoryRef } | null {
    const body = ctx.body?.document;
    if (body && caretRank(body, { slot: "body" }, pos) != null) {
      return { document: body, story: { slot: "body" } };
    }
    return null;
  }

  private paintText(draw: Draw, range: SelRange, ctx: HitContext): void {
    let node: LinkedNode<Word> | null = range.start.node;
    const end = range.end.node;
    while (node) {
      const skipStart = node === range.start.node && range.start.after;
      const skipEnd = node === end && !range.end.after;
      if (!skipStart && !skipEnd) {
        this.paintNode(draw, node, range.story, ctx);
      }
      if (node === end) {
        break;
      }
      node = node.next;
    }
  }

  private paintNode(draw: Draw, node: LinkedNode<Word>, story: StoryRef, ctx: HitContext): void {
    const word = node.data;
    if ((word.kind !== "text" && word.kind !== "drawing") || word.isEnterChar()) {
      return;
    }
    const box = this.hit.wordBox(new CaretPos(story, node, false), ctx);
    if (!box) {
      return;
    }
    draw.fillRect(box.x, box.y, box.width, box.height);
  }

  paintTableHandles(draw: Draw, ctx: HitContext): void {
    for (const handle of this.hit.tableHandles(ctx)) {
      draw.setFill("#f4f7fb");
      draw.fillRect(handle.x, handle.y, handle.size, handle.size);
      draw.setStroke("#2E75B6", 1);
      draw.strokeRect(handle.x + 0.5, handle.y + 0.5, handle.size - 1, handle.size - 1);
      const midX = handle.x + handle.size / 2;
      const midY = handle.y + handle.size / 2;
      draw.beginPath();
      draw.moveTo(midX - 3, midY);
      draw.lineTo(midX + 3, midY);
      draw.moveTo(midX, midY - 3);
      draw.lineTo(midX, midY + 3);
      draw.stroke();
    }
  }
}
