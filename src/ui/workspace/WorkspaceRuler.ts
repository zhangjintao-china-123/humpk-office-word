import type { Paragraph } from "../../model/block/Paragraph";
import type { PageSetup } from "../../render/page/PageSetup";
import { Draw } from "../../render/canvas/Draw";
import { cmToPx, pxToCm } from "../../shared/units";
import { markerLimits, snapIndent, type IndentBounds, type IndentMarker } from "../../edit/RulerIndent";

const HORIZONTAL = 34;
const VERTICAL = 26;
const LABELS: Record<IndentMarker, string> = {
  first: "首行缩进",
  hanging: "悬挂缩进",
  left: "左缩进",
  right: "右缩进",
};

export interface RulerFrame {
  width: number;
  height: number;
  zoom: number;
  pageX: number;
  pageTops: number[];
  setup: PageSetup;
  paragraph?: Paragraph;
  positions?: Record<IndentMarker, number>;
}

interface MarkerDrag {
  pointer: number;
  marker: IndentMarker;
  x: number;
  initial: number;
  value: number;
}

export class WorkspaceRuler {
  readonly el = document.createElement("div");
  private readonly horizontal = document.createElement("div");
  private readonly guide = document.createElement("div");
  private readonly value = document.createElement("output");
  private readonly horizontalDraw: Draw;
  private readonly verticalDraw: Draw;
  private readonly markers = new Map<IndentMarker, HTMLButtonElement>();
  private frame?: RulerFrame;
  private drag?: MarkerDrag;
  private horizontalKey = "";
  private verticalKey = "";

