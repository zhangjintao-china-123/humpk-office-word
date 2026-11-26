import type { Drawing } from "../../model/inline/Drawing";
import { DEFAULT_SHAPE_LINE_WIDTH, type ShapePreset } from "../../model/graphic/Shape";
import { Draw } from "../canvas/Draw";

export function paintShape(draw: Draw, drawing: Drawing, x: number, y: number): void {
  const shape = drawing.shape;
  if (!shape) {
    return;
  }
  const width = Math.max(drawing.width, 1);
  const height = Math.max(drawing.height, 1);
  if (shape.preset === "line") {
    draw.setStroke(shape.line || "#1F4E79", shape.lineWidth || 1.5);
    draw.beginPath();
    draw.moveTo(x, y + height / 2);
    draw.lineTo(x + width, y + height / 2);
    draw.stroke();
    return;
  }
  if (shape.preset === "plus") {
    paintPlus(draw, x, y, width, height, shape.fill, shape.line, shape.lineWidth);
    return;
  }
  trace(draw, shape.preset, x, y, width, height);
  if (shape.fill) {
    draw.setFill(shape.fill);
    draw.fill();
  }
  if (shape.line) {
    draw.setStroke(shape.line, shape.lineWidth || DEFAULT_SHAPE_LINE_WIDTH);
    draw.stroke();
  }
}

