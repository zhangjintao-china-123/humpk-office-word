import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import type { Drawing, DrawingAnchor } from "../model/inline/Drawing";
import { Word } from "../model/inline/Word";
import type { LinkedNode } from "../model/list/LinkedList";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

export const MIN_PICTURE = 16;
export const PICTURE_WRAP_GAP = 8;
export const PICTURE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type PictureHandle = (typeof PICTURE_HANDLES)[number];

export type PictureWrap = "inline" | "square" | "tight" | "through" | "topBottom" | "behind" | "front";

export const PICTURE_PLACES = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type PicturePlace = (typeof PICTURE_PLACES)[number];

export interface PictureSnap {
  width: number;
  height: number;
  position: "inline" | "anchor";
  lockAspect: boolean;
  anchorSet?: DrawingAnchor;
}

export function snapPicture(drawing: Drawing): PictureSnap {
  return {
    width: drawing.width,
    height: drawing.height,
    position: drawing.position,
    lockAspect: drawing.lockAspect !== false,
    anchorSet: copyAnchor(drawing.anchorSet),
  };
}

export function restorePicture(drawing: Drawing, snap: PictureSnap): void {
  drawing.width = snap.width;
  drawing.height = snap.height;
  drawing.position = snap.position;
  drawing.lockAspect = snap.lockAspect;
  drawing.anchorSet = copyAnchor(snap.anchorSet);
}

export function pictureWrapOf(drawing: Drawing): PictureWrap {
  if (drawing.position !== "anchor") {
    return "inline";
  }
  const set = drawing.anchorSet;
  if (set?.behind) {
    return "behind";
  }
  if (set?.wrapType === "none") {
    return "front";
  }
  if (set?.wrapType === "nowrap") {
    return "topBottom";
  }
  if (set?.wrapType === "tight") {
    return "tight";
  }
  if (set?.wrapType === "through") {
    return "through";
  }
  return "square";
}

export function picturePlaceOf(drawing: Drawing): PicturePlace | "custom" {
  if (drawing.position !== "anchor") {
    return "custom";
  }
  const h = drawing.anchorSet?.leftAlign;
  const v = drawing.anchorSet?.topAlign;
  if (!h || !v) {
    return "custom";
  }
  const vertical = v === "center" ? "middle" : v;
  const key = `${vertical}-${h}`;
  return PICTURE_PLACES.includes(key as PicturePlace) ? (key as PicturePlace) : "custom";
}

export function applyPictureWrap(drawing: Drawing, wrap: PictureWrap, offset?: { left: number; top: number }): void {
  if (wrap === "inline") {
    drawing.position = "inline";
    drawing.anchorSet = undefined;
    return;
  }
  const previous = drawing.anchorSet;
  drawing.position = "anchor";
  drawing.anchorSet = {
    wrapSide: previous?.wrapSide ?? "both",
    distLeft: previous?.distLeft ?? PICTURE_WRAP_GAP,
    distRight: previous?.distRight ?? PICTURE_WRAP_GAP,
    distTop: previous?.distTop ?? PICTURE_WRAP_GAP,
    distBottom: previous?.distBottom ?? PICTURE_WRAP_GAP,
    leftFrom: previous?.leftFrom ?? "column",
    topFrom: previous?.topFrom ?? "paragraph",
    left: previous?.left ?? offset?.left ?? 0,
    top: previous?.top ?? offset?.top ?? 0,
    leftAlign: previous?.leftAlign,
    topAlign: previous?.topAlign,
    wrapType: wrapTypeOf(wrap),
    behind: wrap === "behind",
  };
}

export function applyPicturePlace(drawing: Drawing, place: PicturePlace): void {
  const [vertical, horizontal] = place.split("-");
  const keep = drawing.position === "anchor" ? drawing.anchorSet : undefined;
  drawing.position = "anchor";
  drawing.anchorSet = {
    wrapType: keep?.wrapType && keep.wrapType !== "none" ? keep.wrapType : "square",
    wrapSide: keep?.wrapSide ?? "both",
    distLeft: keep?.distLeft ?? PICTURE_WRAP_GAP,
    distRight: keep?.distRight ?? PICTURE_WRAP_GAP,
    distTop: keep?.distTop ?? PICTURE_WRAP_GAP,
    distBottom: keep?.distBottom ?? PICTURE_WRAP_GAP,
    behind: keep?.behind === true,
    leftFrom: "margin",
    topFrom: "margin",
    leftAlign: horizontal,
    topAlign: vertical === "middle" ? "center" : vertical,
  };
}

