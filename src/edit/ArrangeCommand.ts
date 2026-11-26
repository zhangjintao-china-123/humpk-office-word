import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import { normalizeRotation } from "../model/graphic/DrawingTransform";
import type { Drawing } from "../model/inline/Drawing";
import type { PlacedAnchor } from "../model/inline/PlacedAnchor";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import {
  applyPictureWrap,
  PICTURE_WRAP_GAP,
  restorePicture,
  samePicture,
  syncPictureStream,
  type PictureSnap,
} from "./PictureTransform";

export type RotateAction = "rotate90" | "rotate-90" | "flipH" | "flipV" | "reset";
export type LayerOrderAction =
  | "bringForward"
  | "bringToFront"
  | "inFrontOfText"
  | "sendBackward"
  | "sendToBack"
  | "behindText";
export type AlignReference = "margin" | "page";
export type AlignAction = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAction = "distributeH" | "distributeV";

export interface DrawingEntry {
  drawing: Drawing;
  paragraph: Paragraph;
}

export function applyRotateAction(drawing: Drawing, action: RotateAction): void {
  if (action === "rotate90") {
    const next = normalizeRotation((drawing.rotation ?? 0) + 90);
    drawing.rotation = next || undefined;
    return;
  }
  if (action === "rotate-90") {
    const next = normalizeRotation((drawing.rotation ?? 0) - 90);
    drawing.rotation = next || undefined;
    return;
  }
  if (action === "flipH") {
    drawing.flipH = !drawing.flipH || undefined;
    return;
  }
  if (action === "flipV") {
    drawing.flipV = !drawing.flipV || undefined;
    return;
  }
  drawing.rotation = undefined;
  drawing.flipH = undefined;
  drawing.flipV = undefined;
}

export function applyDrawingAlign(
  drawing: Drawing,
  action: AlignAction,
  reference: AlignReference,
  fallbackOffset?: { left: number; top: number },
): void {
  if (drawing.position !== "anchor") {
    applyPictureWrap(drawing, drawing.shape?.text ? "front" : "square", fallbackOffset);
  }
  const previous = drawing.anchorSet;
  const wrapType = previous?.wrapType ?? (drawing.shape?.text ? "none" : "square");
  const gap = wrapType === "none" ? 0 : PICTURE_WRAP_GAP;
  const from = reference === "page" ? "page" : "margin";
  const next = {
    ...previous,
    wrapType,
    wrapSide: previous?.wrapSide ?? "both",
    distLeft: previous?.distLeft ?? gap,
    distRight: previous?.distRight ?? gap,
    distTop: previous?.distTop ?? gap,
    distBottom: previous?.distBottom ?? gap,
  };
  if (action === "left" || action === "center" || action === "right") {
    next.leftFrom = from;
    next.leftAlign = action;
    next.left = undefined;
  } else {
    next.topFrom = from;
    next.topAlign = action === "middle" ? "center" : action;
    next.top = undefined;
  }
  drawing.anchorSet = next;
}

export function collectAnchoredEntries(document: Document): DrawingEntry[] {
  const found: Array<DrawingEntry & { order: number }> = [];
  let order = 0;
  let maxZ = 0;
  document.paragraphs.each((node) => {
    for (const block of node.data.blocks) {
      if (block.drawing?.position === "anchor") {
        const z = block.drawing.anchorSet?.zIndex;
        if (z != null && Number.isFinite(z)) {
          maxZ = Math.max(maxZ, z);
        }
        found.push({ drawing: block.drawing, paragraph: node.data, order });
        order += 1;
      }
    }
  });
  found.sort((a, b) => {
    const behindA = a.drawing.anchorSet?.behind ? 0 : 1;
    const behindB = b.drawing.anchorSet?.behind ? 0 : 1;
    if (behindA !== behindB) {
      return behindA - behindB;
    }
    const zA = a.drawing.anchorSet?.zIndex ?? maxZ + 1 + a.order;
    const zB = b.drawing.anchorSet?.zIndex ?? maxZ + 1 + b.order;
    return zA - zB || a.order - b.order;
  });
  return found.map(({ drawing, paragraph }) => ({ drawing, paragraph }));
}

