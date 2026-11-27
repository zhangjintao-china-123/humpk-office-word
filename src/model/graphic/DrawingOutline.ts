import type { Drawing, WrapPoint } from "../inline/Drawing";
import { rotatePoint } from "./DrawingTransform";

export const WORD_WRAP_EXTENT = 21600;

export function rectangleOutline(width: number, height: number): WrapPoint[] {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

/** 导入轮廓随图缩放，未指定时使用预设形状自身的外轮廓。 */
export function drawingOutline(drawing: Drawing): WrapPoint[] {
  const { width, height } = drawing;
  const anchor = drawing.anchorSet;
  if (anchor?.polygon && anchor.polygon.length >= 3) {
    const xScale = width / (anchor.polygonExtent?.width || width || 1);
    const yScale = height / (anchor.polygonExtent?.height || height || 1);
    return anchor.polygon.map(({ x, y }) => ({ x: x * xScale, y: y * yScale }));
  }
  switch (drawing.shape?.preset) {
    case "ellipse":
      return Array.from({ length: 32 }, (_, index) => {
        const angle = index * Math.PI / 16;
        return { x: width * (1 + Math.cos(angle)) / 2, y: height * (1 + Math.sin(angle)) / 2 };
      });
    case "triangle":
      return [{ x: width / 2, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    case "diamond":
      return [{ x: width / 2, y: 0 }, { x: width, y: height / 2 }, { x: width / 2, y: height }, { x: 0, y: height / 2 }];
    case "rightArrow": {
      const shaft = width * 0.62;
      const top = height * 0.28;
      const bottom = height - top;
      return [{ x: 0, y: top }, { x: shaft, y: top }, { x: shaft, y: 0 }, { x: width, y: height / 2 },
        { x: shaft, y: height }, { x: shaft, y: bottom }, { x: 0, y: bottom }];
    }
    case "chevron": {
      const notch = Math.min(width * 0.28, height * 0.45);
      return [{ x: 0, y: 0 }, { x: width - notch, y: 0 }, { x: width, y: height / 2 },
        { x: width - notch, y: height }, { x: 0, y: height }, { x: notch, y: height / 2 }];
    }
    default:
      return rectangleOutline(width, height);
  }
}

export function placeOutline(drawing: Drawing, points: WrapPoint[], x: number, y: number): WrapPoint[] {
  const { width, height } = drawing;
  return points.map((point) => {
    const rotated = rotatePoint(
      drawing.flipH ? width - point.x : point.x,
      drawing.flipV ? height - point.y : point.y,
      width / 2,
      height / 2,
      drawing.rotation ?? 0,
    );
    return { x: x + rotated.x, y: y + rotated.y };
  });
}