export function applyPictureSize(drawing: Drawing, width: number, height: number, lockAspect: boolean): void {
  const ratio = drawing.width / Math.max(drawing.height, 0.01);
  let nextW = Math.max(MIN_PICTURE, width);
  let nextH = Math.max(MIN_PICTURE, height);
  if (lockAspect) {
    if (Math.abs(nextW - drawing.width) >= Math.abs(nextH - drawing.height)) {
      nextH = nextW / ratio;
    } else {
      nextW = nextH * ratio;
    }
  }
  drawing.width = Math.max(MIN_PICTURE, nextW);
  drawing.height = Math.max(MIN_PICTURE, nextH);
  drawing.lockAspect = lockAspect;
}

/** 拖控点。锁定纵横比时四角和四边都按原比例缩放；对边保持不动。 */
export function resizedPicture(
  start: { width: number; height: number },
  handle: PictureHandle,
  dx: number,
  dy: number,
  lockAspect: boolean,
): { width: number; height: number; deltaX: number; deltaY: number } {
  const ratio = start.width / Math.max(start.height, 0.01);
  let width = start.width;
  let height = start.height;
  if (handle.includes("e")) {
    width = start.width + dx;
  } else if (handle.includes("w")) {
    width = start.width - dx;
  }
  if (handle.includes("s")) {
    height = start.height + dy;
  } else if (handle.includes("n")) {
    height = start.height - dy;
  }
  if (lockAspect) {
    if (handle === "n" || handle === "s") {
      height = Math.max(MIN_PICTURE, height);
      width = height * ratio;
    } else if (handle === "e" || handle === "w") {
      width = Math.max(MIN_PICTURE, width);
      height = width / ratio;
    } else {
      const sx = width / Math.max(start.width, 0.01);
      const sy = height / Math.max(start.height, 0.01);
      const scale = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
      width = start.width * scale;
      height = start.height * scale;
    }
  }
  width = Math.max(MIN_PICTURE, width);
  height = Math.max(MIN_PICTURE, height);
  return {
    width,
    height,
    deltaX: handle.includes("w") ? start.width - width : 0,
    deltaY: handle.includes("n") ? start.height - height : 0,
  };
}

export function pictureHandleCenters(x: number, y: number, width: number, height: number): Record<PictureHandle, { x: number; y: number }> {
  return {
    nw: { x, y },
    n: { x: x + width / 2, y },
    ne: { x: x + width, y },
    e: { x: x + width, y: y + height / 2 },
    se: { x: x + width, y: y + height },
    s: { x: x + width / 2, y: y + height },
    sw: { x, y: y + height },
    w: { x, y: y + height / 2 },
  };
}

export function pickPictureHandle(
  x: number,
  y: number,
  box: { x: number; y: number; width: number; height: number },
  slop: number,
): PictureHandle | null {
  const size = Math.max(6, slop);
  let best: { handle: PictureHandle; dist: number } | null = null;
  const centers = pictureHandleCenters(box.x, box.y, box.width, box.height);
  for (const handle of PICTURE_HANDLES) {
    const at = centers[handle];
    const dist = Math.hypot(x - at.x, y - at.y);
    if (dist <= size && (!best || dist < best.dist)) {
      best = { handle, dist };
    }
  }
  if (best) {
    return best.handle;
  }
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  const onL = Math.abs(x - left) <= size;
  const onR = Math.abs(x - right) <= size;
  const onT = Math.abs(y - top) <= size;
  const onB = Math.abs(y - bottom) <= size;
  const inX = x >= left - size && x <= right + size;
  const inY = y >= top - size && y <= bottom + size;
  if (onT && onL) {
    return "nw";
  }
  if (onT && onR) {
    return "ne";
  }
  if (onB && onL) {
    return "sw";
  }
  if (onB && onR) {
    return "se";
  }
  if (onT && inX) {
    return "n";
  }
  if (onB && inX) {
    return "s";
  }
  if (onL && inY) {
    return "w";
  }
  if (onR && inY) {
    return "e";
  }
  return null;
}

export function pictureHandleCursor(handle: PictureHandle): string {
  if (handle === "n" || handle === "s") {
    return "ns-resize";
  }
  if (handle === "e" || handle === "w") {
    return "ew-resize";
  }
  if (handle === "ne" || handle === "sw") {
    return "nesw-resize";
  }
  return "nwse-resize";
}

/** 单元格嵌入图单击只选中：点选抖动不该改成环绕。 */
export function canDragPicture(story: StoryRef, position: "inline" | "anchor"): boolean {
  return position === "anchor" || story.slot !== "cell";
}

