import type { Drawing } from "../inline/Drawing";
import { EMPTY_INSETS } from "./Shape";

interface TextBoxOrigin {
  x: number;
  y: number;
  vertical: boolean;
}

/** 竖排把行内坐标向下映射，把下一行向左映射。 */
export function textBoxGeometry(drawing: Drawing, x = 0, y = 0): TextBoxOrigin & { width: number; height: number } {
  const { left, top, right, bottom } = drawing.shape?.insets ?? EMPTY_INSETS;
  const width = Math.max(8, drawing.width - left - right);
  const height = Math.max(8, drawing.height - top - bottom);
  if (drawing.shape?.textDirection === "vertical") {
    return { x: x + drawing.width - right, y: y + top, width: height, height: width, vertical: true };
  }
  return { x: x + left, y: y + top, width, height, vertical: false };
}

export function textBoxContentGeometry(drawing: Drawing, x: number, y: number): ReturnType<typeof textBoxGeometry> {
  const area = textBoxGeometry(drawing, x, y);
  const shape = drawing.shape;
  const alignment = shape?.textAlign;
  if (!alignment || alignment === "start") {
    return area;
  }
  let paragraph = shape.text?.paragraphs.tail;
  while (paragraph && !paragraph.data.lines.length) {
    paragraph = paragraph.pre;
  }
  const lastLine = paragraph?.data.lines.at(-1);
  const occupied = lastLine ? lastLine.top + lastLine.height : 0;
  const free = Math.max(0, area.height - occupied);
  const offset = alignment === "center" ? free / 2 : free;
  return { ...area, ...textBoxPoint(area, 0, offset) };
}

export function textBoxPoint(origin: TextBoxOrigin, x: number, y: number): { x: number; y: number } {
  return origin.vertical ? { x: origin.x - y, y: origin.y + x } : { x: origin.x + x, y: origin.y + y };
}

export function textBoxLocal(origin: TextBoxOrigin, x: number, y: number): { x: number; y: number } {
  return origin.vertical ? { x: y - origin.y, y: origin.x - x } : { x: x - origin.x, y: y - origin.y };
}
