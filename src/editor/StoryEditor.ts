import { fieldValues, type PageLabel } from "../model/document/PageLabel";
import { buildFieldView, type FieldView } from "../model/field/FieldDisplay";
import type { Block } from "../model/block/Block";
import type { Line } from "../model/line/Line";
import type { Paragraph } from "../model/block/Paragraph";
import type { PlacedAnchor } from "../model/inline/PlacedAnchor";
import type { PageSetup } from "../render/page/PageSetup";
import { Draw } from "../render/canvas/Draw";
import { CanvasMeasurer } from "../layout/measure/CanvasMeasurer";
import { FallbackMeasurer } from "../layout/measure/FallbackMeasurer";
import { StoryLayout } from "../layout/StoryLayout";
import { StoryPainter } from "../render/story/StoryPainter";
import { EditorBase, type EditorBaseOptions } from "./EditorBase";

export type StorySlot = "body" | "header" | "footer";

export interface StoryEditorOptions extends EditorBaseOptions {
  pageSetup: PageSetup;
  slot?: StorySlot;
}

export interface PageOrigin {
  x: number;
  y: number;
}

export interface PageRange {
  start: number;
  end: number;
}

export class StoryEditor extends EditorBase {
  readonly pageSetup: PageSetup;
  readonly slot: StorySlot;
  lines: Line[] = [];
  showMarks = false;
  private readonly layoutEngine = new StoryLayout();
  private readonly painter = new StoryPainter();
  private pageLines?: { source: Line[]; pageHeight: number; pageCount: number; pages: Line[][] };

  constructor(options: StoryEditorOptions) {
    super(options);
    this.pageSetup = options.pageSetup;
    this.slot = options.slot ?? "body";
  }

  pageCount(): number {
    if (this.slot !== "body") {
      return 1;
    }
    let total = 0;
    for (const line of this.lines) {
      total = Math.max(total, line.top + line.height);
    }
    const contentHeight = this.pageSetup.contentHeight;
    const lastLinePage = this.lines.reduce((max, line) => Math.max(max, line.pageIndex ?? 0), 0);
    const lastPicturePage = this.document?.anchors.reduce((max, anchor) =>
      anchor.referencePage != null && !anchor.drawing.hidden ? Math.max(max, anchor.pageOn(contentHeight)) : max, 0,
    ) ?? 0;
    return Math.max(lastLinePage + 1, lastPicturePage + 1, Math.ceil(total / contentHeight) || 1);
  }

  paintOnPages(
    origins: PageOrigin[],
    labels?: PageLabel[],
    target?: Draw,
    range: PageRange = { start: 0, end: origins.length },
    fieldText?: Map<Block, string>,
  ): void {
    const draw = target ?? (this.draw instanceof Draw ? this.draw : null);
    if (!draw || range.start >= range.end) {
      return;
    }
    if (this.slot === "body") {
      this.paintBody(draw, origins, range, labels, fieldText);
      return;
    }
    for (let index = range.start; index < range.end; index += 1) {
      this.paintBand(draw, origins[index], labels?.[index] ?? fallbackLabel(index, origins.length));
    }
  }

  reflow(dirty: Paragraph[]): void {
    if (!this.document) {
      return;
    }
    this.lines = this.layoutEngine.reflow(this.document, this.constraints(), dirty);
  }

  constraints() {
    return {
      contentWidth: this.pageSetup.contentWidth,
      contentHeight: this.pageSetup.contentHeight,
      leftMargin: this.pageSetup.leftMargin,
      topMargin: this.pageSetup.contentTop(),
      storyTop: this.slot === "header" || this.slot === "footer" ? this.pageSetup.bandTop(this.slot) : this.pageSetup.contentTop(),
      pageWidth: this.pageSetup.width,
      pageHeight: this.pageSetup.height,
      linePitchPx: this.pageSetup.linePitchPx,
      adjustLineHeightInTable: this.pageSetup.adjustLineHeightInTable,
      measurer: this.draw instanceof Draw ? new CanvasMeasurer(this.draw) : new FallbackMeasurer(),
      paginate: this.slot === "body",
    };
  }

  protected override onLayout(): void {
    if (!this.document) {
      this.lines = [];
      return;
    }
    this.lines = this.layoutEngine.layout(this.document, this.constraints());
  }

  protected override onRender(): void {}