  constructor(surface: HTMLElement, private readonly change: (marker: IndentMarker, value: number) => void) {
    this.el.className = "ho-word-rulers";
    this.el.hidden = true;
    const corner = document.createElement("span");
    corner.className = "ho-word-ruler-corner";
    corner.textContent = "cm";
    this.horizontal.className = "ho-word-ruler-horizontal";
    const horizontalScale = document.createElement("canvas");
    horizontalScale.setAttribute("aria-label", "水平标尺，单位厘米");
    const verticalScale = document.createElement("canvas");
    verticalScale.className = "ho-word-ruler-vertical";
    verticalScale.setAttribute("aria-label", "垂直标尺，单位厘米");
    this.horizontal.append(horizontalScale);
    this.el.append(corner, this.horizontal, verticalScale);
    this.horizontalDraw = new Draw(horizontalScale);
    this.verticalDraw = new Draw(verticalScale);

    this.guide.className = "ho-word-ruler-guide";
    this.guide.hidden = true;
    this.guide.setAttribute("aria-hidden", "true");
    surface.append(this.guide);
    this.value.className = "ho-word-ruler-value";
    this.value.hidden = true;
    this.horizontal.append(this.value);

    for (const [kind, label] of Object.entries(LABELS) as [IndentMarker, string][]) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "ho-word-ruler-marker";
      marker.dataset.indent = kind;
      marker.setAttribute("role", "slider");
      marker.setAttribute("aria-label", label);
      marker.title = label;
      marker.addEventListener("pointerdown", (event) => this.startDrag(event, kind, marker));
      marker.addEventListener("pointermove", this.moveDrag);
      marker.addEventListener("pointerup", this.finishDrag);
      marker.addEventListener("pointercancel", this.cancelPointer);
      marker.addEventListener("lostpointercapture", this.cancelPointer);
      marker.addEventListener("keydown", (event) => this.keyDown(event, kind));
      this.markers.set(kind, marker);
      this.horizontal.append(marker);
    }
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible;
    if (!visible) this.cancelDrag();
  }

  sync(frame: RulerFrame): void {
    if (this.el.hidden) return;
    const prev = this.frame;
    if (this.drag && prev && (prev.zoom !== frame.zoom || prev.pageX !== frame.pageX || prev.paragraph !== frame.paragraph)) {
      this.cancelDrag();
    }
    this.frame = frame;
    this.paintScales(frame);
    this.paintMarkers();
  }

  private paintScales({ width, height, zoom, setup, pageX, pageTops }: RulerFrame): void {
    const horizontal = [width, zoom, pageX, setup.width, setup.contentLeft(), setup.contentRight()].join("|");
    if (horizontal !== this.horizontalKey) {
      this.horizontalKey = horizontal;
      const draw = this.horizontalDraw;
      if (draw.cssWidth !== width) draw.resize(width, HORIZONTAL);
      draw.clear();
      paintScale(draw, pageX, pageX + setup.width * zoom, pageX + setup.contentLeft() * zoom,
        pageX + setup.contentRight() * zoom, zoom, false);
    }
    const vertical = [height, zoom, setup.height, setup.contentTop(), setup.contentBottom(), ...pageTops].join("|");
    if (vertical !== this.verticalKey) {
      this.verticalKey = vertical;
      const draw = this.verticalDraw;
      if (draw.cssHeight !== height) draw.resize(VERTICAL, height);
      draw.clear();
      for (const top of pageTops) {
        paintScale(draw, top, top + setup.height * zoom, top + setup.contentTop() * zoom,
          top + setup.contentBottom() * zoom, zoom, true);
      }
    }
  }

  private bounds(): IndentBounds {
    const setup = this.frame!.setup;
    return { width: setup.contentWidth, leftMargin: setup.leftMargin, rightMargin: setup.rightMargin };
  }

  private origin(): number {
    const frame = this.frame!;
    return frame.pageX + frame.setup.contentLeft() * frame.zoom;
  }

  private paintMarkers(): void {
    const frame = this.frame;
    const positions = frame?.positions;
    const drag = this.drag;
    for (const [kind, marker] of this.markers) {
      if (!frame || !positions) {
        marker.hidden = true;
        continue;
      }
      const position = drag?.marker === kind ? drag.value : positions[kind];
      const x = this.origin() + position * frame.zoom;
      const range = markerLimits(kind, positions, this.bounds());
      const asIndent = (value: number) => kind === "right" ? frame.setup.contentWidth - value : value;
      const indent = asIndent(position);
      marker.hidden = !drag && (x < 0 || x > frame.width);
      marker.style.left = x + "px";
      marker.setAttribute("aria-valuemin", pxToCm(Math.min(asIndent(range.min), asIndent(range.max), indent)).toFixed(2));
      marker.setAttribute("aria-valuemax", pxToCm(Math.max(asIndent(range.min), asIndent(range.max), indent)).toFixed(2));
      marker.setAttribute("aria-valuenow", pxToCm(indent).toFixed(2));
      marker.setAttribute("aria-valuetext", pxToCm(indent).toFixed(2) + " 厘米");
    }
    if (!frame || !drag) {
      this.guide.hidden = true;
      this.value.hidden = true;
      return;
    }
    const x = this.origin() + drag.value * frame.zoom;
    this.guide.hidden = x < 0 || x > frame.width;
    this.guide.style.left = x + "px";
    const cm = drag.marker === "right" ? pxToCm(frame.setup.contentWidth - drag.value) : pxToCm(drag.value);
    this.value.textContent = cm.toFixed(1) + " cm";
    this.value.style.left = Math.max(22, Math.min(frame.width - 22, x)) + "px";
    this.value.hidden = false;
  }

  private startDrag(event: PointerEvent, kind: IndentMarker, button: HTMLButtonElement): void {
    const positions = this.frame?.positions;
    if (!positions || this.drag || event.button !== 0) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
    button.setPointerCapture?.(event.pointerId);
    const initial = positions[kind];
    this.drag = { pointer: event.pointerId, marker: kind, x: event.clientX, initial, value: initial };
    this.paintMarkers();
  }

  private readonly moveDrag = (event: PointerEvent): void => {
    const { drag, frame } = this;
    if (!drag || !frame?.positions || drag.pointer !== event.pointerId) return;
    this.updateDragValue(event, drag, frame);
    this.paintMarkers();
  };

  private updateDragValue(event: PointerEvent, drag: MarkerDrag, frame: RulerFrame): void {
    const delta = (event.clientX - drag.x) / frame.zoom;
    const range = markerLimits(drag.marker, frame.positions!, this.bounds());
    const zero = drag.marker === "right" ? frame.setup.contentWidth : 0;
    drag.value = Math.abs(delta * frame.zoom) < 2 ? drag.initial : snapIndent(drag.initial + delta, range, zero);
  }

  private readonly finishDrag = (event: PointerEvent): void => {
    const drag = this.drag;
    const frame = this.frame;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (frame?.positions) this.updateDragValue(event, drag, frame);
    this.cancelDrag();
    if (Math.abs(drag.value - drag.initial) > 0.01) this.change(drag.marker, drag.value);
  };

  private readonly cancelPointer = (event: PointerEvent): void => {
    if (this.drag?.pointer === event.pointerId) this.cancelDrag();
  };

  cancelDrag(): boolean {
    if (!this.drag) return false;
    this.drag = undefined;
    this.paintMarkers();
    return true;
  }

  private keyDown(event: KeyboardEvent, kind: IndentMarker): void {
    if (event.key === "Escape" && this.cancelDrag()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const positions = this.frame?.positions;
    if (!positions) return;
    const range = markerLimits(kind, positions, this.bounds());
    const zero = kind === "right" ? this.frame!.setup.contentWidth : 0;
    let next = positions[kind];
    const step = cmToPx(event.shiftKey ? 0.5 : 0.1);
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = snapIndent(next - step, range, zero);
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = snapIndent(next + step, range, zero);
    else if (event.key === "Home") next = range.min;
    else if (event.key === "End") next = range.max;
    else return;
    event.preventDefault();
    if (Math.abs(next - positions[kind]) > 0.01) this.change(kind, next);
  }
}

