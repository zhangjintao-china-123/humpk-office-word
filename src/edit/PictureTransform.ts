import type { Block } from "../model/block/Block";
import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import { normalizeRotation, rotateVector, unrotatePoint } from "../model/graphic/DrawingTransform";
import { copyPictureAppearance, type PictureAppearance } from "../model/graphic/PictureAppearance";
import type { Drawing, DrawingAnchor } from "../model/inline/Drawing";
import { Word } from "../model/inline/Word";
import { LinkedNode } from "../model/list/LinkedList";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

export const MIN_PICTURE = 16;
const PICTURE_MINIMUM = { width: MIN_PICTURE, height: MIN_PICTURE };
export const PICTURE_WRAP_GAP = 8;
export const ROTATE_HANDLE_OFFSET = 24;
export const ROTATE_HANDLE_RADIUS = 7;
export const PICTURE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type PictureHandle = (typeof PICTURE_HANDLES)[number];
export type PictureControl = PictureHandle | "rotate";

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
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  name?: string;
  hidden?: boolean;
  url?: string;
  sourceUrl?: string;
  description?: string;
  appearance?: PictureAppearance;
}

export function snapPicture(drawing: Drawing): PictureSnap {
  return {
    width: drawing.width,
    height: drawing.height,
    position: drawing.position,
    lockAspect: drawing.lockAspect !== false,
    anchorSet: copyAnchor(drawing.anchorSet),
    rotation: drawing.rotation,
    flipH: drawing.flipH,
    flipV: drawing.flipV,
    name: drawing.name,
    hidden: drawing.hidden,
    url: drawing.url,
    sourceUrl: drawing.sourceUrl,
    description: drawing.description,
    appearance: copyPictureAppearance(drawing.pictureAppearance),
  };
}

export function restorePicture(drawing: Drawing, snap: PictureSnap): void {
  drawing.width = snap.width;
  drawing.height = snap.height;
  drawing.position = snap.position;
  drawing.lockAspect = snap.lockAspect;
  drawing.anchorSet = copyAnchor(snap.anchorSet);
  drawing.rotation = snap.rotation;
  drawing.flipH = snap.flipH;
  drawing.flipV = snap.flipV;
  drawing.name = snap.name;
  drawing.hidden = snap.hidden;
  drawing.url = snap.url;
  drawing.sourceUrl = snap.sourceUrl;
  drawing.description = snap.description;
  drawing.pictureAppearance = copyPictureAppearance(snap.appearance);
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
    ...previous,
    wrapSide: previous?.wrapSide ?? "both",
    distLeft: previous?.distLeft ?? PICTURE_WRAP_GAP,
    distRight: previous?.distRight ?? PICTURE_WRAP_GAP,
    distTop: previous?.distTop ?? PICTURE_WRAP_GAP,
    distBottom: previous?.distBottom ?? PICTURE_WRAP_GAP,
    leftFrom: previous?.leftFrom ?? "column",
    topFrom: previous?.topFrom ?? "paragraph",
    left: previous?.leftAlign ? undefined : previous?.left ?? offset?.left ?? 0,
    top: previous?.topAlign ? undefined : previous?.top ?? offset?.top ?? 0,
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
    ...keep,
    wrapType: keep ? keep.wrapType ?? "none" : drawing.shape?.text ? "none" : "square",
    wrapSide: keep?.wrapSide ?? "both",
    distLeft: keep?.distLeft ?? PICTURE_WRAP_GAP,
    distRight: keep?.distRight ?? PICTURE_WRAP_GAP,
    distTop: keep?.distTop ?? PICTURE_WRAP_GAP,
    distBottom: keep?.distBottom ?? PICTURE_WRAP_GAP,
    behind: keep?.behind === true,
    leftFrom: "margin",
    topFrom: "margin",
    left: undefined,
    top: undefined,
    simplePosition: undefined,
    leftAlign: horizontal,
    topAlign: vertical === "middle" ? "center" : vertical,
  };
}

