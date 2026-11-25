import {
  nearlyEqual,
  resizedColumns,
  resizedRow,
  sameWidths,
  snapTableMetrics,
  type ColumnResizeMode,
  type TableMetricSnap,
} from "../edit/TableResize";
import { type TableGuide, type TableGuideKind } from "./TableGuides";

export interface TableResizeHost {
  clientToWorld(clientX: number, clientY: number): { x: number; y: number };
  zoom(): number;
  guideAt(worldX: number, worldY: number, slop: number): TableGuide | null;
  previewColumns(guide: TableGuide, widths: number[], indent: number, adjustIndent: boolean): void;
  previewRow(guide: TableGuide, height: number): void;
  commit(guide: TableGuide, before: TableMetricSnap): void;
  revert(guide: TableGuide, before: TableMetricSnap): void;
}

const GUIDE_SLOP_PX = 5;

interface Drag {
  guide: TableGuide;
  x: number;
  y: number;
  widths: number[];
  indent: number;
  before: TableMetricSnap;
  dirty: boolean;
  changed: boolean;
  lastKey: string;
}

export class TableResizeController {
  private element: HTMLElement | null = null;
  private drag: Drag | null = null;

  constructor(private readonly host: TableResizeHost) {}

  attach(element: HTMLElement): void {
    this.detach();
    this.element = element;
    element.addEventListener("pointerdown", this.onDown, true);
    element.addEventListener("pointermove", this.onMove);
    element.addEventListener("pointerup", this.onUp);
    element.addEventListener("pointercancel", this.onCancel);
    element.addEventListener("pointerleave", this.onLeave);
    window.addEventListener("keydown", this.onKey, true);
  }

  detach(): void {
    const element = this.element;
    if (this.drag) {
      this.cancel();
    }
    if (!element) {
      return;
    }
    element.removeEventListener("pointerdown", this.onDown, true);
    element.removeEventListener("pointermove", this.onMove);
    element.removeEventListener("pointerup", this.onUp);
    element.removeEventListener("pointercancel", this.onCancel);
    element.removeEventListener("pointerleave", this.onLeave);
    window.removeEventListener("keydown", this.onKey, true);
    this.clearCursor();
    this.element = null;
  }

  private onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.drag) {
      return;
    }
    const world = this.host.clientToWorld(event.clientX, event.clientY);
    const guide = this.host.guideAt(world.x, world.y, this.slop());
    if (!guide) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.element?.setPointerCapture?.(event.pointerId);
    this.drag = {
      guide,
      x: world.x,
      y: world.y,
      widths: guide.widths.slice(),
      indent: guide.indent,
      before: snapTableMetrics(guide.table),
      dirty: false,
      changed: false,
      lastKey: "",
    };
    this.setCursor(cursorFor(guide.kind), true);
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.drag) {
      this.hover(event);
      return;
    }
    const world = this.host.clientToWorld(event.clientX, event.clientY);
    const drag = this.drag;
    if (drag.guide.kind === "row") {
      const height = resizedRow(drag.guide.size, world.y - drag.y);
      const key = `row:${height.toFixed(2)}`;
      if (key === drag.lastKey) {
        return;
      }
      drag.lastKey = key;
      if (!drag.dirty && nearlyEqual(height, drag.guide.size)) {
        return;
      }
      this.host.previewRow(drag.guide, height);
      drag.dirty = true;
      drag.changed = !nearlyEqual(drag.guide.table.rowHeights[drag.guide.index] ?? height, drag.guide.size);
      return;
    }
    const mode = columnMode(drag.guide, event);
    const next = resizedColumns(drag.widths, drag.guide.index, world.x - drag.x, mode, drag.indent);
    const adjustIndent = mode === "left";
    const key = `${mode}:${next.indent.toFixed(2)}:${next.widths.map((width) => width.toFixed(2)).join(",")}`;
    if (key === drag.lastKey) {
      return;
    }
    drag.lastKey = key;
    const same =
      sameWidths(next.widths, drag.widths) && (!adjustIndent || nearlyEqual(next.indent, drag.indent));
    if (!drag.dirty && same) {
      return;
    }
    this.host.previewColumns(drag.guide, next.widths, next.indent, adjustIndent);
    drag.dirty = true;
    const shown = drag.guide.table.columnWidths;
    drag.changed =
      !sameWidths(shown, drag.widths) || (adjustIndent && !nearlyEqual(drag.guide.table.indent?.value ?? 0, drag.indent));
  };

  private onUp = (): void => {
    this.finish();
  };

  private onCancel = (): void => {
    this.cancel();
  };

  private onLeave = (): void => {
    if (!this.drag) {
      this.clearCursor();
    }
  };

  private onKey = (event: KeyboardEvent): void => {
    if (!this.drag || event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  };

  private finish(): void {
    const drag = this.drag;
    this.drag = null;
    this.clearCursor();
    if (!drag?.dirty) {
      return;
    }
    if (drag.changed) {
      this.host.commit(drag.guide, drag.before);
    } else {
      this.host.revert(drag.guide, drag.before);
    }
  }

  private cancel(): void {
    const drag = this.drag;
    this.drag = null;
    this.clearCursor();
    if (drag?.dirty) {
      this.host.revert(drag.guide, drag.before);
    }
  }

  private hover(event: PointerEvent): void {
    const world = this.host.clientToWorld(event.clientX, event.clientY);
    const guide = this.host.guideAt(world.x, world.y, this.slop());
    this.setCursor(guide ? cursorFor(guide.kind) : "", false);
  }

  private slop(): number {
    return GUIDE_SLOP_PX / (this.host.zoom() || 1);
  }

  private setCursor(cursor: string, locked: boolean): void {
    if (this.element) {
      this.element.style.cursor = cursor;
    }
    const root = document.documentElement;
    if (locked && cursor) {
      root.style.setProperty("--ho-resize-cursor", cursor);
      root.classList.add("ho-table-resize");
    } else {
      root.classList.remove("ho-table-resize");
      root.style.removeProperty("--ho-resize-cursor");
    }
  }

  private clearCursor(): void {
    this.setCursor("", false);
  }
}

function columnMode(guide: TableGuide, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): ColumnResizeMode {
  if (guide.kind === "left") {
    return "left";
  }
  if (event.shiftKey) {
    return "pair";
  }
  if (event.ctrlKey || event.metaKey) {
    return "share";
  }
  return "move";
}

function cursorFor(kind: TableGuideKind): string {
  return kind === "row" ? "row-resize" : "col-resize";
}
