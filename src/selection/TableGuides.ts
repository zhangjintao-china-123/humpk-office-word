import type { Paragraph } from "../model/block/Paragraph";
import type { Table } from "../model/table/Table";
import { cellVisibleRect, type TableCellBox } from "../render/table/TableGeometry";
import type { StoryRef } from "./StoryRef";

/** 竖线改它左边的列，横线改它上面的行，表的左外框单独挪缩进。 */
export type TableGuideKind = "column" | "row" | "left";

export interface TableGuide {
  table: Table;
  story: StoryRef;
  paragraph: Paragraph;
  kind: TableGuideKind;
  index: number;
  size: number;
  widths: number[];
  indent: number;
}

export interface GuideSegment {
  kind: TableGuideKind;
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const EDGE = 0.75;

/** 只收集这一页上真的画出来的格线。被页切开的底边不是行边界。 */
export function guidesFromBoxes(boxes: TableCellBox[]): GuideSegment[] {
  const segments: GuideSegment[] = [];
  for (const box of boxes) {
    const vis = cellVisibleRect(box);
    if (vis.width < 1 || vis.height < 1) {
      continue;
    }
    const col = box.cell.colIndex;
    const colSpan = Math.max(1, box.cell.colSpan);
    const row = box.cell.rowIndex;
    const rowSpan = Math.max(1, box.cell.rowSpan);
    if (col === 0) {
      segments.push({ kind: "left", index: 0, x1: box.x, y1: vis.y, x2: box.x, y2: vis.y + vis.height });
    } else {
      segments.push({
        kind: "column",
        index: col - 1,
        x1: box.x,
        y1: vis.y,
        x2: box.x,
        y2: vis.y + vis.height,
      });
    }
    const right = box.x + box.width;
    segments.push({
      kind: "column",
      index: col + colSpan - 1,
      x1: right,
      y1: vis.y,
      x2: right,
      y2: vis.y + vis.height,
    });
    const bottom = box.y + box.height;
    const visBottom = vis.y + vis.height;
    if (bottom >= vis.y - EDGE && bottom <= visBottom + EDGE) {
      segments.push({
        kind: "row",
        index: row + rowSpan - 1,
        x1: vis.x,
        y1: bottom,
        x2: vis.x + vis.width,
        y2: bottom,
      });
    }
  }
  return segments;
}

export function pickGuide(
  segments: GuideSegment[],
  x: number,
  y: number,
  slop: number,
): { segment: GuideSegment; dist: number } | null {
  let best: { segment: GuideSegment; dist: number } | null = null;
  for (const segment of segments) {
    const vertical = segment.kind !== "row";
    const dist = vertical ? Math.abs(x - segment.x1) : Math.abs(y - segment.y1);
    if (dist > slop) {
      continue;
    }
    if (vertical) {
      const top = Math.min(segment.y1, segment.y2) - slop;
      const bottom = Math.max(segment.y1, segment.y2) + slop;
      if (y < top || y > bottom) {
        continue;
      }
    } else {
      const left = Math.min(segment.x1, segment.x2) - slop;
      const right = Math.max(segment.x1, segment.x2) + slop;
      if (x < left || x > right) {
        continue;
      }
    }
    const closer = best == null || dist < best.dist - 0.01;
    const tieRow = best != null && Math.abs(dist - best.dist) <= 0.01 && best.segment.kind === "row" && vertical;
    if (closer || tieRow) {
      best = { segment, dist };
    }
  }
  return best;
}
