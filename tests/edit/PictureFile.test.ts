import { describe, expect, it } from "vitest";
import { drawingFromSize, fitImageSize } from "../../src/edit/PictureFile";

describe("PictureFile", () => {
  it("宽图按版心宽度缩小，竖图再受版心高度限制", () => {
    expect(fitImageSize(1000, 500, 200, 400)).toEqual({ width: 200, height: 100 });
    expect(fitImageSize(100, 50, 200, 400)).toEqual({ width: 100, height: 50 });
    expect(fitImageSize(100, 800, 200, 400)).toEqual({ width: 50, height: 400 });
  });

  it("生成行内图并带上 data URL", () => {
    const drawing = drawingFromSize("data:image/png;base64,xx", 400, 200, 200, 400);
    expect(drawing.position).toBe("inline");
    expect(drawing.url).toContain("image/png");
    expect(drawing.width).toBe(200);
    expect(drawing.height).toBe(100);
  });
});
