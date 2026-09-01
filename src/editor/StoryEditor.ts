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

export class StoryEditor extends EditorBase {
  readonly pageSetup: PageSetup;
  readonly slot: StorySlot;
  lines: Line[] = [];
  private readonly layoutEngine = new StoryLayout();
  private readonly painter = new StoryPainter();

  constructor(options: StoryEditorOptions) {
    super(options);
    this.pageSetup = options.pageSetup;
    this.slot = options.slot ?? "body";
  }

  pageCount(): number {
    if (this.slot !== "body") {
      return 1;
    }
    const last = this.lines.at(-1);
    const total = last ? last.top + last.height : 0;
    return Math.max(1, Math.ceil(total / this.pageSetup.contentHeight) || 1);
  }

  paintOnPages(origins: PageOrigin[]): void {
    if (!(this.draw instanceof Draw) || origins.length === 0) {
      return;
    }
    if (this.slot === "body") {
      this.paintBody(this.draw, origins);
      return;
    }
    for (const origin of origins) {
      this.paintBand(this.draw, origin);
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
      pageWidth: this.pageSetup.width,
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

  private paintBody(draw: Draw, origins: PageOrigin[]): void {
    const pageH = this.pageSetup.contentHeight;
    const contentX = (origin: PageOrigin) => origin.x + this.pageSetup.contentLeft();
    const contentY = (origin: PageOrigin, storyY: number) => {
      const pageIndex = Math.min(origins.length - 1, Math.floor(storyY / pageH));
      return origin.y + this.pageSetup.contentTop() + (storyY - pageIndex * pageH);
    };
    this.paintAnchors(draw, origins, true, (anchor, origin) => ({
      x: contentX(origin) + anchor.x,
      y: contentY(origin, anchor.y),
    }));
    for (const line of this.lines) {
      const pageIndex = Math.min(origins.length - 1, Math.floor(line.top / pageH));
      const origin = origins[pageIndex];
      draw.save();
      draw.beginPath();
      draw.rect(origin.x, origin.y, this.pageSetup.width, this.pageSetup.height);
      draw.clip();
      this.painter.paintLine(draw, line, contentX(origin), contentY(origin, line.top));
      draw.restore();
    }
    this.paintAnchors(draw, origins, false, (anchor, origin) => ({
      x: contentX(origin) + anchor.x,
      y: contentY(origin, anchor.y),
    }));
  }

  private paintBand(draw: Draw, origin: PageOrigin): void {
    const left = origin.x + this.pageSetup.contentLeft();
    const top = origin.y + this.pageSetup.bandTop(this.slot === "footer" ? "footer" : "header");
    this.paintAnchors(draw, [origin], true, (anchor) => ({ x: left + anchor.x, y: top + anchor.y }));
    for (const line of this.lines) {
      this.painter.paintLine(draw, line, left, top + line.top);
    }
    this.paintAnchors(draw, [origin], false, (anchor) => ({ x: left + anchor.x, y: top + anchor.y }));
  }

  private paintAnchors(
    draw: Draw,
    origins: PageOrigin[],
    behind: boolean,
    locate: (anchor: PlacedAnchor, origin: PageOrigin) => {
      x: number;
      y: number;
    },
  ): void {
    const pageH = this.pageSetup.contentHeight;
    for (const anchor of this.document?.anchors ?? []) {
      if (anchor.behind !== behind) {
        continue;
      }
      const pageIndex = Math.min(origins.length - 1, Math.max(0, Math.floor(anchor.y / pageH)));
      const origin = origins[pageIndex];
      const at = locate(anchor, origin);
      this.painter.paintDrawing(draw, anchor.drawing, at.x, at.y);
    }
  }
}
