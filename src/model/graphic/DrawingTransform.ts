import type { Drawing } from "../inline/Drawing";

export interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeRotation(degrees: number | undefined): number {
  if (!degrees || !Number.isFinite(degrees)) {
    return 0;
  }
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 360 ? 0 : Math.round(normalized * 100) / 100;
}

export function drawingRotationRadians(drawing: Drawing | number | undefined): number {
  const deg = typeof drawing === "number" ? drawing : drawing?.rotation;
  const normalized = normalizeRotation(deg);
  return (normalized * Math.PI) / 180;
}

export function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  degrees: number,
): { x: number; y: number } {
  const rad = drawingRotationRadians(degrees);
  if (!rad) {
    return { x: px, y: py };
  }
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export function unrotatePoint(
  px: number,
  py: number,
  box: BoxRect,
  degrees: number | undefined,
): { x: number; y: number } {
  const normalized = normalizeRotation(degrees);
  if (!normalized) {
    return { x: px, y: py };
  }
  return rotatePoint(px, py, box.x + box.width / 2, box.y + box.height / 2, -normalized);
}

export function rotateVector(dx: number, dy: number, degrees: number | undefined): { x: number; y: number } {
  const rad = drawingRotationRadians(degrees);
  if (!rad) {
    return { x: dx, y: dy };
  }
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}
