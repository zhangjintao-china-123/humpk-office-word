import type { Line } from "../model/line/Line";
import { CaretPos } from "../selection/CaretPos";
import type { HitContext, HitTester } from "../selection/HitTester";

/** 一次方向键跳到下一个不同的插入位。(字后) 与下一字的 (字前) 是同一位置。 */
export function moveLeft(pos: CaretPos): CaretPos {
  if (!pos.node) {
    return pos;
  }
  if (pos.after) {
    return new CaretPos(pos.story, pos.node, false);
  }
  const pre = pos.node.pre;
  if (!pre) {
    return pos;
  }
  return new CaretPos(pos.story, pre, false);
}

export function moveRight(pos: CaretPos): CaretPos {
  if (!pos.node) {
    return pos;
  }
  if (!pos.after && !pos.node.data.isEnterChar()) {
    return new CaretPos(pos.story, pos.node, true);
  }
  const next = pos.node.next;
  if (!next) {
    return pos;
  }
  if (pos.node.data.isEnterChar() || next.data.isEnterChar()) {
    return new CaretPos(pos.story, next, false);
  }
  return new CaretPos(pos.story, next, true);
}

export function moveLineStart(pos: CaretPos, hit: HitTester, ctx: HitContext): CaretPos {
  const line = hit.lineOf(pos, ctx);
  if (!line?.startNode) {
    return pos;
  }
  return new CaretPos(pos.story, line.startNode, false);
}

export function moveLineEnd(pos: CaretPos, hit: HitTester, ctx: HitContext): CaretPos {
  const line = hit.lineOf(pos, ctx);
  if (!line?.startNode) {
    return pos;
  }
  let node: typeof line.startNode | null = line.startNode;
  let last = line.startNode;
  for (let i = 0; i < line.length; i += 1) {
    if (!node) {
      break;
    }
    last = node;
    node = node.next;
  }
  if (last.data.isEnterChar()) {
    return new CaretPos(pos.story, last, false);
  }
  return new CaretPos(pos.story, last, true);
}

/** 上一行/下一行，保持 preferX（世界坐标）对应的列。 */
export function moveVertical(
  pos: CaretPos,
  dir: -1 | 1,
  preferX: number,
  hit: HitTester,
  ctx: HitContext,
): CaretPos {
  const lines = textLines(hit.storyLines(pos.story, ctx));
  const current = hit.lineOf(pos, ctx);
  if (!current) {
    return pos;
  }
  const index = lines.indexOf(current);
  const next = index < 0 ? undefined : lines[index + dir];
  return next ? caretOnLine(next, pos, preferX, hit, ctx) : pos;
}

/** 按正文页高跳到最近的一行，仍保持 preferX。 */
export function movePage(
  pos: CaretPos,
  dir: -1 | 1,
  preferX: number,
  hit: HitTester,
  ctx: HitContext,
): CaretPos {
  const lines = textLines(hit.storyLines(pos.story, ctx));
  const current = hit.lineOf(pos, ctx);
  if (!current) {
    return pos;
  }
  const currentMid = current.top + current.height / 2;
  const target = currentMid + dir * ctx.pageSetup.contentHeight;
  let best: Line | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const mid = line.top + line.height / 2;
    if ((dir > 0 && mid <= currentMid + 0.5) || (dir < 0 && mid >= currentMid - 0.5)) {
      continue;
    }
    const dist = Math.abs(mid - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = line;
    }
  }
  return best ? caretOnLine(best, pos, preferX, hit, ctx) : pos;
}

function textLines(lines: Line[]): Line[] {
  return lines.filter((line) => line.type !== "table" && line.type !== "page");
}

function caretOnLine(
  line: Line,
  pos: CaretPos,
  preferX: number,
  hit: HitTester,
  ctx: HitContext,
): CaretPos {
  const origin = hit.lineOrigin(line, pos.story, ctx);
  if (!origin) {
    return pos;
  }
  return hit.hitLine(line, preferX - origin.x, pos.story);
}