export function applyLayerOrder(
  document: Document,
  target: Drawing,
  action: LayerOrderAction,
  fallbackOffset?: { left: number; top: number },
): void {
  if (target.position !== "anchor") {
    applyPictureWrap(target, target.shape?.text ? "front" : "square", fallbackOffset);
  }
  if (action === "inFrontOfText" || action === "behindText") {
    const previous = target.anchorSet;
    target.anchorSet = {
      ...previous,
      wrapType: "none",
      behind: action === "behindText",
    };
  }

  const ordered = collectAnchoredEntries(document).map((entry) => entry.drawing);
  const behind = ordered.filter((item) => item.anchorSet?.behind);
  const front = ordered.filter((item) => !item.anchorSet?.behind);

  const reorder = (list: Drawing[]) => {
    const index = list.indexOf(target);
    if (index < 0) {
      return;
    }
    if (action === "bringForward" && index < list.length - 1) {
      [list[index], list[index + 1]] = [list[index + 1], list[index]];
    } else if (action === "sendBackward" && index > 0) {
      [list[index], list[index - 1]] = [list[index - 1], list[index]];
    } else if (action === "bringToFront" || action === "inFrontOfText") {
      list.splice(index, 1);
      list.push(target);
    } else if (action === "sendToBack") {
      list.splice(index, 1);
      list.unshift(target);
    }
  };

  if (target.anchorSet?.behind) {
    reorder(behind);
  } else {
    reorder(front);
  }

  const merged = [...behind, ...front];
  merged.forEach((drawing, index) => {
    drawing.anchorSet = {
      ...drawing.anchorSet,
      zIndex: (index + 1) * 100,
    };
  });
}

export function distributeAnchoredDrawings(
  anchors: PlacedAnchor[],
  axis: DistributeAction,
): Array<{ drawing: Drawing; paragraph: Paragraph; dx: number; dy: number }> {
  const visible = anchors.filter((anchor) => anchor.paragraph && !anchor.drawing.hidden);
  if (visible.length < 3) {
    return [];
  }
  if (axis === "distributeH") {
    const sorted = [...visible].sort((a, b) => a.x + a.width / 2 - (b.x + b.width / 2));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSpan = last.x + last.width - first.x;
    const sumWidths = sorted.reduce((sum, item) => sum + item.width, 0);
    const gap = (totalSpan - sumWidths) / (sorted.length - 1);
    let cursor = first.x + first.width + gap;
    const changes: Array<{ drawing: Drawing; paragraph: Paragraph; dx: number; dy: number }> = [];
    for (let i = 1; i < sorted.length - 1; i += 1) {
      const item = sorted[i];
      const dx = cursor - item.x;
      cursor += item.width + gap;
      if (Math.abs(dx) >= 0.5 && item.paragraph) {
        changes.push({ drawing: item.drawing, paragraph: item.paragraph, dx, dy: 0 });
      }
    }
    return changes;
  }

  const sorted = [...visible].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSpan = last.y + last.height - first.y;
  const sumHeights = sorted.reduce((sum, item) => sum + item.height, 0);
  const gap = (totalSpan - sumHeights) / (sorted.length - 1);
  let cursor = first.y + first.height + gap;
  const changes: Array<{ drawing: Drawing; paragraph: Paragraph; dx: number; dy: number }> = [];
  for (let i = 1; i < sorted.length - 1; i += 1) {
    const item = sorted[i];
    const dy = cursor - item.y;
    cursor += item.height + gap;
    if (Math.abs(dy) >= 0.5 && item.paragraph) {
      changes.push({ drawing: item.drawing, paragraph: item.paragraph, dx: 0, dy });
    }
  }
  return changes;
}

export interface DrawingBatchEntry {
  drawing: Drawing;
  paragraph: Paragraph;
  before: PictureSnap;
  after: PictureSnap;
}

export class DrawingBatchCommand implements EditCommand {
  constructor(
    private readonly ctx: EditContext,
    private readonly story: StoryRef,
    private readonly entries: DrawingBatchEntry[],
  ) {}

  changed(): boolean {
    return this.entries.some((entry) => !samePicture(entry.before, entry.after));
  }

  do(): void {
    this.apply(true);
  }

  undo(): void {
    this.apply(false);
  }

  private apply(forward: boolean): void {
    const document = this.ctx.documentOf(this.story);
    const paragraphs: Paragraph[] = [];
    for (const entry of this.entries) {
      restorePicture(entry.drawing, forward ? entry.after : entry.before);
      if (document) {
        syncPictureStream(document, entry.paragraph, entry.drawing);
      }
      if (!paragraphs.includes(entry.paragraph)) {
        paragraphs.push(entry.paragraph);
      }
    }
    if (!paragraphs.length) {
      return;
    }
    const impact = new EditImpact(this.story, paragraphs);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }
}
