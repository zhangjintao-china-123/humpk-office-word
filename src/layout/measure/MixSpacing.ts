import type { Document } from "../../model/document/Document";
import type { Word } from "../../model/inline/Word";
import { isEastAsiaWord, isLatinOrNumber } from "../classify/CharClass";
import { MIX_GAP_RATIO } from "../LayoutConstants";

/** 中日韩与西文/数字相邻时加半字间隔，写在前一字的 kernedWidth 上。 */
export class MixSpacing {
  apply(document: Document): void {
    this.applyWords(document.words.toArray());
  }

  applyWords(words: Word[]): void {
    let previous: Word | null = null;
    for (const word of words) {
      if (word.kind !== "text" || word.isEnterChar()) {
        previous = null;
        continue;
      }
      if (previous && this.needsGap(previous, word)) {
        previous.kernedWidth += word.width * MIX_GAP_RATIO;
      }
      previous = word;
    }
  }

  private needsGap(left: Word, right: Word): boolean {
    const leftEa = isEastAsiaWord(left.char, left.intChar);
    const rightEa = isEastAsiaWord(right.char, right.intChar);
    const leftWest = isLatinOrNumber(left.char, left.intChar);
    const rightWest = isLatinOrNumber(right.char, right.intChar);
    return (leftEa && rightWest) || (leftWest && rightEa);
  }
}
