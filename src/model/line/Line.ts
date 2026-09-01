import type { LinkedNode } from "../list/LinkedList";
import type { Paragraph } from "../block/Paragraph";
import type { Word } from "../inline/Word";

export class Line {
  startNode: LinkedNode<Word> | null = null;
  length = 0;
  paragraph: Paragraph | null = null;
  isFirst = false;
  isLast = false;
  type: "" | "table" | "page" = "";
  top = 0;
  width = 0;
  height = 0;
  fullHeight = 0;
  leftBlankWidth = 0;
  rightBlankWidth = 0;
  maxCharHeight = 0;
  beforeHeight = 0;
  afterHeight = 0;
  /** exact 行内字形相对行框的垂直偏移（居中或贴底）。 */
  contentOffsetY = 0;
  totalCharWidth = 0;
  fullPunCount = 0;
  intervalWidth = 0;
  overflowPun = false;
  visible = true;
  tableRowFrom = 0;
  tableRowTo = 0;

  getNode(charIndex: number): LinkedNode<Word> | null {
    let node = this.startNode;
    for (let i = 0; i < this.length; i += 1) {
      if (!node) {
        return null;
      }
      if (i === charIndex) {
        return node;
      }
      node = node.next;
    }
    return null;
  }

  getWord(charIndex: number): Word | null {
    return this.getNode(charIndex)?.data ?? null;
  }

  getLastNode(): LinkedNode<Word> | null {
    if (this.length <= 0) {
      return this.startNode;
    }
    return this.getNode(this.length - 1);
  }
}
