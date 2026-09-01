import type { RunStyle } from "../../model/style/RunStyle";
import { classifyChar } from "../classify/CharClass";
import { fontSizeOf } from "./FontSpec";
import type { ITextMeasurer } from "./ITextMeasurer";

/** 无 Canvas 时的稳定测宽：CJK/全角标点 = 字号，西文约半角。 */
export class FallbackMeasurer implements ITextMeasurer {
  measure(text: string, style: RunStyle | undefined, charCode: number): number {
    const size = fontSizeOf(style);
    let width = 0;
    for (const char of text) {
      const category = classifyChar(char, char.codePointAt(0) ?? charCode);
      if (category === "cjk" || category === "fullPun" || category === "openPun" || category === "closePun") {
        width += size;
      } else if (category === "space") {
        width += size * 0.5;
      } else {
        width += size * 0.5;
      }
    }
    return width;
  }
}
