import type { IViewport, Point } from "../../editor/types/IViewport";

export class Viewport implements IViewport {
  zoom = 1;
  scrollX = 0;
  scrollY = 0;

  cssToWorld(x: number, y: number): Point {
    const zoom = this.zoom || 1;
    return {
      x: (x + this.scrollX) / zoom,
      y: (y + this.scrollY) / zoom,
    };
  }

  worldToCss(x: number, y: number): Point {
    const zoom = this.zoom || 1;
    return {
      x: x * zoom - this.scrollX,
      y: y * zoom - this.scrollY,
    };
  }
}
