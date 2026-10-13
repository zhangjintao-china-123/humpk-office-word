import type { Document } from "../../model/document/Document";
import type { Word } from "../../model/inline/Word";
import { flagOff } from "../../model/style/ParagraphAttrs";
import { Line } from "../../model/line/Line";
import { isAsciiDigit, isEastAsiaWord, isLatinLetter } from "../classify/CharClass";
import { fontSizeOf } from "./FontSpec";
import { MIX_GAP_RATIO } from "../LayoutConstants";

/**
 * 汉字和西文、汉字和数字相邻时，加大约四分之一个汉字的空隙。
 * 空隙记在前一个字上，换行后由排版把行尾那一份去掉。
 */
export class MixSpacing {
  apply(document: Document): void {
    this.applyWords(document.words.toArray());
  }

  applyWords(words: Word[]): void {
    for (const word of words) {
      if (word.spacingAfter > 0) {
        word.kernedWidth = Math.max(0, word.kernedWidth - word.spacingAfter);
        word.spacingAfter = 0;
      }
    }
    let previous: Word | null = null;
    for (const word of words) {
      if (word.kind !== "text" || word.isEnterChar()) {
        previous = null;
        continue;
      }
      if (previous && previous.paragraph === word.paragraph) {
        const gap = this.gapOf(previous, word);
        if (gap > 0) {
          previous.kernedWidth += gap;
          previous.spacingAfter = gap;
        }
      }
      previous = word;
    }
  }

  private gapOf(left: Word, right: Word): number {
    const attrs = (left.paragraph ?? right.paragraph)?.attrs;
    const de = !flagOff(attrs?.autoSpaceDE);
    const dn = !flagOff(attrs?.autoSpaceDN);
    const leftKind = kindOf(left);
    const rightKind = kindOf(right);
    const latinGap = de && ((leftKind === "ea" && rightKind === "latin") || (leftKind === "latin" && rightKind === "ea"));
    const numberGap = dn && ((leftKind === "ea" && rightKind === "number") || (leftKind === "number" && rightKind === "ea"));
    if (!latinGap && !numberGap) {
      return 0;
    }
    const east = leftKind === "ea" ? left : right;
    return fontSizeOf(east.getStyle()) * MIX_GAP_RATIO;
  }
}

/** 行尾那个字带的中西文空隙是给下一行准备的，排进本行之前拿掉。 */
export function trimLineEndGap(line: Line): void {
  let node = line.startNode;
  let last: Word | null = null;
  for (let i = 0; i < line.length; i += 1) {
    if (!node) {
      break;
    }
    last = node.data;
    node = node.next;
  }
  if (!last || last.spacingAfter <= 0) {
    return;
  }
  last.kernedWidth = Math.max(0, last.kernedWidth - last.spacingAfter);
  line.width = Math.max(0, line.width - last.spacingAfter);
  last.spacingAfter = 0;
}

function kindOf(word: Word): "ea" | "latin" | "number" | "other" {
  if (isEastAsiaWord(word.char, word.intChar)) {
    return "ea";
  }
  if (isLatinLetter(word.char, word.intChar)) {
    return "latin";
  }
  if (isAsciiDigit(word.char, word.intChar)) {
    return "number";
  }
  return "other";
}
