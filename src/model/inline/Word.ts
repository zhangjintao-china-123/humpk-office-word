import type { Block } from "../block/Block";
import type { Paragraph } from "../block/Paragraph";
import type { Table } from "../table/Table";
import type { Drawing } from "./Drawing";
import type { RunStyle } from "../style/RunStyle";

export type WordKind = "text" | "drawing" | "table" | "page";

export class Word {
  char = "";
  intChar = 0;
  kind: WordKind = "text";
  block: Block | null = null;
  paragraph: Paragraph | null = null;
  drawing?: Drawing;
  table?: Table;
  width = 0;
  kernedWidth = 0;
  left = 0;
  top = 0;
  height = 0;

  isEnterChar(): boolean {
    return this.char === "\n";
  }

  getStyle(): RunStyle | undefined {
    if (this.block) {
      return this.block.getStyle(this.intChar);
    }
    return undefined;
  }
}
