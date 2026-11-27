import type { WrapPoint } from "../../model/inline/Drawing";

export interface ScanInterval {
  left: number;
  right: number;
}

/** 多边形水平扫描线，用于紧密/穿越绕排。 */
export class WrapScanline {
  intervalsInBand(points: WrapPoint[], top: number, bottom: number): ScanInterval[] {
    const cuts = [top, bottom, ...points.map((point) => point.y).filter((y) => y > top && y < bottom)].sort((a, b) => a - b);
    const intervals: ScanInterval[] = [];
    for (let i = 1; i < cuts.length; i += 1) {
      const height = cuts[i] - cuts[i - 1];
      if (height <= 1e-6) {
        continue;
      }
      // 顶点之间相交边固定。取两端的极值，覆盖整条文字行。
      const delta = Math.min(1e-5, height / 4);
      const start = this.intervalsAt(points, cuts[i - 1] + delta, 0);
      const end = this.intervalsAt(points, cuts[i] - delta, 0);
      for (let index = 0; index < Math.max(start.length, end.length); index += 1) {
        const a = start[index] ?? end[index];
        const b = end[index] ?? a;
        intervals.push({ left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) });
      }
    }
    const merged: ScanInterval[] = [];
    for (const interval of intervals.sort((a, b) => a.left - b.left)) {
      const last = merged.at(-1);
      if (last && interval.left <= last.right + 0.01) {
        last.right = Math.max(last.right, interval.right);
      } else {
        merged.push(interval);
      }
    }
    return merged;
  }

  intervalsAt(points: WrapPoint[], y: number, minimumWidth = 0.5): ScanInterval[] {
    if (points.length < 2) {
      return [];
    }
    const xs: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const x = this.crossX(a, b, y);
      if (x != null) {
        xs.push(x);
      }
    }
    xs.sort((left, right) => left - right);
    const intervals: ScanInterval[] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const left = xs[i];
      const right = xs[i + 1];
      if (right - left > minimumWidth) {
        intervals.push({ left, right });
      }
    }
    return intervals;
  }

  rangeAt(points: WrapPoint[], y: number): ScanInterval | null {
    const intervals = this.intervalsAt(points, y);
    if (intervals.length === 0) {
      return null;
    }
    return {
      left: intervals[0].left,
      right: intervals[intervals.length - 1].right,
    };
  }

  private crossX(a: WrapPoint, b: WrapPoint, y: number): number | null {
    const low = a.y <= b.y ? a : b;
    const high = a.y <= b.y ? b : a;
    if (high.y - low.y < 1e-6) {
      return null;
    }
    if (y < low.y || y >= high.y) {
      return null;
    }
    const t = (y - low.y) / (high.y - low.y);
    return low.x + t * (high.x - low.x);
  }
}
