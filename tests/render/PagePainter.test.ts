import { describe, expect, it } from "vitest";
import { textAreaCorners } from "../../src/render/page/PagePainter";

describe("版心角标", () => {
  it("页脚两侧是横竖各一段的直角，竖线伸进页脚", () => {
    const marks = textAreaCorners(96, 96, 700, 1000, 20);
    const leftFooter = marks.find((item) => item.x === 96 && item.y === 1000);
    const rightFooter = marks.find((item) => item.x === 700 && item.y === 1000);
    expect(leftFooter).toEqual({ x: 96, y: 1000, dx: -20, dy: 20 });
    expect(rightFooter).toEqual({ x: 700, y: 1000, dx: 20, dy: 20 });
  });
});
