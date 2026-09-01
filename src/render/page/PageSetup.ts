export interface PageSetupInit {
  width?: number;
  height?: number;
  leftMargin?: number;
  rightMargin?: number;
  /** 正文上边距（历史字段名，对应 w:pgMar@w:top，可为负）。 */
  headerHeight?: number;
  /** 正文下边距（历史字段名，对应 w:pgMar@w:bottom，可为负）。 */
  footerHeight?: number;
  /** 纸顶到页眉顶，对应 w:pgMar@w:header。 */
  headerFromEdge?: number;
  /** 纸底到页脚底，对应 w:pgMar@w:footer。 */
  footerFromEdge?: number;
  /** 页眉内容高度；各套取 max，避免分页高度抖动。 */
  headerExtent?: number;
  /** 页脚内容高度；各套取 max。 */
  footerExtent?: number;
  pageGap?: number;
  linePitchPx?: number;
  adjustLineHeightInTable?: boolean;
}

/** 页面几何，单位 CSS 像素。默认 A4 @ 96dpi。 */
export class PageSetup {
  width: number;
  height: number;
  leftMargin: number;
  rightMargin: number;
  headerHeight: number;
  footerHeight: number;
  headerFromEdge: number;
  footerFromEdge: number;
  headerExtent: number;
  footerExtent: number;
  pageGap: number;
  linePitchPx?: number;
  adjustLineHeightInTable?: boolean;

  constructor(init: PageSetupInit = {}) {
    this.width = init.width ?? Math.round(8.27 * 96);
    this.height = init.height ?? Math.round(11.69 * 96);
    this.leftMargin = init.leftMargin ?? 96;
    this.rightMargin = init.rightMargin ?? 96;
    this.headerHeight = init.headerHeight ?? 96;
    this.footerHeight = init.footerHeight ?? 96;
    this.headerFromEdge = init.headerFromEdge ?? 0;
    this.footerFromEdge = init.footerFromEdge ?? 0;
    this.headerExtent = init.headerExtent ?? 0;
    this.footerExtent = init.footerExtent ?? 0;
    this.pageGap = init.pageGap ?? 24;
    this.linePitchPx = init.linePitchPx;
    this.adjustLineHeightInTable = init.adjustLineHeightInTable;
  }

  resetA4(): void {
    this.assign({
      width: Math.round(8.27 * 96),
      height: Math.round(11.69 * 96),
      leftMargin: 96,
      rightMargin: 96,
      headerHeight: 96,
      footerHeight: 96,
      headerFromEdge: 0,
      footerFromEdge: 0,
      headerExtent: 0,
      footerExtent: 0,
      pageGap: this.pageGap,
      linePitchPx: undefined,
      adjustLineHeightInTable: undefined,
    });
  }

  assign(init: PageSetupInit): void {
    if (init.width != null) {
      this.width = init.width;
    }
    if (init.height != null) {
      this.height = init.height;
    }
    if (init.leftMargin != null) {
      this.leftMargin = init.leftMargin;
    }
    if (init.rightMargin != null) {
      this.rightMargin = init.rightMargin;
    }
    if (init.headerHeight != null) {
      this.headerHeight = init.headerHeight;
    }
    if (init.footerHeight != null) {
      this.footerHeight = init.footerHeight;
    }
    if (init.headerFromEdge != null) {
      this.headerFromEdge = init.headerFromEdge;
    }
    if (init.footerFromEdge != null) {
      this.footerFromEdge = init.footerFromEdge;
    }
    if (init.headerExtent != null) {
      this.headerExtent = init.headerExtent;
    }
    if (init.footerExtent != null) {
      this.footerExtent = init.footerExtent;
    }
    if (init.pageGap != null) {
      this.pageGap = init.pageGap;
    }
    this.linePitchPx = init.linePitchPx;
    this.adjustLineHeightInTable = init.adjustLineHeightInTable;
  }

  static a4(): PageSetup {
    return new PageSetup();
  }

  get contentWidth(): number {
    return this.width - this.leftMargin - this.rightMargin;
  }

  get contentHeight(): number {
    return Math.max(0, this.contentBottom() - this.contentTop());
  }

  contentLeft(): number {
    return this.leftMargin;
  }

  contentTop(): number {
    const top = this.headerHeight;
    if (top < 0) {
      return Math.abs(top);
    }
    return Math.max(top, this.headerFromEdge + this.headerExtent);
  }

  contentRight(): number {
    return this.width - this.rightMargin;
  }

  contentBottom(): number {
    const bottom = this.footerHeight;
    if (bottom < 0) {
      return this.height - Math.abs(bottom);
    }
    return Math.min(this.height - bottom, this.height - this.footerFromEdge - this.footerExtent);
  }

  headerTop(): number {
    return this.headerFromEdge;
  }

  footerTop(): number {
    return this.height - this.footerFromEdge - this.footerExtent;
  }

  bandTop(slot: "header" | "footer"): number {
    return slot === "header" ? this.headerTop() : this.footerTop();
  }

  stackHeight(pageCount: number): number {
    const count = Math.max(1, pageCount);
    return count * this.height + (count - 1) * this.pageGap;
  }
}
