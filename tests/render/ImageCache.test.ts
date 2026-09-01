import { describe, expect, it } from "vitest";
import { ImageCache } from "../../src/render/image/ImageCache";

describe("ImageCache", () => {
  it("prime 后可以直接取到已就绪的图", () => {
    const cache = new ImageCache();
    const image = { complete: true, naturalWidth: 8 } as HTMLImageElement;
    cache.prime("data:image/png;base64,x", image);
    expect(cache.get("data:image/png;base64,x")).toBe(image);
    expect(cache.ensure("data:image/png;base64,x")).toBe(image);
  });

  it("没有 url 时不加载", () => {
    const cache = new ImageCache();
    expect(cache.ensure(undefined)).toBeUndefined();
    expect(cache.get(undefined)).toBeUndefined();
  });
});
