import type { Draw } from "../../render/canvas/Draw";
import type { RunStyle } from "../../model/style/RunStyle";
import { fontCss, fontSizeOf } from "./FontSpec";
import type { ITextMeasurer } from "./ITextMeasurer";

/** 按绘制字号测宽，避免大字号缩放在字体回退时把宽度缩没。 */
export class CanvasMeasurer implements ITextMeasurer {
  private readonly cache = new Map<string, number>();

  constructor(private readonly draw: Draw) {}

  measure(text: string, style: RunStyle | undefined, charCode: number): number {
    if (!text) {
      return 0;
    }
    const key = `${fontCss(style, charCode)}\0${text}`;
    let cached = this.cache.get(key);
    if (cached == null) {
      this.draw.setFont(fontCss(style, charCode));
      cached = this.draw.measureText(text);
      this.cache.set(key, cached);
    }
    const size = fontSizeOf(style);
    if (cached > 0) {
      return cached;
    }
    return text.length * size * 0.5;
  }
}
