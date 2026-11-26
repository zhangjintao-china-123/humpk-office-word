import { describe, expect, it } from "vitest";
import { Drawing } from "../../src/model/inline/Drawing";
import { Document } from "../../src/model/document/Document";
import { Paragraph } from "../../src/model/block/Paragraph";
import { TableCell } from "../../src/model/table/Table";
import { PictureTransformController } from "../../src/selection/PictureTransformController";
import type { PictureBox } from "../../src/selection/HitTester";
import type { PictureSnap } from "../../src/edit/PictureTransform";

function box(story: PictureBox["story"] = { slot: "body" }, position: "inline" | "anchor" = "inline"): PictureBox {
  const drawing = new Drawing();
  drawing.width = 100;
  drawing.height = 60;
  drawing.position = position;
  return {
    drawing,
    paragraph: new Paragraph(1),
    story,
    x: 20,
    y: 20,
    width: 100,
    height: 60,
    behind: false,
  };
}

function attach(picture: PictureBox, moves: { previewMove: number; previewResize: number; commit: number }) {
  const el = document.createElement("div");
  const controller = new PictureTransformController({
    clientToWorld: (x, y) => ({ x, y }),
    zoom: () => 1,
    selectedPicture: () => picture,
    pictureAt: (x, y) => (x >= 20 && x <= 120 && y >= 20 && y <= 80 ? picture : null),
    selectPicture: () => undefined,
    previewResize: () => {
      moves.previewResize += 1;
    },
    previewMove: (_box: PictureBox, _start: PictureSnap, _dx: number, _dy: number) => {
      moves.previewMove += 1;
    },
    commit: () => {
      moves.commit += 1;
    },
    revert: () => undefined,
  });
  controller.attach(el);
  return { el, controller };
}

describe("图片缩放光标", () => {
  it("滑到选中图片的控点上换成缩放光标", () => {
    const picture = box();
    const el = document.createElement("div");
    const controller = new PictureTransformController({
      clientToWorld: (x, y) => ({ x, y }),
      zoom: () => 1,
      selectedPicture: () => picture,
      pictureAt: (x, y) => (x >= 20 && x <= 120 && y >= 20 && y <= 80 ? picture : null),
      selectPicture: () => undefined,
      previewResize: () => undefined,
      previewMove: () => undefined,
      commit: () => undefined,
      revert: () => undefined,
    });
    controller.attach(el);
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 120, clientY: 80 }));
    expect(el.style.cursor).toBe("nwse-resize");
    expect(document.documentElement.classList.contains("ho-table-resize")).toBe(true);
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 300, clientY: 300 }));
    expect(el.style.cursor).toBe("");
    controller.detach();
  });

  it("表格单元格里的嵌入图拖几下也不会转成浮动", () => {
    const picture = box({ slot: "cell", cell: new TableCell(new Document()) });
    const moves = { previewMove: 0, previewResize: 0, commit: 0 };
    const { el, controller } = attach(picture, moves);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 70, clientY: 50 }));
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 82, clientY: 58 }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 82, clientY: 58 }));
    expect(moves.previewMove).toBe(0);
    expect(moves.commit).toBe(0);
    controller.detach();
  });

  it("正文图片拖过阈值会移动", () => {
    const picture = box();
    const moves = { previewMove: 0, previewResize: 0, commit: 0 };
    const { el, controller } = attach(picture, moves);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 70, clientY: 50 }));
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 82, clientY: 58 }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 82, clientY: 58 }));
    expect(moves.previewMove).toBeGreaterThan(0);
    expect(moves.commit).toBe(1);
    controller.detach();
  });

  it("滑到旋转控点切换抓手光标，拖动可旋转并支持 Esc 取消", () => {
    const picture = box({ slot: "body" }, "anchor");
    const el = document.createElement("div");
    let rotated: number | null = null;
    let committed = 0;
    let reverted = 0;
    const controller = new PictureTransformController({
      clientToWorld: (x, y) => ({ x, y }),
      zoom: () => 1,
      selectedPicture: () => picture,
      pictureAt: () => null,
      selectPicture: () => undefined,
      previewResize: () => undefined,
      previewRotate: (_box, _start, angle) => {
        rotated = angle;
      },
      previewMove: () => undefined,
      commit: () => {
        committed += 1;
      },
      revert: () => {
        reverted += 1;
      },
    });
    controller.attach(el);

    // 框体在 (20,20,100,60)，旋转控点在 (70, -4)
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 70, clientY: -4 }));
    expect(el.style.cursor).toBe("grab");

    // 按下并向右侧 (130, 50) 拖动 -> 90°
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 70, clientY: -4 }));
    expect(el.style.cursor).toBe("grabbing");
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 130, clientY: 50 }));
    expect(rotated).toBe(90);

    // Esc 取消并还原
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(reverted).toBe(1);
    expect(committed).toBe(0);

    // 再次拖动并松手提交
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 70, clientY: -4 }));
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 130, clientY: 50 }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 130, clientY: 50 }));
    expect(committed).toBe(1);
    controller.detach();
  });
});
