import { describe, expect, it } from "vitest";
import { Viewport } from "../../src/render/canvas/Viewport";

describe("Viewport", () => {
  it("cssToWorld 与 worldToCss 互逆", () => {
    const viewport = new Viewport();
    viewport.zoom = 2;
    viewport.scrollX = 40;
    viewport.scrollY = 80;

    const world = viewport.cssToWorld(10, 20);
    expect(world).toEqual({ x: 25, y: 50 });
    expect(viewport.worldToCss(world.x, world.y)).toEqual({ x: 10, y: 20 });
  });

  it("zoom 为 1 时只叠加滚动", () => {
    const viewport = new Viewport();
    viewport.scrollX = 100;
    viewport.scrollY = 50;
    expect(viewport.cssToWorld(0, 0)).toEqual({ x: 100, y: 50 });
  });
});
