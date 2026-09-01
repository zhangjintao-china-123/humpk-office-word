import { describe, expect, it } from "vitest";
import { WrapScanline } from "../../src/layout/anchor/WrapScanline";

describe("WrapScanline", () => {
  const scan = new WrapScanline();
  const triangle = [
    { x: 0, y: 0 },
    { x: 80, y: 40 },
    { x: 0, y: 80 },
  ];

  it("靠近顶点的扫描线更窄", () => {
    const top = scan.rangeAt(triangle, 10);
    const mid = scan.rangeAt(triangle, 40);
    expect(top).toBeTruthy();
    expect(mid).toBeTruthy();
    expect(top!.left).toBeCloseTo(0, 0);
    expect(top!.right).toBeLessThan(mid!.right);
    expect(mid!.right).toBeCloseTo(80, 0);
  });

  it("扫描线落在多边形外时没有区间", () => {
    expect(scan.rangeAt(triangle, -2)).toBeNull();
    expect(scan.rangeAt(triangle, 90)).toBeNull();
  });

  it("穿越绕排可以拆成多段区间", () => {
    const hourglass = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 20, y: 20 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
      { x: 20, y: 20 },
    ];
    const intervals = scan.intervalsAt(hourglass, 10);
    expect(intervals.length).toBeGreaterThanOrEqual(1);
  });
});
