import type { ITextMeasurer } from "./measure/ITextMeasurer";

export interface LayoutConstraints {
  contentWidth: number;
  contentHeight: number;
  leftMargin?: number;
  topMargin?: number;
  /** 当前 Story 的纵坐标原点距纸张顶端的距离。 */
  storyTop?: number;
  pageWidth?: number;
  pageHeight?: number;
  linePitchPx?: number;
  adjustLineHeightInTable?: boolean;
  measurer: ITextMeasurer;
  paginate?: boolean;
}
