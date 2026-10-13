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

/** 把 glueNext 串起来的宽度算进去，这样括号、连字符、字母和数字不会拆到行的两侧。 */
export function gluedWidth(tokens: LayoutToken[], index: number): number {
  const token = tokens[index];
  if (!token) {
    return 0;
  }
  let width = token.width;
  let cursor = index;
  for (let hop = 0; hop < 3; hop += 1) {
    const current = tokens[cursor];
    const next = tokens[cursor + 1];
    if (!current?.glueNext || !next || next.kind === "break" || next.kind === "page" || next.kind === "table") {
      break;
    }
    width += next.width;
    cursor += 1;
  }
  return width;
}
