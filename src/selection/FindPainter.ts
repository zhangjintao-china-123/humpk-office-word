import type { Draw } from "../render/canvas/Draw";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { FindHit } from "../edit/Find";
import { CaretPos } from "./CaretPos";
import { HitTester, type HitContext } from "./HitTester";

const FIND_FILL = "rgba(255, 196, 0, 0.55)";

export class FindPainter {
  constructor(private readonly hit = new HitTester()) {}

  paint(draw: Draw, hits: FindHit[], ctx: HitContext): void {
    if (!hits.length) {
      return;
    }
    draw.setFill(FIND_FILL);
    for (const hit of hits) {
      let node: LinkedNode<Word> | null = hit.start;
      while (node) {
        this.paintNode(draw, node, hit, ctx);
        if (node === hit.end) {
          break;
        }
        node = node.next;
      }
    }
  }

  private paintNode(draw: Draw, node: LinkedNode<Word>, hit: FindHit, ctx: HitContext): void {
    const word = node.data;
    if ((word.kind !== "text" && word.kind !== "drawing") || word.isEnterChar()) {
      return;
    }
    const box = this.hit.wordBox(new CaretPos(hit.story, node, false), ctx);
    if (!box) {
      return;
    }
    draw.fillRect(box.x, box.y, box.width, box.height);
  }
}
