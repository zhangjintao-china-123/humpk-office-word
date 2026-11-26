import type { Draw } from "../render/canvas/Draw";
import { ROTATE_HANDLE_OFFSET, ROTATE_HANDLE_RADIUS } from "../edit/PictureTransform";
import { drawingRotationRadians } from "../model/graphic/DrawingTransform";
import { cellVisibleRect, type TableCellBox } from "../render/table/TableGeometry";
import type { Drawing } from "../model/inline/Drawing";
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
    if (word.kind !== "text" || word.isEnterChar()) {
      return;
    }
    const box = this.hit.wordBox(new CaretPos(story, node, false), ctx);
    if (!box) {
      return;
    }
    draw.fillRect(box.x, box.y, box.width, box.height);
  }

  paintPictureHandles(draw: Draw, box: { x: number; y: number; width: number; height: number; drawing?: Drawing }): void {
    const rot = drawingRotationRadians(box.drawing);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    if (rot) {
      draw.save();
      draw.translate(cx, cy);
      draw.rotate(rot);
      draw.translate(-cx, -cy);
    }
    draw.setStroke("#2b579a", 1.5);
    draw.setLineDash([]);
    draw.strokeRect(box.x, box.y, box.width, box.height);
    const rx = box.x + box.width / 2;
    const ry = box.y - ROTATE_HANDLE_OFFSET;
    draw.setStroke("#2b579a", 1);
    draw.beginPath();
    draw.moveTo(rx, box.y);
    draw.lineTo(rx, ry + ROTATE_HANDLE_RADIUS);
    draw.stroke();
    draw.setFill("#ffffff");
    draw.beginPath();
    draw.ellipse(rx, ry, ROTATE_HANDLE_RADIUS, ROTATE_HANDLE_RADIUS);
    draw.fill();
    draw.setStroke("#2b579a", 1);
    draw.stroke();
    this.paintRotateGlyph(draw, rx, ry);
    const size = 8;
    const centers = [
      [box.x, box.y],
      [box.x + box.width / 2, box.y],
      [box.x + box.width, box.y],
      [box.x + box.width, box.y + box.height / 2],
      [box.x + box.width, box.y + box.height],
      [box.x + box.width / 2, box.y + box.height],
      [box.x, box.y + box.height],
      [box.x, box.y + box.height / 2],
    ];
    for (const [hx, hy] of centers) {
      draw.setFill("#ffffff");
      draw.beginPath();
      draw.ellipse(hx, hy, size / 2, size / 2);
      draw.fill();
      draw.setStroke("#2b579a", 1);
      draw.stroke();
    }
    if (rot) {
      draw.restore();
    }
  }

  private paintRotateGlyph(draw: Draw, cx: number, cy: number): void {
    const r = 3.5;
    const steps = 10;
    const start = -Math.PI * 0.2;
    const end = Math.PI * 1.4;
    draw.setStroke("#2b579a", 1.2);
    draw.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const a = start + ((end - start) * i) / steps;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) {
        draw.moveTo(px, py);
      } else {
        draw.lineTo(px, py);
      }
    }
    const tipX = cx + Math.cos(end) * r;
    const tipY = cy + Math.sin(end) * r;
    draw.moveTo(tipX - 2.3, tipY - 0.6);
    draw.lineTo(tipX, tipY);
    draw.lineTo(tipX + 0.7, tipY - 2.3);
    draw.stroke();
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
