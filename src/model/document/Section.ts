import type { SectionBreak } from "./PageLabel";
import type { Document } from "./Document";
import type { HeaderFooterType } from "./DocumentKind";

export class Section {
  headers = new Map<HeaderFooterType, Document>();
  footers = new Map<HeaderFooterType, Document>();
  pageWidthPx?: number;
  pageHeightPx?: number;
  leftMarginPx?: number;
  rightMarginPx?: number;
  topMarginPx?: number;
  bottomMarginPx?: number;
  headerFromEdgePx?: number;
  footerFromEdgePx?: number;
  titlePg = false;
  breakType: SectionBreak = "nextPage";
  pageNumStart?: number;
  pageNumFmt?: string;
  linePitchPx?: number;
  docGridType?: string;
}
