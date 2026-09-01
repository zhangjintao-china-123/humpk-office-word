import type { WrapPoint } from "../../model/inline/Drawing";

export interface ScanInterval {
  left: number;
  right: number;
}

/** 多边形水平扫描线，用于紧密/穿越绕排。 */
export class WrapScanline {
  intervalsAt(points: WrapPoint[], y: number): ScanInterval[] {
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
      if (right - left > 0.5) {
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
