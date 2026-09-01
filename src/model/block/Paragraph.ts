import type { LinkedNode } from "../list/LinkedList";
import type { Line } from "../line/Line";
import type { Table } from "../table/Table";
import type { ParagraphAttrs } from "../style/ParagraphAttrs";
import type { RunStyle } from "../style/RunStyle";
import { Block } from "./Block";

export class Paragraph {
  attrs: ParagraphAttrs = {};
  blocks: Block[] = [];
  lines: Line[] = [];
  node: LinkedNode<Paragraph> | null = null;
  isTable = false;
  table?: Table;
  hasAnchor = false;
  inheritedRunStyle?: RunStyle;
  changed = true;

  constructor(public id: number) {}

  addBlock(block: Block): void {
    this.blocks.push(block);
  }

  getFullText(): string {
    return this.blocks.map((block) => block.text).join("");
  }

  getNextParagraph(): Paragraph | undefined {
    return this.node?.next?.data;
  }

  getPreParagraph(): Paragraph | undefined {
    return this.node?.pre?.data;
  }
}