export function applyPictureSize(drawing: Drawing, width: number, height: number, lockAspect: boolean): void {
  const textBoxMinimum = minimumTextBoxSize(drawing);
  const minimum = textBoxMinimum ?? PICTURE_MINIMUM;
  const ratio = Math.max(drawing.width, 0.01) / Math.max(drawing.height, 0.01);
  let nextW = Math.max(minimum.width, width);
  let nextH = Math.max(minimum.height, height);
  if (lockAspect) {
    if (Math.abs(nextW - drawing.width) >= Math.abs(nextH - drawing.height)) {
      nextH = nextW / ratio;
    } else {
      nextW = nextH * ratio;
    }
    if (textBoxMinimum) {
      nextW = Math.max(minimum.width, minimum.height * ratio, nextW);
      nextH = nextW / ratio;
    }
  }
  drawing.width = Math.max(minimum.width, nextW);
  drawing.height = Math.max(minimum.height, nextH);
  drawing.lockAspect = lockAspect;
}

export function minimumTextBoxSize(drawing: Drawing): { width: number; height: number } | undefined {
  const shape = drawing.shape;
  if (!shape?.text) {
    return undefined;
  }
  const { left, right, top, bottom } = shape.insets;
  return { width: Math.max(MIN_PICTURE, left + right + 8), height: Math.max(MIN_PICTURE, top + bottom + 8) };
}

/** 拖控点。锁定纵横比时四角和四边都按原比例缩放；对边保持不动。 */
export function resizedPicture(
  start: { width: number; height: number },
  handle: PictureHandle,
  dx: number,
  dy: number,
  lockAspect: boolean,
  textBoxMinimum?: { width: number; height: number },
  rotation = 0,
): { width: number; height: number; deltaX: number; deltaY: number } {
  const minimum = textBoxMinimum ?? PICTURE_MINIMUM;
  const ratio = Math.max(start.width, 0.01) / Math.max(start.height, 0.01);
  const local = normalizeRotation(rotation) ? rotateVector(dx, dy, -rotation) : { x: dx, y: dy };
  let width = start.width;
  let height = start.height;
  if (handle.includes("e")) {
    width = start.width + local.x;
  } else if (handle.includes("w")) {
    width = start.width - local.x;
  }
  if (handle.includes("s")) {
    height = start.height + local.y;
  } else if (handle.includes("n")) {
    height = start.height - local.y;
  }
  if (lockAspect) {
    if (handle === "n" || handle === "s") {
      height = Math.max(minimum.height, height);
      width = height * ratio;
    } else if (handle === "e" || handle === "w") {
      width = Math.max(minimum.width, width);
      height = width / ratio;
    } else {
      const sx = width / Math.max(start.width, 0.01);
      const sy = height / Math.max(start.height, 0.01);
      const scale = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
      width = start.width * scale;
      height = start.height * scale;
    }
    if (textBoxMinimum) {
      width = Math.max(minimum.width, minimum.height * ratio, width);
      height = width / ratio;
    }
  }
  width = Math.max(minimum.width, width);
  height = Math.max(minimum.height, height);
  if (normalizeRotation(rotation)) {
    const shiftX = (handle.includes("e") ? 0.5 : handle.includes("w") ? -0.5 : 0) * (width - start.width);
    const shiftY = (handle.includes("s") ? 0.5 : handle.includes("n") ? -0.5 : 0) * (height - start.height);
    const worldShift = rotateVector(shiftX, shiftY, rotation);
    return {
      width,
      height,
      deltaX: worldShift.x - (width - start.width) / 2,
      deltaY: worldShift.y - (height - start.height) / 2,
    };
  }
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
  box: { x: number; y: number; width: number; height: number; drawing?: Drawing },
  slop: number,
  includeEdges = true,
): PictureHandle | null {
  const pt = unrotatePoint(x, y, box, box.drawing?.rotation);
  const px = pt.x;
  const py = pt.y;
  const size = Math.max(6, slop);
  let best: { handle: PictureHandle; dist: number } | null = null;
  const centers = pictureHandleCenters(box.x, box.y, box.width, box.height);
  for (const handle of PICTURE_HANDLES) {
    const at = centers[handle];
    const dist = Math.hypot(px - at.x, py - at.y);
    if (dist <= size && (!best || dist < best.dist)) {
      best = { handle, dist };
    }
  }
  if (best) {
    return best.handle;
  }
  if (!includeEdges) {
    return null;
  }
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  const onL = Math.abs(px - left) <= size;
  const onR = Math.abs(px - right) <= size;
  const onT = Math.abs(py - top) <= size;
  const onB = Math.abs(py - bottom) <= size;
  const inX = px >= left - size && px <= right + size;
  const inY = py >= top - size && py <= bottom + size;
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

export function rotateHandleCenter(box: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y - ROTATE_HANDLE_OFFSET };
}

