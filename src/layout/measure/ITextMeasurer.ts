import type { RunStyle } from "../../model/style/RunStyle";

export interface ITextMeasurer {
  measure(text: string, style: RunStyle | undefined, charCode: number): number;
}
