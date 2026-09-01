import type { ITextMeasurer } from "./measure/ITextMeasurer";

export interface LayoutConstraints {
  contentWidth: number;
  contentHeight: number;
  leftMargin?: number;
  pageWidth?: number;
  linePitchPx?: number;
  adjustLineHeightInTable?: boolean;
  measurer: ITextMeasurer;
  paginate?: boolean;
}
