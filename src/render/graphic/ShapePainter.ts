import type { Drawing } from "../../model/inline/Drawing";
import type { ShapePreset } from "../../model/graphic/Shape";
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
    draw.setStroke(shape.line, shape.lineWidth || 1.25);
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
    draw.setStroke(line, lineWidth || 1.25);
    draw.strokeRect(x + (width - bar) / 2, y, bar, height);
  }
}
