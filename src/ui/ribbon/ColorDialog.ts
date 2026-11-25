/** Word「颜色」对话框：标准色块，以及可拖动的自定义色面。 */

type Rgb = { r: number; g: number; b: number };
type Model = "rgb" | "hsl";

interface HexCell {
  x: number;
  y: number;
  hex: string;
}

export class ColorDialog {
  private readonly root: HTMLDivElement;
  private readonly standardPage: HTMLElement;
  private readonly customPage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly sv: HTMLElement;
  private readonly svCursor: HTMLElement;
  private readonly hue: HTMLElement;
  private readonly hueCursor: HTMLElement;
  private readonly modelSelect: HTMLSelectElement;
  private readonly channelLabels: HTMLElement[];
  private readonly channelInputs: HTMLInputElement[];
  private readonly nextSwatch: HTMLElement;
  private readonly currentSwatch: HTMLElement;
  private cells: HexCell[] = [];
  private h = 0;
  private s = 0;
  private v = 0;
  private model: Model = "rgb";
  private currentHex = "#000000";
  private onPick: ((hex: string) => void) | null = null;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "ho-word-color-dialog";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ho-word-color-card" role="dialog" aria-label="颜色">
        <div class="ho-word-color-title">颜色</div>
        <div class="ho-word-color-tabs">
          <button type="button" data-color-tab="standard">标准</button>
          <button type="button" data-color-tab="custom" class="is-on">自定义</button>
        </div>
        <div class="ho-word-color-body" data-color-page="standard">
          <canvas class="ho-word-color-hex"></canvas>
        </div>
        <div class="ho-word-color-body" data-color-page="custom" hidden>
          <div class="ho-word-sv" data-sv><span data-sv-cursor></span></div>
          <div class="ho-word-hue" data-hue><span data-hue-cursor></span></div>
          <div class="ho-word-color-fields">
            <label class="ho-word-color-model">颜色模式
              <select data-color-model>
                <option value="rgb">RGB</option>
                <option value="hsl">HSL</option>
              </select>
            </label>
            <label><span data-ch-label>红</span><input type="number" min="0" max="255" data-ch="0" /></label>
            <label><span data-ch-label>绿</span><input type="number" min="0" max="255" data-ch="1" /></label>
            <label><span data-ch-label>蓝</span><input type="number" min="0" max="255" data-ch="2" /></label>
          </div>
        </div>
        <div class="ho-word-color-foot">
          <div class="ho-word-color-preview">
            <div><i data-new></i><span>新增</span></div>
            <div><i data-current></i><span>当前</span></div>
          </div>
          <div class="ho-word-color-actions">
            <button type="button" data-color-ok>确定</button>
            <button type="button" data-color-cancel>取消</button>
          </div>
        </div>
      </div>`;
    document.body.append(this.root);
    this.standardPage = this.root.querySelector("[data-color-page=standard]") as HTMLElement;
    this.customPage = this.root.querySelector("[data-color-page=custom]") as HTMLElement;
    this.canvas = this.root.querySelector("canvas") as HTMLCanvasElement;
    this.sv = this.root.querySelector("[data-sv]") as HTMLElement;
    this.svCursor = this.root.querySelector("[data-sv-cursor]") as HTMLElement;
    this.hue = this.root.querySelector("[data-hue]") as HTMLElement;
    this.hueCursor = this.root.querySelector("[data-hue-cursor]") as HTMLElement;
    this.modelSelect = this.root.querySelector("[data-color-model]") as HTMLSelectElement;
    this.channelLabels = [...this.root.querySelectorAll<HTMLElement>("[data-ch-label]")];
    this.channelInputs = [...this.root.querySelectorAll<HTMLInputElement>("[data-ch]")];
    this.nextSwatch = this.root.querySelector("[data-new]") as HTMLElement;
    this.currentSwatch = this.root.querySelector("[data-current]") as HTMLElement;
    this.root.addEventListener("mousedown", (event) => event.stopPropagation());
    this.root.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target === this.root || target.dataset.colorCancel != null) {
        this.close();
        return;
      }
      if (target.dataset.colorOk != null) {
        this.onPick?.(this.hex());
        this.close();
        return;
      }
      const tab = target.closest<HTMLElement>("[data-color-tab]")?.dataset.colorTab;
      if (tab === "standard" || tab === "custom") {
        this.showTab(tab);
      }
    });
    this.canvas.addEventListener("pointerdown", (event) => this.pickHex(event));
    this.bindDrag(this.sv, (x, y) => {
      this.s = x;
      this.v = 1 - y;
      this.paint();
    });
    this.bindDrag(this.hue, (_x, y) => {
      this.h = y * 360;
      this.paint();
    });
    this.modelSelect.addEventListener("change", () => {
      this.model = this.modelSelect.value === "hsl" ? "hsl" : "rgb";
      this.paint();
    });
    this.channelInputs.forEach((input) => {
      input.addEventListener("input", () => this.readChannels());
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      } else if (event.key === "Enter" && (event.target as HTMLElement).dataset.colorCancel == null) {
        event.preventDefault();
        this.onPick?.(this.hex());
        this.close();
      }
    });
  }

  open(initial: string, onPick: (hex: string) => void): void {
    const rgb = hexToRgb(initial) ?? { r: 0, g: 0, b: 0 };
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    this.h = hsv.h;
    this.s = hsv.s;
    this.v = hsv.v;
    this.currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
    this.onPick = onPick;
    this.root.hidden = false;
    this.showTab("custom");
    this.paint();
  }

  private close(): void {
    this.root.hidden = true;
    this.onPick = null;
  }

  private showTab(tab: "standard" | "custom"): void {
    this.standardPage.hidden = tab !== "standard";
    this.customPage.hidden = tab !== "custom";
    this.root.querySelectorAll<HTMLElement>("[data-color-tab]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.colorTab === tab);
    });
    if (tab === "standard") {
      this.drawStandard();
    }
  }

  private paint(): void {
    const pure = hsvToRgb(this.h, 1, 1);
    this.sv.style.setProperty("--hue", rgbToHex(pure.r, pure.g, pure.b));
    this.svCursor.style.left = `${this.s * 100}%`;
    this.svCursor.style.top = `${(1 - this.v) * 100}%`;
    this.hueCursor.style.top = `${(this.h / 360) * 100}%`;
    const hex = this.hex();
    this.nextSwatch.style.background = hex;
    this.currentSwatch.style.background = this.currentHex;
    const names = this.model === "rgb" ? ["红", "绿", "蓝"] : ["色调", "饱和", "亮度"];
    const values = this.channels();
    this.channelLabels.forEach((label, index) => {
      label.textContent = names[index] ?? "";
    });
    this.channelInputs.forEach((input, index) => {
      if (document.activeElement !== input) {
        input.value = String(values[index] ?? 0);
      }
    });
    if (!this.standardPage.hidden) {
      this.drawStandard();
    }
  }

  private channels(): [number, number, number] {
    if (this.model === "hsl") {
      return [Math.round((this.h / 360) * 255), Math.round(this.s * 255), Math.round(this.v * 255)];
    }
    const { r, g, b } = hsvToRgb(this.h, this.s, this.v);
    return [Math.round(r), Math.round(g), Math.round(b)];
  }

  private readChannels(): void {
    const values = this.channelInputs.map((input) => clamp(Number(input.value), 0, 255));
    if (values.some((value) => Number.isNaN(value))) {
      return;
    }
    if (this.model === "hsl") {
      this.h = (values[0] / 255) * 360;
      this.s = values[1] / 255;
      this.v = values[2] / 255;
    } else {
      const hsv = rgbToHsv(values[0], values[1], values[2]);
      this.h = hsv.h;
      this.s = hsv.s;
      this.v = hsv.v;
    }
    this.paint();
  }

  private hex(): string {
    const { r, g, b } = hsvToRgb(this.h, this.s, this.v);
    return rgbToHex(r, g, b);
  }

  private pickHex(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: HexCell | null = null;
    let bestDist = 14;
    for (const cell of this.cells) {
      const dist = Math.hypot(cell.x - x, cell.y - y);
      if (dist < bestDist) {
        best = cell;
        bestDist = dist;
      }
    }
    if (!best) {
      return;
    }
    const rgb = hexToRgb(best.hex);
    if (!rgb) {
      return;
    }
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    this.h = hsv.h;
    this.s = hsv.s;
    this.v = hsv.v;
    this.paint();
  }

  private drawStandard(): void {
    const cells = buildStandardCells();
    const pad = 14;
    const minX = Math.min(...cells.map((cell) => cell.x));
    const maxX = Math.max(...cells.map((cell) => cell.x));
    const minY = Math.min(...cells.map((cell) => cell.y));
    const maxY = Math.max(...cells.map((cell) => cell.y));
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const ox = pad - minX;
    const oy = pad - minY;
    const selected = this.hex();
    this.cells = cells.map((cell) => ({ ...cell, x: cell.x + ox, y: cell.y + oy }));
    for (const cell of this.cells) {
      traceHex(ctx, cell.x, cell.y, 9);
      ctx.fillStyle = cell.hex;
      ctx.fill();
      const marked = cell.hex === selected;
      ctx.lineWidth = marked ? 2 : 0.5;
      ctx.strokeStyle = marked ? "#111111" : "rgba(0,0,0,0.25)";
      ctx.stroke();
    }
  }

  private bindDrag(el: HTMLElement, apply: (x: number, y: number) => void): void {
    el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const move = (next: PointerEvent) => {
        const rect = el.getBoundingClientRect();
        const x = clamp((next.clientX - rect.left) / rect.width, 0, 1);
        const y = clamp((next.clientY - rect.top) / rect.height, 0, 1);
        apply(x, y);
      };
      move(event);
      const end = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
    });
  }
}

function buildStandardCells(): HexCell[] {
  const size = 12;
  const rings = 8;
  const cells: HexCell[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const coords = ring === 0 ? [[0, 0]] : ringCoords(ring);
    coords.forEach(([q, r], index) => {
      const hue = ring === 0 ? 0 : (index / coords.length) * 360;
      const sat = ring / rings;
      const shade = r > 0 ? r / rings : 0;
      const val = Math.max(0.18, 1 - shade * 0.72);
      const rgb = hsvToRgb(hue, sat, val);
      cells.push({
        x: size * Math.sqrt(3) * (q + r / 2),
        y: size * 1.5 * r,
        hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      });
    });
  }
  return cells;
}

function ringCoords(ring: number): number[][] {
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];
  let q = 0;
  let r = -ring;
  const coords: number[][] = [];
  for (let side = 0; side < 6; side += 1) {
    for (let step = 0; step < ring; step += 1) {
      coords.push([q, r]);
      q += dirs[side][0];
      r += dirs[side][1];
    }
  }
  return coords;
}

function traceHex(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rr) {
      h = ((gg - bb) / delta) % 6;
    } else if (max === gg) {
      h = (bb - rr) / delta + 2;
    } else {
      h = (rr - gg) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rr = 0;
  let gg = 0;
  let bb = 0;
  if (hp < 1) {
    rr = c;
    gg = x;
  } else if (hp < 2) {
    rr = x;
    gg = c;
  } else if (hp < 3) {
    gg = c;
    bb = x;
  } else if (hp < 4) {
    gg = x;
    bb = c;
  } else if (hp < 5) {
    rr = x;
    bb = c;
  } else {
    rr = c;
    bb = x;
  }
  const m = v - c;
  return { r: (rr + m) * 255, g: (gg + m) * 255, b: (bb + m) * 255 };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
