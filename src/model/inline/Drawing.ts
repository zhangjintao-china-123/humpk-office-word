export type WrapType = "none" | "square" | "tight" | "through" | "nowrap";
export type WrapSide = "both" | "left" | "right";

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
  url?: string;
  position: "inline" | "anchor" = "inline";
  anchorSet?: DrawingAnchor;
}
