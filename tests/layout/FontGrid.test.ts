import { describe, expect, it } from "vitest";
import { fontGridRows, snappedLineMultiple } from "../../src/layout/line/FontGrid";
import { twipToPx } from "../../src/shared/units";

const pitch = twipToPx(312);

describe("FontGrid", () => {
  it("10.5 磅占 1 行网格，14 磅占 2 行", () => {
    expect(fontGridRows(14, pitch)).toBe(1);
    expect(fontGridRows(18.666, pitch)).toBe(2);
    expect(fontGridRows(21.333, pitch)).toBe(2);
  });

  it("字号行数大于段倍数时取字号行数", () => {
    expect(snappedLineMultiple(1.5, 18.666, pitch)).toBe(2);
    expect(snappedLineMultiple(1.5, 14, pitch)).toBe(1.5);
    expect(snappedLineMultiple(2, 18.666, pitch)).toBe(2);
  });
});