function paintScale(
  draw: Draw, pageStart: number, pageEnd: number, zero: number, contentEnd: number, zoom: number, vertical: boolean,
): void {
  const viewport = vertical ? draw.cssHeight : draw.cssWidth;
  const size = vertical ? draw.cssWidth : draw.cssHeight;
  if (pageEnd < 0 || pageStart > viewport) return;
  const fill = (from: number, to: number, color: string) => {
    if (to <= from) return;
    draw.setFill(color);
    if (vertical) draw.fillRect(0, from, size, to - from);
    else draw.fillRect(from, 0, to - from, size);
  };
  fill(pageStart, pageEnd, "#dce3ec");
  fill(zero, contentEnd, "#fcfdff");
  const cm = cmToPx(1) * zoom;
  const tickUnit = cm >= 26 ? 0.1 : cm >= 13 ? 0.5 : 1;
  const step = cm * tickUnit;
  const first = Math.ceil((Math.max(0, pageStart) - zero) / step);
  const last = Math.floor((Math.min(viewport, pageEnd) - zero) / step);
  draw.setStroke("#657587", 1);
  draw.setFont("9px system-ui, sans-serif");
  draw.setFill("#34465b");
  draw.beginPath();
  for (let index = first; index <= last; index += 1) {
    const number = index * tickUnit;
    const major = Math.abs(number - Math.round(number)) < 0.001;
    const half = Math.abs(number * 2 - Math.round(number * 2)) < 0.001;
    const tick = major ? 9 : half ? 6 : 3;
    const point = Math.floor(zero + index * step) + 0.5;
    if (vertical) {
      draw.moveTo(size - tick, point);
      draw.lineTo(size, point);
    } else {
      draw.moveTo(point, size - tick);
      draw.lineTo(point, size);
    }
    if (!major || (cm < 22 && Math.round(number) % 2 !== 0)) continue;
    const label = String(Math.round(number));
    if (vertical) draw.fillText(label, 2, point + 3);
    else draw.fillText(label, point - label.length * 2.5, 11);
  }
  draw.stroke();
}
