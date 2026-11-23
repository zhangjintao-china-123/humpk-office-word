import type { Document } from "../document/Document";

/** 这一轮会画出来的预设。其余预设按矩形框显示。 */
export type ShapePreset =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "line"
  | "rightArrow"
  | "chevron"
  | "plus"
  | "unknown";

export interface ShapeInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GraphicShape {
  preset: ShapePreset;
  /** 不填表示不填充。 */
  fill?: string;
  line?: string;
  /** 线宽，像素。 */
  lineWidth?: number;
  /** 文本框里的故事。横排，按形状宽度减内边距排。 */
  text?: Document;
  insets: ShapeInsets;
}

const PRESETS: Record<string, ShapePreset> = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  triangle: "triangle",
  diamond: "diamond",
  line: "line",
  straightConnector1: "line",
  rightArrow: "rightArrow",
  chevron: "chevron",
  plus: "plus",
  mathPlus: "plus",
};

export function shapePreset(name: string | undefined): ShapePreset {
  if (!name) {
    return "rect";
  }
  return PRESETS[name] ?? "unknown";
}

export const EMPTY_INSETS: ShapeInsets = { left: 0, top: 0, right: 0, bottom: 0 };
