import type { Drawing, WrapType } from "./Drawing";
import type { Paragraph } from "../block/Paragraph";

export class PlacedAnchor {
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  wrap: WrapType = "none";
  behind = false;
  wrapLeft = 0;
  wrapRight = 0;
  wrapTop = 0;
  wrapBottom = 0;

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
}
