import type { Drawing, WrapPoint, WrapType } from "./Drawing";
import type { Paragraph } from "../block/Paragraph";

export class PlacedAnchor {
  x = 0;
  y = 0;
  paragraphTop?: number;
  pageIndex?: number;
  /** 锚点段落在环绕前所属的页。 */
  referencePage?: number;
  width = 0;
  height = 0;
  wrap: WrapType = "none";
  behind = false;
  wrapLeft = 0;
  wrapRight = 0;
  wrapTop = 0;
  wrapBottom = 0;
  wrapPolygon?: WrapPoint[];

  constructor(
    readonly drawing: Drawing,
    readonly paragraph: Paragraph,
  ) {
    this.width = drawing.width;
    this.height = drawing.height;
    const set = drawing.anchorSet;
    this.wrap = set?.wrapType ?? "none";
    this.behind = set?.behind === true;
  }

  pageOn(contentHeight: number): number {
    return this.pageIndex ?? Math.max(0, Math.floor(this.y / Math.max(1, contentHeight)));
  }

  paragraphOffset(): { left: number; top: number } {
    return { left: this.x, top: this.y - (this.paragraphTop ?? this.paragraph.lines[0]?.top ?? 0) };
  }
}