function trace(draw: Draw, preset: ShapePreset, x: number, y: number, width: number, height: number): void {
  draw.beginPath();
  if (preset === "ellipse") {
    draw.ellipse(x + width / 2, y + height / 2, width / 2, height / 2);
    return;
  }
  if (preset === "triangle") {
    draw.moveTo(x + width / 2, y);
    draw.lineTo(x + width, y + height);
    draw.lineTo(x, y + height);
    draw.closePath();
    return;
  }
  if (preset === "diamond") {
    draw.moveTo(x + width / 2, y);
    draw.lineTo(x + width, y + height / 2);
    draw.lineTo(x + width / 2, y + height);
    draw.lineTo(x, y + height / 2);
    draw.closePath();
    return;
  }
  if (preset === "parallelogram") {
    const skew = Math.min(width * 0.22, height * 0.6);
    draw.moveTo(x + skew, y);
    draw.lineTo(x + width, y);
    draw.lineTo(x + width - skew, y + height);
    draw.lineTo(x, y + height);
    draw.closePath();
    return;
  }
  if (preset === "trapezoid") {
    const inset = Math.min(width * 0.2, height * 0.5);
    draw.moveTo(x + inset, y);
    draw.lineTo(x + width - inset, y);
    draw.lineTo(x + width, y + height);
    draw.lineTo(x, y + height);
    draw.closePath();
    return;
  }
  if (preset === "pentagon") {
    polygon(draw, x, y, width, height, [
      [0.5, 0],
      [1, 0.38],
      [0.81, 1],
      [0.19, 1],
      [0, 0.38],
    ]);
    return;
  }
  if (preset === "hexagon") {
    polygon(draw, x, y, width, height, [
      [0.22, 0],
      [0.78, 0],
      [1, 0.5],
      [0.78, 1],
      [0.22, 1],
      [0, 0.5],
    ]);
    return;
  }
  if (preset === "octagon") {
    const c = 0.29;
    polygon(draw, x, y, width, height, [
      [c, 0],
      [1 - c, 0],
      [1, c],
      [1, 1 - c],
      [1 - c, 1],
      [c, 1],
      [0, 1 - c],
      [0, c],
    ]);
    return;
  }
  if (preset === "rightArrow") {
    const shaft = width * 0.62;
    const mid = height * 0.28;
    draw.moveTo(x, y + mid);
    draw.lineTo(x + shaft, y + mid);
    draw.lineTo(x + shaft, y);
    draw.lineTo(x + width, y + height / 2);
    draw.lineTo(x + shaft, y + height);
    draw.lineTo(x + shaft, y + height - mid);
    draw.lineTo(x, y + height - mid);
    draw.closePath();
    return;
  }
  if (preset === "leftArrow") {
    const head = width * 0.38;
    const mid = height * 0.28;
    draw.moveTo(x, y + height / 2);
    draw.lineTo(x + head, y);
    draw.lineTo(x + head, y + mid);
    draw.lineTo(x + width, y + mid);
    draw.lineTo(x + width, y + height - mid);
    draw.lineTo(x + head, y + height - mid);
    draw.lineTo(x + head, y + height);
    draw.closePath();
    return;
  }
  if (preset === "upArrow") {
    const head = height * 0.38;
    const mid = width * 0.28;
    draw.moveTo(x + width / 2, y);
    draw.lineTo(x + width, y + head);
    draw.lineTo(x + width - mid, y + head);
    draw.lineTo(x + width - mid, y + height);
    draw.lineTo(x + mid, y + height);
    draw.lineTo(x + mid, y + head);
    draw.lineTo(x, y + head);
    draw.closePath();
    return;
  }
  if (preset === "downArrow") {
    const shaft = height * 0.62;
    const mid = width * 0.28;
    draw.moveTo(x + mid, y);
    draw.lineTo(x + width - mid, y);
    draw.lineTo(x + width - mid, y + shaft);
    draw.lineTo(x + width, y + shaft);
    draw.lineTo(x + width / 2, y + height);
    draw.lineTo(x, y + shaft);
    draw.lineTo(x + mid, y + shaft);
    draw.closePath();
    return;
  }
  if (preset === "chevron") {
    const notch = Math.min(width * 0.28, height * 0.45);
    draw.moveTo(x, y);
    draw.lineTo(x + width - notch, y);
    draw.lineTo(x + width, y + height / 2);
    draw.lineTo(x + width - notch, y + height);
    draw.lineTo(x, y + height);
    draw.lineTo(x + notch, y + height / 2);
    draw.closePath();
    return;
  }
  if (preset === "star5") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const scale = i % 2 === 0 ? 1 : 0.4;
      const px = cx + Math.cos(angle) * rx * scale;
      const py = cy + Math.sin(angle) * ry * scale;
      if (i === 0) {
        draw.moveTo(px, py);
      } else {
        draw.lineTo(px, py);
      }
    }
    draw.closePath();
    return;
  }
  if (preset === "wedgeRectCallout") {
    const bodyBottom = y + height * 0.8;
    draw.moveTo(x, y);
    draw.lineTo(x + width, y);
    draw.lineTo(x + width, bodyBottom);
    draw.lineTo(x + width * 0.42, bodyBottom);
    draw.lineTo(x + width * 0.22, y + height);
    draw.lineTo(x + width * 0.26, bodyBottom);
    draw.lineTo(x, bodyBottom);
    draw.closePath();
    return;
  }
  if (preset === "roundRect") {
    const radius = Math.min(8, width / 4, height / 4);
    draw.moveTo(x + radius, y);
    draw.lineTo(x + width - radius, y);
    draw.arcTo(x + width, y, x + width, y + radius, radius);
    draw.lineTo(x + width, y + height - radius);
    draw.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    draw.lineTo(x + radius, y + height);
    draw.arcTo(x, y + height, x, y + height - radius, radius);
    draw.lineTo(x, y + radius);
    draw.arcTo(x, y, x + radius, y, radius);
    draw.closePath();
    return;
  }
  draw.rect(x, y, width, height);
}

function polygon(draw: Draw, x: number, y: number, width: number, height: number, pts: Array<[number, number]>): void {
  pts.forEach(([px, py], index) => {
    const vx = x + width * px;
    const vy = y + height * py;
    if (index === 0) {
      draw.moveTo(vx, vy);
    } else {
      draw.lineTo(vx, vy);
    }
  });
  draw.closePath();
}

function paintPlus(
  draw: Draw,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string | undefined,
  line: string | undefined,
  lineWidth: number | undefined,
): void {
  const color = fill || line || "#1F4E79";
  draw.setFill(color);
  const bar = Math.min(width, height) * 0.28;
  draw.fillRect(x + (width - bar) / 2, y, bar, height);
  draw.fillRect(x, y + (height - bar) / 2, width, bar);
  if (line && line !== fill) {
    draw.setStroke(line, lineWidth || DEFAULT_SHAPE_LINE_WIDTH);
    draw.strokeRect(x + (width - bar) / 2, y, bar, height);
    draw.strokeRect(x, y + (height - bar) / 2, width, bar);
  }
}
