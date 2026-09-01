import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";
import { classifyChar, isClosePunChar, isFullPunChar, isOpenPunChar } from "../classify/CharClass";
import { LayoutToken, type TokenKind } from "./LayoutToken";

export class TokenBuilder {
  build(head: LinkedNode<Word> | null): LayoutToken[] {
    return this.buildWhile(head, () => true);
  }

  buildWhile(head: LinkedNode<Word> | null, take: (node: LinkedNode<Word>) => boolean): LayoutToken[] {
    const tokens: LayoutToken[] = [];
    let node = head;
    while (node && take(node)) {
      const token = this.read(node);
      tokens.push(token);
      node = token.lastNode().next;
    }
    return tokens;
  }

  private read(start: LinkedNode<Word>): LayoutToken {
    const word = start.data;
    const token = new LayoutToken(start);
    if (word.kind === "table") {
      token.kind = "table";
      return token;
    }
    if (word.kind === "page") {
      token.kind = "page";
      return token;
    }
    if (word.kind === "drawing") {
      token.kind = "drawing";
      token.width = word.kernedWidth;
      return token;
    }
    if (word.isEnterChar()) {
      token.kind = "break";
      return token;
    }

    const category = classifyChar(word.char, word.intChar);
    if (category === "latin") {
      return this.group(start, "latin", (next) => classifyChar(next.char, next.intChar) === "latin");
    }
    if (category === "number") {
      return this.group(start, "number", (next, current) => this.isNumberContinue(current, next));
    }
    if (category === "space") {
      return this.group(start, "space", (next) => classifyChar(next.char, next.intChar) === "space");
    }

    token.kind = category === "cjk" ? "cjk" : category === "other" ? "other" : "punct";
    token.width = word.kernedWidth;
    token.canOverflow = isClosePunChar(word.char);
    token.canCompress = isFullPunChar(word.char);
    token.glueNext = isOpenPunChar(word.char);
    return token;
  }

  private group(
    start: LinkedNode<Word>,
    kind: TokenKind,
    take: (next: Word, current: Word) => boolean,
  ): LayoutToken {
    const token = new LayoutToken(start);
    token.kind = kind;
    token.width = start.data.kernedWidth;
    let node = start;
    while (node.next && node.next.data.kind === "text" && !node.next.data.isEnterChar()) {
      if (!take(node.next.data, node.data)) {
        break;
      }
      node = node.next;
      token.length += 1;
      token.width += node.data.kernedWidth;
    }
    return token;
  }

  private isNumberContinue(current: Word, next: Word): boolean {
    const nextCat = classifyChar(next.char, next.intChar);
    if (nextCat === "number") {
      return true;
    }
    if (next.char === "%" && classifyChar(current.char, current.intChar) === "number") {
      return true;
    }
    if ((next.char === "." || next.char === ",") && classifyChar(current.char, current.intChar) === "number") {
      return true;
    }
    return false;
  }
}
