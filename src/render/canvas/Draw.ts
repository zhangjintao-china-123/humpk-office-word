import type { IDraw } from "../../editor/types/IDraw";

export class Draw implements IDraw {
  readonly ctx: CanvasRenderingContext2D;
  cssWidth = 0;
  cssHeight = 0;

  constructor(readonly el: HTMLCanvasElement) {
    const ctx = el.getContext("2d");
    if (!ctx) {
      throw new Error("2d context unavailable");
    }
    this.ctx = ctx;
  }

  dpr(): number {
    return globalThis.devicePixelRatio || 1;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const width = Math.max(1, cssWidth);
    const height = Math.max(1, cssHeight);
    this.cssWidth = width;
    this.cssHeight = height;
    const dpr = this.dpr();
    this.el.style.width = `${width}px`;
    this.el.style.height = `${height}px`;
    this.el.width = Math.max(1, Math.round(width * dpr));
    this.el.height = Math.max(1, Math.round(height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(): void {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.el.width, this.el.height);
    this.ctx.restore();
  }

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  setFill(color: string): void {
    this.ctx.fillStyle = color;
  }

  setStroke(color: string, lineWidth = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
  }

  setLineDash(dash: number[]): void {
    this.ctx.setLineDash(dash);
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.ctx.fillRect(x, y, width, height);
  }

  beginPath(): void {
    this.ctx.beginPath();
  }

  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }

  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }

  stroke(): void {
    this.ctx.stroke();
  }

  setFont(font: string): void {
    this.ctx.font = font;
  }

  measureText(text: string): number {
    return this.ctx.measureText(text).width;
  }

  fillText(text: string, x: number, y: number): void {
    this.ctx.fillText(text, x, y);
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.ctx.strokeRect(x, y, width, height);
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.ctx.rect(x, y, width, height);
  }

  clip(): void {
    this.ctx.clip();
  }

  drawImage(image: CanvasImageSource, x: number, y: number, width: number, height: number): void {
    this.ctx.drawImage(image, x, y, width, height);
  }
}
