import { isFullPunChar } from "../classify/CharClass";
import { FULL_PUN_RATIO_HARD, FULL_PUN_RATIO_SOFT } from "../LayoutConstants";
import { fontSizeOf } from "../measure/FontSpec";
import { Line } from "../../model/line/Line";

/** 行尾放不下时，压缩行内全角标点。只改 kernedWidth。 */
export class PunctCompressor {
  tryCompress(line: Line, need: number): boolean {
    if (need <= 0) {
      return true;
    }
    const soft = this.savedIf(line, FULL_PUN_RATIO_SOFT);
    if (soft >= need) {
      this.apply(line, FULL_PUN_RATIO_SOFT);
      return true;
    }
    const hard = this.savedIf(line, FULL_PUN_RATIO_HARD);
    if (hard >= need) {
      this.apply(line, FULL_PUN_RATIO_HARD);
      return true;
    }
    if (soft > 0) {
      this.apply(line, FULL_PUN_RATIO_SOFT);
    }
    return false;
  }

  private savedIf(line: Line, ratio: number): number {
    let saved = 0;
    this.eachFullPun(line, (word) => {
      const target = fontSizeOf(word.getStyle()) * ratio;
      saved += Math.max(0, word.kernedWidth - target);
    });
    return saved;
  }

  private apply(line: Line, ratio: number): void {
    this.eachFullPun(line, (word) => {
      word.kernedWidth = fontSizeOf(word.getStyle()) * ratio;
    });
    line.width = this.sumWidth(line);
    line.fullPunCount += 1;
  }

  private eachFullPun(line: Line, visit: (word: import("../../model/inline/Word").Word) => void): void {
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      const word = node.data;
      if (word.kind === "text" && isFullPunChar(word.char)) {
        visit(word);
      }
      node = node.next;
    }
  }

  private sumWidth(line: Line): number {
    let width = 0;
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      width += node.data.kernedWidth;
      node = node.next;
    }
    return width;
  }
}
