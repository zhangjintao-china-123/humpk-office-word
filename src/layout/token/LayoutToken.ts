import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";

export type TokenKind =
  | "cjk"
  | "latin"
  | "number"
  | "punct"
  | "space"
  | "break"
  | "drawing"
  | "table"
  | "page"
  | "other";

export class LayoutToken {
  kind: TokenKind = "other";
  start: LinkedNode<Word>;
  length = 1;
  width = 0;
  canOverflow = false;
  canCompress = false;
  glueNext = false;

  constructor(start: LinkedNode<Word>) {
    this.start = start;
  }

  lastNode(): LinkedNode<Word> {
    let node = this.start;
    for (let i = 1; i < this.length; i += 1) {
      if (!node.next) {
        break;
      }
      node = node.next;
    }
    return node;
  }
}