/** 浮动偏移：单元格相对段首，正文相对栏。 */
export function pictureWrapOffset(
  hit: { x: number; y: number; story: StoryRef; drawing: Drawing },
  paragraphOrigin: { x: number; y: number } | null,
  storyPoint: { x: number; y: number } | null,
  paraTop = 0,
): { left: number; top: number } {
  if (hit.story.slot === "cell") {
    if (!paragraphOrigin) {
      return { left: hit.drawing.anchorSet?.left ?? 0, top: hit.drawing.anchorSet?.top ?? 0 };
    }
    return { left: hit.x - paragraphOrigin.x, top: hit.y - paragraphOrigin.y };
  }
  if (!storyPoint) {
    return { left: hit.drawing.anchorSet?.left ?? 0, top: hit.drawing.anchorSet?.top ?? 0 };
  }
  return { left: storyPoint.x, top: storyPoint.y - paraTop };
}

export function samePicture(a: PictureSnap, b: PictureSnap): boolean {
  return (
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5 &&
    a.position === b.position &&
    a.lockAspect === b.lockAspect &&
    sameAnchor(a.anchorSet, b.anchorSet)
  );
}

export function findDrawingNode(document: Document, drawing: Drawing): LinkedNode<Word> | null {
  let node = document.words.head;
  while (node) {
    if (node.data.drawing === drawing) {
      return node;
    }
    node = node.next;
  }
  return null;
}

/** 浮动图不进字流；改回嵌入时插到段尾回车前。 */
export function syncPictureStream(document: Document, paragraph: Paragraph, drawing: Drawing): void {
  const found = findDrawingNode(document, drawing);
  if (drawing.position === "anchor") {
    if (found) {
      document.words.removeNode(found);
    }
    return;
  }
  if (found) {
    found.data.kind = "drawing";
    found.data.drawing = drawing;
    found.data.paragraph = paragraph;
    return;
  }
  const block = paragraph.blocks.find((item) => item.drawing === drawing);
  if (!block) {
    return;
  }
  const word = new Word();
  word.kind = "drawing";
  word.drawing = drawing;
  word.block = block;
  word.paragraph = paragraph;
  const enter = enterOf(document, paragraph);
  if (enter) {
    document.words.insertBefore(enter, word);
  } else {
    document.words.append(word);
  }
}

export class PictureTransformCommand implements EditCommand {
  constructor(
    private readonly ctx: EditContext,
    private readonly drawing: Drawing,
    private readonly story: StoryRef,
    private readonly paragraph: Paragraph,
    private readonly before: PictureSnap,
    private readonly after: PictureSnap,
  ) {}

  do(): void {
    this.apply(this.after);
  }

  undo(): void {
    this.apply(this.before);
  }

  private apply(snap: PictureSnap): void {
    restorePicture(this.drawing, snap);
    const document = this.ctx.documentOf(this.story);
    if (document) {
      syncPictureStream(document, this.paragraph, this.drawing);
    }
    const impact = new EditImpact(this.story, [this.paragraph]);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }
}

function wrapTypeOf(wrap: PictureWrap): NonNullable<DrawingAnchor["wrapType"]> {
  if (wrap === "tight") {
    return "tight";
  }
  if (wrap === "through") {
    return "through";
  }
  if (wrap === "topBottom") {
    return "nowrap";
  }
  if (wrap === "behind" || wrap === "front") {
    return "none";
  }
  return "square";
}

function copyAnchor(set?: DrawingAnchor): DrawingAnchor | undefined {
  if (!set) {
    return undefined;
  }
  return {
    ...set,
    polygon: set.polygon?.map((point) => ({ x: point.x, y: point.y })),
  };
}

function sameAnchor(a?: DrawingAnchor, b?: DrawingAnchor): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.wrapType === b.wrapType &&
    a.behind === b.behind &&
    a.leftAlign === b.leftAlign &&
    a.topAlign === b.topAlign &&
    a.leftFrom === b.leftFrom &&
    a.topFrom === b.topFrom &&
    Math.abs((a.left ?? 0) - (b.left ?? 0)) < 0.5 &&
    Math.abs((a.top ?? 0) - (b.top ?? 0)) < 0.5
  );
}

function enterOf(document: Document, paragraph: Paragraph): LinkedNode<Word> | null {
  let node = document.words.head;
  while (node) {
    if (node.data.paragraph === paragraph && node.data.isEnterChar()) {
      return node;
    }
    node = node.next;
  }
  return null;
}
