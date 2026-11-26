import type { ITextMeasurer } from "./measure/ITextMeasurer";

export interface LayoutConstraints {
  contentWidth: number;
  contentHeight: number;
  leftMargin?: number;
  topMargin?: number;
  pageWidth?: number;
  pageHeight?: number;
  linePitchPx?: number;
  adjustLineHeightInTable?: boolean;
  measurer: ITextMeasurer;
  paginate?: boolean;
}
