import type { TabStop } from "../../model/style/ParagraphAttrs";
import { Line } from "../../model/line/Line";
import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";

const DEFAULT_TAB_PX = 48;

export class LinePositioner {
  place(line: Line, contentWidth: number): void {
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
    if (this.hasTab(line)) {
      x = this.applyTabs(line, contentWidth);
    }
    line.totalCharWidth = x - line.leftBlankWidth;
    line.width = line.totalCharWidth;
    line.maxCharHeight = maxCharHeight;

    const extra = available - line.totalCharWidth;
    const align = this.hasTab(line) ? undefined : line.paragraph?.attrs.textAlign;
    if (extra > 0 && align === "center") {
      this.shift(line, extra / 2);
    } else if (extra > 0 && (align === "right" || align === "end")) {
      this.shift(line, extra);
    } else if (extra > 0 && align === "distribute" && line.isLast && line.length > 1) {
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
      const stop = nextStop(x, stops, contentWidth);
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

  private justify(line: Line, extra: number): void {
    const spaces: { index: number }[] = [];
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      if (node.data.kind === "text" && /\s/u.test(node.data.char) && !node.data.isEnterChar()) {
        spaces.push({ index: i });
      }
      node = node.next;
    }
    if (spaces.length === 0) {
      this.distribute(line, extra);
      return;
    }
    const each = extra / spaces.length;
    let added = 0;
    let spaceAt = 0;
    node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      node.data.left += added;
      if (spaceAt < spaces.length && spaces[spaceAt].index === i) {
        node.data.kernedWidth += each;
        added += each;
        spaceAt += 1;
      }
      node = node.next;
    }
  }
}

function nextStop(x: number, stops: TabStop[], contentWidth: number): { pos: number; val: TabStop["val"] } {
  for (const stop of stops) {
    if (stop.posPx > x + 0.5) {
      return { pos: stop.posPx, val: stop.val };
    }
  }
  const next = (Math.floor(x / DEFAULT_TAB_PX) + 1) * DEFAULT_TAB_PX;
  return { pos: Math.min(contentWidth, next), val: "left" };
}
