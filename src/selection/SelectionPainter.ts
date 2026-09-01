import type { Draw } from "../render/canvas/Draw";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { CaretPos } from "./CaretPos";
import { HitTester, type HitContext } from "./HitTester";
import type { Selection } from "./Selection";
import type { SelRange } from "./SelRange";

const HIGHLIGHT = "rgba(80, 140, 220, 0.28)";

export class SelectionPainter {
  constructor(private readonly hit = new HitTester()) {}

  paint(draw: Draw, selection: Selection, ctx: HitContext): void {
    draw.setFill(HIGHLIGHT);
    for (const range of selection.normalized()) {
      if (range.mode === "cell" && range.story.slot === "cell") {
        for (const box of this.hit.cellBoxes(range.story.cell, ctx)) {
          draw.fillRect(box.x, box.y, box.width, box.height);
        }
        continue;
      }
      if (range.collapsed()) {
        continue;
      }
      this.paintText(draw, range, ctx);
    }
  }

  private paintText(draw: Draw, range: SelRange, ctx: HitContext): void {
    let node: LinkedNode<Word> | null = range.start.node;
    const end = range.end.node;
    while (node) {
      const skipStart = node === range.start.node && range.start.after;
      const skipEnd = node === end && !range.end.after;
      if (!skipStart && !skipEnd) {
        this.paintNode(draw, node, range, ctx);
      }
      if (node === end) {
        break;
      }
      node = node.next;
    }
  }

  private paintNode(draw: Draw, node: LinkedNode<Word>, range: SelRange, ctx: HitContext): void {
    const word = node.data;
    if ((word.kind !== "text" && word.kind !== "drawing") || word.isEnterChar()) {
      return;
    }
    const box = this.hit.wordBox(new CaretPos(range.story, node, false), ctx);
    if (!box) {
      return;
    }
    draw.fillRect(box.x, box.y, box.width, box.height);
  }
}
