import type { Document } from "../document/Document";

/** 这一轮支持绘制和切换的形状预设。其余未收录预设按矩形框显示。 */
export type ShapePreset =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "parallelogram"
  | "trapezoid"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "line"
  | "rightArrow"
  | "leftArrow"
  | "upArrow"
  | "downArrow"
  | "chevron"
  | "plus"
  | "star5"
  | "wedgeRectCallout"
  | "unknown";

export interface ShapeInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type TextBoxDirection = "horizontal" | "vertical";
export type TextBoxAlignment = "start" | "center" | "end";

export const DEFAULT_SHAPE_LINE_WIDTH = 1.25;

export interface GraphicShape {
  preset: ShapePreset;
  /** 不填表示不填充。 */
  fill?: string;
  line?: string;
  /** 线宽，像素。 */
  lineWidth?: number;
  /** 文本框里的故事。 */
  text?: Document;
  textDirection?: TextBoxDirection;
  textAlign?: TextBoxAlignment;
  insets: ShapeInsets;
}

export type TextBoxFormat = Partial<
  Pick<GraphicShape, "preset" | "fill" | "line" | "lineWidth" | "textDirection" | "textAlign">
>;

export interface ShapePresetInfo {
  preset: Exclude<ShapePreset, "unknown">;
  label: string;
}

export const SHAPE_PRESET_ITEMS: ShapePresetInfo[] = [
  { preset: "rect", label: "矩形" },
  { preset: "roundRect", label: "圆角矩形" },
  { preset: "ellipse", label: "椭圆" },
  { preset: "triangle", label: "等腰三角形" },
  { preset: "diamond", label: "菱形" },
  { preset: "parallelogram", label: "平行四边形" },
  { preset: "trapezoid", label: "梯形" },
  { preset: "pentagon", label: "五边形" },
  { preset: "hexagon", label: "六边形" },
  { preset: "octagon", label: "八边形" },
  { preset: "rightArrow", label: "右箭头" },
  { preset: "leftArrow", label: "左箭头" },
  { preset: "upArrow", label: "上箭头" },
  { preset: "downArrow", label: "下箭头" },
  { preset: "chevron", label: "燕尾形" },
  { preset: "plus", label: "十字形" },
  { preset: "star5", label: "五角星" },
  { preset: "wedgeRectCallout", label: "矩形标注" },
];

export interface ShapeStylePreset {
  id: string;
  label: string;
  fill?: string;
  line?: string;
  lineWidth?: number;
}

export const SHAPE_STYLE_PRESETS: ShapeStylePreset[] = [
  { id: "outline-black", label: "黑色轮廓，白色填充", fill: "#FFFFFF", line: "#000000", lineWidth: 1 },
  { id: "outline-blue", label: "主题蓝色轮廓", fill: "#FFFFFF", line: "#4472C4", lineWidth: 1.5 },
  { id: "outline-orange", label: "橙色轮廓", fill: "#FFFFFF", line: "#ED7D31", lineWidth: 1.5 },
  { id: "outline-green", label: "绿色轮廓", fill: "#FFFFFF", line: "#70AD47", lineWidth: 1.5 },
  { id: "subtle-blue", label: "浅蓝填充，细轮廓", fill: "#D9E1F2", line: "#4472C4", lineWidth: 1 },
  { id: "subtle-orange", label: "浅橙填充，细轮廓", fill: "#FCE4D6", line: "#ED7D31", lineWidth: 1 },
  { id: "subtle-gold", label: "浅金填充，细轮廓", fill: "#FFF2CC", line: "#FFC000", lineWidth: 1 },
  { id: "subtle-green", label: "浅绿填充，细轮廓", fill: "#E2EFDA", line: "#70AD47", lineWidth: 1 },
  { id: "solid-blue", label: "深蓝实心填充", fill: "#4472C4", line: "#2F5597", lineWidth: 1 },
  { id: "solid-orange", label: "橙色实心填充", fill: "#ED7D31", line: "#C55A11", lineWidth: 1 },
  { id: "solid-gray", label: "灰色实心填充", fill: "#A5A5A5", line: "#7B7B7B", lineWidth: 1 },
  { id: "solid-gold", label: "金色实心填充", fill: "#FFC000", line: "#BF9000", lineWidth: 1 },
  { id: "transparent-outline", label: "透明填充，灰线轮廓", fill: undefined, line: "#7F7F7F", lineWidth: 1 },
  { id: "plain-none", label: "无填充无轮廓", fill: undefined, line: undefined, lineWidth: 1 },
];

const PRESETS: Record<string, ShapePreset> = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  triangle: "triangle",
  diamond: "diamond",
  parallelogram: "parallelogram",
  trapezoid: "trapezoid",
  pentagon: "pentagon",
  hexagon: "hexagon",
  octagon: "octagon",
  line: "line",
  straightConnector1: "line",
  rightArrow: "rightArrow",
  leftArrow: "leftArrow",
  upArrow: "upArrow",
  downArrow: "downArrow",
  chevron: "chevron",
  plus: "plus",
  mathPlus: "plus",
  star5: "star5",
  wedgeRectCallout: "wedgeRectCallout",
};

export function shapePreset(name: string | undefined): ShapePreset {
  if (!name) {
    return "rect";
  }
  return PRESETS[name] ?? "unknown";
}

export function shapePresetLabel(preset: ShapePreset): string {
  if (preset === "line") {
    return "直线";
  }
  return SHAPE_PRESET_ITEMS.find((item) => item.preset === preset)?.label ?? "形状";
}

export const EMPTY_INSETS: ShapeInsets = { left: 0, top: 0, right: 0, bottom: 0 };