export function pickRotateHandle(
  x: number,
  y: number,
  box: { x: number; y: number; width: number; height: number; drawing?: Drawing },
  slop: number,
): boolean {
  const pt = unrotatePoint(x, y, box, box.drawing?.rotation);
  const center = rotateHandleCenter(box);
  const radius = Math.max(ROTATE_HANDLE_RADIUS + 2, slop);
  return Math.hypot(pt.x - center.x, pt.y - center.y) <= radius;
}

export function rotatedAngleFromPointer(
  box: { x: number; y: number; width: number; height: number },
  worldX: number,
  worldY: number,
  snap15 = false,
): number {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const raw = (Math.atan2(worldX - cx, -(worldY - cy)) * 180) / Math.PI;
  const snapped = snap15 ? Math.round(raw / 15) * 15 : Math.round(raw);
  return normalizeRotation(snapped);
}

export function pictureHandleCursor(handle: PictureControl, rotation = 0): string {
  if (handle === "rotate") {
    return "grab";
  }
  const baseAngles: Record<PictureHandle, number> = {
    n: 0,
    ne: 45,
    e: 90,
    se: 135,
    s: 180,
    sw: 225,
    w: 270,
    nw: 315,
  };
  const angle = normalizeRotation(baseAngles[handle] + rotation);
  const sector = Math.round(angle / 45) % 4;
  if (sector === 0) {
    return "ns-resize";
  }
  if (sector === 1) {
    return "nesw-resize";
  }
  if (sector === 2) {
    return "ew-resize";
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
  if ((hit.story.slot === "header" || hit.story.slot === "footer") && paragraphOrigin) {
    return { left: storyPoint.x, top: hit.y - paragraphOrigin.y };
  }
  return { left: storyPoint.x, top: storyPoint.y - paraTop };
}

export function samePicture(a: PictureSnap, b: PictureSnap): boolean {
  return (
    samePictureGeometry(a, b) &&
    a.lockAspect === b.lockAspect &&
    (a.name ?? "") === (b.name ?? "") &&
    a.url === b.url && a.sourceUrl === b.sourceUrl && a.description === b.description &&
    JSON.stringify(a.appearance) === JSON.stringify(b.appearance)
  );
}

function samePictureGeometry(a: PictureSnap, b: PictureSnap): boolean {
  return (
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5 &&
    a.position === b.position &&
    normalizeRotation(a.rotation) === normalizeRotation(b.rotation) &&
    !!a.flipH === !!b.flipH &&
    !!a.flipV === !!b.flipV &&
    !!a.hidden === !!b.hidden &&
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

/** 浮动图不进字流；嵌入图跟随段落中对应 Block 的顺序。 */
export function syncPictureStream(
  document: Document,
  paragraph: Paragraph,
  drawing: Drawing,
  detached?: LinkedNode<Word>,
): LinkedNode<Word> | null {
  const found = findDrawingNode(document, drawing);
  if (drawing.position === "anchor") {
    if (found) {
      document.words.removeNode(found);
    }
    return found;
  }
  if (found) {
    found.data.kind = "drawing";
    found.data.drawing = drawing;
    found.data.paragraph = paragraph;
    return found;
  }
  const index = paragraph.blocks.findIndex((item) => item.drawing === drawing);
  if (index < 0) {
    return null;
  }
  const block = paragraph.blocks[index];
  const node = detached ?? new LinkedNode(new Word());
  const word = node.data;
  word.kind = "drawing";
  word.drawing = drawing;
  word.block = block;
  word.paragraph = paragraph;
  const following = new Set(paragraph.blocks.slice(index + 1));
  let next = document.words.head;
  while (next) {
    const word = next.data;
    if (word.paragraph === paragraph && (word.isEnterChar() || (word.block && following.has(word.block)))) {
      break;
    }
    next = next.next;
  }
  if (next) {
    document.words.insertNodeBefore(next, node);
  } else {
    document.words.appendNode(node);
  }
  return node;
}

export class PictureTransformCommand implements EditCommand {
  private inlineNode?: LinkedNode<Word>;
  private originalBlockIndex?: number;

  constructor(
    private readonly ctx: EditContext,
    private readonly drawing: Drawing,
    private readonly story: StoryRef,
    private readonly paragraph: Paragraph,
    private readonly before: PictureSnap,
    private readonly after: PictureSnap,
    private readonly drop?: { paragraph: Paragraph; page?: { index: number; height: number } },
  ) {}

  do(): void {
    this.apply(this.after, this.drop?.paragraph ?? this.paragraph, this.drop?.page);
  }

  undo(): void {
    this.apply(this.before, this.paragraph);
  }

  private apply(snap: PictureSnap, target: Paragraph, page?: { index: number; height: number }): void {
    const origin = target === this.paragraph ? this.drop?.paragraph ?? target : this.paragraph;
    if (origin !== target) {
      const index = origin.blocks.findIndex((block) => block.drawing === this.drawing);
      if (index >= 0) {
        const [block] = origin.blocks.splice(index, 1);
        if (target === this.paragraph) {
          target.blocks.splice(this.originalBlockIndex ?? target.blocks.length, 0, block);
        } else {
          this.originalBlockIndex = index;
          target.addBlock(block);
        }
      }
    }
    restorePicture(this.drawing, snap);
    const impact = new EditImpact(this.story, origin === target ? [target] : [origin, target]);
    if (!this.drop && samePictureGeometry(this.before, this.after)) {
      this.ctx.afterEdit(impact);
      return;
    }
    const document = this.ctx.documentOf(this.story);
    if (document) {
      this.inlineNode = syncPictureStream(document, target, this.drawing, this.inlineNode) ?? this.inlineNode;
    }
    this.drawing.dropPage = page?.index;
    try {
      this.ctx.relayout.apply(impact);
      const placed = page == null ? undefined : document?.anchors.find((anchor) => anchor.drawing === this.drawing);
      if (page && placed?.referencePage != null && this.drawing.anchorSet) {
        this.drawing.anchorSet.top = (snap.anchorSet?.top ?? 0) +
          (page.index - placed.referencePage) * page.height;
      }
    } finally {
      this.drawing.dropPage = undefined;
    }
    this.ctx.afterEdit(impact);
  }
}

export class RemoveAnchoredDrawingCommand implements EditCommand {
  constructor(
    private readonly ctx: EditContext,
    private readonly story: StoryRef,
    private readonly paragraph: Paragraph,
    private readonly block: Block,
    private readonly index: number,
  ) {}

  do(): void {
    this.paragraph.blocks.splice(this.index, 1);
    this.relayout();
  }

  undo(): void {
    this.paragraph.blocks.splice(this.index, 0, this.block);
    this.relayout();
  }

  private relayout(): void {
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
    polygonExtent: set.polygonExtent && { ...set.polygonExtent },
    effectExtent: set.effectExtent && { ...set.effectExtent },
    simplePosition: set.simplePosition && { ...set.simplePosition },
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
    a.zIndex === b.zIndex &&
    a.leftAlign === b.leftAlign &&
    a.topAlign === b.topAlign &&
    a.leftFrom === b.leftFrom &&
    a.topFrom === b.topFrom &&
    a.wrapSide === b.wrapSide &&
    a.distLeft === b.distLeft &&
    a.distRight === b.distRight &&
    a.distTop === b.distTop &&
    a.distBottom === b.distBottom &&
    a.simplePosition?.x === b.simplePosition?.x &&
    a.simplePosition?.y === b.simplePosition?.y &&
    Math.abs((a.left ?? 0) - (b.left ?? 0)) < 0.5 &&
    Math.abs((a.top ?? 0) - (b.top ?? 0)) < 0.5
  );
}
