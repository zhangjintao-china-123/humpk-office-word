import type { TabStop } from "../../model/style/ParagraphAttrs";
import { Line } from "../../model/line/Line";
import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";
import { isAsciiDigit, isClosePunChar, isLatinLetter, isOpenPunChar } from "../classify/CharClass";
import { trimLineEndGap } from "../measure/MixSpacing";

const DEFAULT_TAB_PX = 48;

export class LinePositioner {
  private defaultTabPx = DEFAULT_TAB_PX;

  setDefaultTab(px?: number): void {
    this.defaultTabPx = px != null && px > 0 ? px : DEFAULT_TAB_PX;
  }

  place(line: Line, contentWidth: number): void {
    trimLineEndGap(line);
    line.contentWidth = contentWidth;
    const available = Math.max(0, contentWidth - line.leftBlankWidth - line.rightBlankWidth);
    let x = line.leftBlankWidth;
    let maxCharHeight = 0;
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      const word = node.data;
      word.left = x;
      x += word.kernedWidth;
      maxCharHeight = Math.max(maxCharHeight, word.height);
      node = node.next;
    }
    const tabbed = this.hasTab(line);
    if (tabbed) {
      x = this.applyTabs(line, contentWidth);
    }
    line.totalCharWidth = x - line.leftBlankWidth;
    line.width = line.totalCharWidth;
    line.maxCharHeight = maxCharHeight;

    const extra = available - line.totalCharWidth;
    const align = line.paragraph?.attrs.textAlign;
    if (extra > 0 && !tabbed && align === "center") {
      this.shift(line, extra / 2);
    } else if (extra > 0 && !tabbed && (align === "right" || align === "end")) {
      this.shift(line, extra);
    } else if (extra > 0 && !tabbed && align === "distribute" && line.length > 1) {
      this.distribute(line, extra);
    } else if (extra > 0 && (align === "both" || align === "justify") && !line.isLast && line.length > 1) {
      this.justify(line, extra);
    }
  }

  private hasTab(line: Line): boolean {
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (node?.data.char === "\t") {
        return true;
      }
      node = node?.next ?? null;
    }
    return false;
  }

  /** 制表位从版心左边起算。中部、右对齐把制表符后面的文字挪到停止位上。 */
  private applyTabs(line: Line, contentWidth: number): number {
    const stops = line.paragraph?.attrs.tabs ?? [];
    const nodes: LinkedNode<Word>[] = [];
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      nodes.push(node);
      node = node.next;
    }
    let x = line.leftBlankWidth;
    let index = 0;
    while (index < nodes.length) {
      const word = nodes[index].data;
      if (word.char !== "\t" || word.isEnterChar()) {
        word.left = x;
        x += word.kernedWidth;
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < nodes.length && nodes[end].data.char !== "\t" && !nodes[end].data.isEnterChar()) {
        end += 1;
      }
      let runWidth = 0;
      for (let cursor = index + 1; cursor < end; cursor += 1) {
        runWidth += nodes[cursor].data.kernedWidth;
      }
      const stop = this.nextStop(x, stops, contentWidth);
      let start = stop.pos;
      if (stop.val === "right" || stop.val === "decimal") {
        start = stop.pos - runWidth;
      } else if (stop.val === "center") {
        start = stop.pos - runWidth / 2;
      }
      start = Math.max(x, start);
      word.left = x;
      word.kernedWidth = start - x;
      x = start;
      index += 1;
      while (index < end) {
        nodes[index].data.left = x;
        x += nodes[index].data.kernedWidth;
        index += 1;
      }
    }
    return x;
  }

  private shift(line: Line, delta: number): void {
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      node.data.left += delta;
      node = node.next;
    }
  }

  private distribute(line: Line, extra: number): void {
    const gaps = line.length - 1;
    const each = extra / gaps;
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      node.data.left += each * i;
      node = node.next;
    }
  }

  /**
   * 两端对齐只拉开汉字之间、中西文交界和空格。
   * 英文单词内部、数字内部、标点贴着的那一侧保持原样。
   */
  private justify(line: Line, extra: number): void {
    const nodes: LinkedNode<Word>[] = [];
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      nodes.push(node);
      node = node.next;
    }
    const slots: number[] = [];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      if (this.expands(nodes[i].data, nodes[i + 1].data)) {
        slots.push(i);
      }
    }
    if (slots.length === 0) {
      return;
    }
    const each = extra / slots.length;
    let added = 0;
    let slotAt = 0;
    for (let i = 0; i < nodes.length; i += 1) {
      nodes[i].data.left += added;
      if (slotAt < slots.length && slots[slotAt] === i) {
        nodes[i].data.kernedWidth += each;
        added += each;
        slotAt += 1;
      }
    }
  }

  private expands(left: Word, right: Word): boolean {
    if (left.kind !== "text" || right.kind !== "text" || left.isEnterChar() || right.isEnterChar()) {
      return false;
    }
    if (/\s/u.test(left.char)) {
      return true;
    }
    if (/\s/u.test(right.char) || isClosePunChar(right.char) || isOpenPunChar(left.char)) {
      return false;
    }
    if (right.char === "-" || right.char === "‐") {
      return false;
    }
    const leftLatin = isLatinLetter(left.char, left.intChar);
    const rightLatin = isLatinLetter(right.char, right.intChar);
    const leftDigit = isAsciiDigit(left.char, left.intChar);
    const rightDigit = isAsciiDigit(right.char, right.intChar);
    if ((leftLatin && rightLatin) || (leftDigit && rightDigit)) {
      return false;
    }
    if ((leftLatin && rightDigit) || (leftDigit && rightLatin)) {
      return false;
    }
    return true;
  }

  private nextStop(x: number, stops: TabStop[], contentWidth: number): { pos: number; val: TabStop["val"] } {
    for (const stop of stops) {
      if (stop.posPx > x + 0.5) {
        return { pos: stop.posPx, val: stop.val };
      }
    }
    const next = (Math.floor(x / this.defaultTabPx) + 1) * this.defaultTabPx;
    return { pos: Math.min(contentWidth, next), val: "left" };
  }
}