  private paintBody(draw: Draw, origins: PageOrigin[], range: PageRange, labels?: PageLabel[], fieldText?: Map<Block, string>): void {
    const pageH = this.pageSetup.contentHeight;
    const contentX = (origin: PageOrigin) => origin.x + this.pageSetup.contentLeft();
    const contentY = (origin: PageOrigin, storyY: number, pageIndex: number) =>
      origin.y + this.pageSetup.contentTop() + (storyY - pageIndex * pageH);
    this.paintAnchors(draw, origins, true, (anchor, origin) => ({
      x: contentX(origin) + anchor.x,
      y: contentY(origin, anchor.y, anchor.pageOn(pageH)),
    }), range);
    const text = fieldText ?? this.fieldText(labels, origins.length);
    const pages = this.linesByPage(pageH, origins.length);
    for (let pageIndex = range.start; pageIndex < range.end; pageIndex += 1) {
      const origin = origins[pageIndex];
      draw.save();
      draw.beginPath();
      draw.rect(origin.x, origin.y, this.pageSetup.width, this.pageSetup.height);
      draw.clip();
      const label = labels?.[pageIndex] ?? fallbackLabel(pageIndex, origins.length);
      const view: FieldView = { values: fieldValues(label), text, showMarks: this.showMarks };
      for (const line of pages[pageIndex] ?? []) {
        draw.save();
        this.painter.paintLine(draw, line, contentX(origin), contentY(origin, line.top, pageIndex), label.pageNumber, view);
        draw.restore();
      }
      draw.restore();
    }
    this.paintAnchors(draw, origins, false, (anchor, origin) => ({
      x: contentX(origin) + anchor.x,
      y: contentY(origin, anchor.y, anchor.pageOn(pageH)),
    }), range);
    const notes = this.document?.footnotes;
    if (!notes?.length) {
      return;
    }
    for (let pageIndex = range.start; pageIndex < range.end; pageIndex += 1) {
      const origin = origins[pageIndex];
      draw.save();
      draw.beginPath();
      draw.rect(origin.x, origin.y, this.pageSetup.width, this.pageSetup.height);
      draw.clip();
      this.painter.paintFootnotes(draw, notes, this.lines, pageIndex, {
        x: contentX(origin),
        y: origin.y + this.pageSetup.contentTop() + pageH + 8,
        pageH,
      });
      draw.restore();
    }
  }

  private linesByPage(pageHeight: number, pageCount: number): Line[][] {
    const cached = this.pageLines;
    if (cached?.source === this.lines && cached.pageHeight === pageHeight && cached.pageCount === pageCount) {
      return cached.pages;
    }
    const pages: Line[][] = [];
    for (const line of this.lines) {
      const page = line.pageIndex ?? (pageHeight > 0 ? Math.floor(line.top / pageHeight) : 0);
      const index = Math.max(0, Math.min(pageCount - 1, page));
      (pages[index] ??= []).push(line);
    }
    this.pageLines = { source: this.lines, pageHeight, pageCount, pages };
    return pages;
  }

  private paintBand(draw: Draw, origin: PageOrigin, label: PageLabel): void {
    const left = origin.x + this.pageSetup.contentLeft();
    const top = origin.y + this.pageSetup.bandTop(this.slot === "footer" ? "footer" : "header");
    this.paintAnchors(draw, [origin], true, (anchor) => ({ x: left + anchor.x, y: top + anchor.y }));
    const view: FieldView = { values: fieldValues(label), text: this.fieldText([label], 1), showMarks: this.showMarks };
    for (const line of this.lines) {
      this.painter.paintLine(draw, line, left, top + line.top, label.pageNumber, view);
    }
    this.paintAnchors(draw, [origin], false, (anchor) => ({ x: left + anchor.x, y: top + anchor.y }));
  }

  private fieldText(labels: PageLabel[] | undefined, pageCount: number): Map<Block, string> {
    if (!this.document) {
      return new Map();
    }
    const pages = labels?.length ? labels : Array.from({ length: pageCount }, (_, index) => fallbackLabel(index, pageCount));
    return buildFieldView(this.document, this.lines, pages, this.pageSetup.contentHeight).text;
  }

  private paintAnchors(
    draw: Draw,
    origins: PageOrigin[],
    behind: boolean,
    locate: (anchor: PlacedAnchor, origin: PageOrigin) => {
      x: number;
      y: number;
    },
    range: PageRange = { start: 0, end: origins.length },
  ): void {
    const pageH = this.pageSetup.contentHeight;
    for (const anchor of this.document?.anchors ?? []) {
      if (anchor.behind !== behind) {
        continue;
      }
      const pageIndex = this.slot === "body" ? anchor.pageOn(pageH) : 0;
      if (pageIndex < range.start || pageIndex >= range.end) {
        continue;
      }
      const origin = origins[pageIndex];
      if (!origin) {
        continue;
      }
      const at = locate(anchor, origin);
      draw.save();
      draw.beginPath();
      draw.rect(origin.x, origin.y, this.pageSetup.width, this.pageSetup.height);
      draw.clip();
      this.painter.paintDrawing(draw, anchor.drawing, at.x, at.y);
      draw.restore();
    }
  }
}

function fallbackLabel(pageIndex: number, total: number): PageLabel {
  return {
    sectionIndex: 0,
    pageInSection: pageIndex + 1,
    pageNumber: pageIndex + 1,
    sectionPages: total,
    totalPages: total,
  };
}
