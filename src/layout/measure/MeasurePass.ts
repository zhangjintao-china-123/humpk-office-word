import type { Document } from "../../model/document/Document";
import type { Word } from "../../model/inline/Word";
import { isEastAsiaWord } from "../classify/CharClass";
import { fontSizeOf, glyphSizeOf } from "./FontSpec";
import { layoutMath } from "../../model/math/MathLayout";
import type { ITextMeasurer } from "./ITextMeasurer";

export class MeasurePass {
  run(document: Document, measurer: ITextMeasurer): void {
    document.words.each((node) => {
      this.measureWord(node.data, measurer);
    });
  }

  runWords(words: Word[], measurer: ITextMeasurer): void {
    for (const word of words) {
      this.measureWord(word, measurer);
    }
  }

  measureWord(word: Word, measurer: ITextMeasurer): void {
    const style = word.getStyle();
    const full = fontSizeOf(style);
    const glyph = glyphSizeOf(style);
    if (word.kind === "drawing" && word.drawing) {
      if (word.block?.math) {
        const view = layoutMath(word.block.math, measurer, style);
        word.block.mathView = view;
        word.drawing.width = view.width;
        word.drawing.height = view.height;
      }
      word.width = word.drawing.width;
      word.height = word.drawing.height;
      word.spacingAfter = 0;
      word.kernedWidth = word.width;
      return;
    }
    if (word.kind === "table" || word.kind === "page") {
      word.width = 0;
      word.height = 0;
      word.spacingAfter = 0;
      word.kernedWidth = 0;
      return;
    }
    if (word.isEnterChar()) {
      word.width = 0;
      word.height = full;
      word.spacingAfter = 0;
      word.kernedWidth = 0;
      return;
    }
    word.width = measurer.measure(word.char, style, word.intChar);
    if (isEastAsiaWord(word.char, word.intChar)) {
      word.width = Math.max(word.width, glyph);
    }
    word.height = glyph;
    word.spacingAfter = 0;
    word.kernedWidth = word.width;
  }
}
