import type { Drawing } from "../inline/Drawing";
import { resolveFontFamily, type RunStyle } from "../style/RunStyle";

export class Block {
  text = "";
  style: RunStyle = {};
  drawing?: Drawing;
  charType?: string;

  get isDrawing(): boolean {
    return this.drawing != null;
  }

  getStyle(charCode = 0): RunStyle {
    return {
      ...this.style,
      fontFamily: resolveFontFamily(this.style, charCode),
    };
  }
}
