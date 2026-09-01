import { Line } from "../../model/line/Line";

export class LinePositioner {
  place(line: Line, contentWidth: number): void {
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
    line.totalCharWidth = x - line.leftBlankWidth;
    line.width = line.totalCharWidth;
    line.maxCharHeight = maxCharHeight;

    const extra = available - line.totalCharWidth;
    const align = line.paragraph?.attrs.textAlign;
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
