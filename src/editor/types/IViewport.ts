export interface Point {
  x: number;
  y: number;
}

export interface IViewport {
  zoom: number;
  scrollX: number;
  scrollY: number;
  cssToWorld(x: number, y: number): Point;
  worldToCss(x: number, y: number): Point;
}
