import type { GraphicShape } from "../graphic/Shape";

export type WrapType = "none" | "square" | "tight" | "through" | "nowrap";
export type WrapSide = "both" | "left" | "right" | "largest";

export interface WrapPoint {
  x: number;
  y: number;
}

export interface DrawingAnchor {
  leftFrom?: string;
  left?: number;
  leftAlign?: string;
  topFrom?: string;
  top?: number;
  topAlign?: string;
  wrapType?: WrapType;
  wrapSide?: WrapSide;
  behind?: boolean;
  distLeft?: number;
  distRight?: number;
  distTop?: number;
  distBottom?: number;
  polygon?: WrapPoint[];
}

export class Drawing {
  width = 0;
  height = 0;
  /** 浏览器用来绘制的 data URL。 */
  url?: string;
  /** 写回用的原始字节。EMF、WMF、TIFF 画布上用的是抽出来的位图，这里仍保留原件。 */
  sourceUrl?: string;
  position: "inline" | "anchor" = "inline";
  /** 缩放时锁住宽高比，和 Word 图片默认一致。 */
  lockAspect = true;
  anchorSet?: DrawingAnchor;
  /** 预设形状或文本框。没有 url 时按形状画，不再画灰块。 */
  shape?: GraphicShape;
}
