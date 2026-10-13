import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";
import { flagOff } from "../../model/style/ParagraphAttrs";
import {
  classifyChar,
  isAsciiDigit,
  isClosePunChar,
  isFullPunChar,
  isLatinLetter,
  isOpenPunChar,
} from "../classify/CharClass";
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
      if (this.charWrap(word)) {
        return this.single(start, "latin");
      }
      const latin = this.groupLatin(start);
      this.stickFollowing(latin);
      return latin;
    }
    if (category === "number") {
      if (this.charWrap(word)) {
        return this.single(start, "number");
      }
      const number = this.group(start, "number", (next, current) => this.isNumberContinue(current, next));
      this.stickFollowing(number);
      return number;
    }
    if (category === "space") {
      return this.group(start, "space", (next) => classifyChar(next.char, next.intChar) === "space");
    }

    token.kind = category === "cjk" ? "cjk" : category === "other" ? "other" : "punct";
    token.width = word.kernedWidth;
    const overflow = !flagOff(word.paragraph?.attrs.overflowPunct);
    const kinsoku = !flagOff(word.paragraph?.attrs.kinsoku);
    token.canOverflow = overflow && isClosePunChar(word.char);
    token.canCompress = kinsoku && isFullPunChar(word.char);
    token.glueNext = kinsoku && isOpenPunChar(word.char);
    return token;
  }

  /** w:wordWrap 为 off 时，西文按字母断开；缺省整词换行。 */
  private charWrap(word: Word): boolean {
    return flagOff(word.paragraph?.attrs.wordWrap);
  }

  private single(start: LinkedNode<Word>, kind: TokenKind): LayoutToken {
    const token = new LayoutToken(start);
    token.kind = kind;
    token.width = start.data.kernedWidth;
    return token;
  }

  private groupLatin(start: LinkedNode<Word>): LayoutToken {
    const token = new LayoutToken(start);
    token.kind = "latin";
    token.width = start.data.kernedWidth;
    let node = start;
    while (this.continuesLatin(node)) {
      node = node.next!;
      token.length += 1;
      token.width += node.data.kernedWidth;
    }
    return token;
  }

  private continuesLatin(node: LinkedNode<Word>): boolean {
    const nextNode = node.next;
    const next = nextNode?.data;
    if (!next || next.kind !== "text" || next.isEnterChar() || next.paragraph !== node.data.paragraph) {
      return false;
    }
    if (isLatinLetter(next.char, next.intChar)) {
      return true;
    }
    if (next.char !== "'" && next.char !== "’") {
      return false;
    }
    const after = nextNode?.next?.data;
    return !!after && after.kind === "text" && !after.isEnterChar() && after.paragraph === next.paragraph && isLatinLetter(after.char, after.intChar);
  }

  /** 字母和数字、连字符后面的词保持同一侧，避免 10kg、well-known 从中间拆开。 */
  private stickFollowing(token: LayoutToken): void {
    const last = token.lastNode();
    const nextNode = last.next;
    const next = nextNode?.data;
    if (!next || next.kind !== "text" || next.isEnterChar() || next.paragraph !== last.data.paragraph) {
      return;
    }
    if (token.kind === "latin" && isAsciiDigit(next.char, next.intChar)) {
      token.glueNext = true;
      return;
    }
    if (token.kind === "number" && isLatinLetter(next.char, next.intChar)) {
      token.glueNext = true;
      return;
    }
    if (token.kind !== "latin" || (next.char !== "-" && next.char !== "‐")) {
      return;
    }
    const after = nextNode?.next?.data;
    if (!after || after.kind !== "text" || after.isEnterChar() || after.paragraph !== next.paragraph) {
      return;
    }
    if (isLatinLetter(after.char, after.intChar) || isAsciiDigit(after.char, after.intChar)) {
      token.glueNext = true;
    }
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
