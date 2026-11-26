import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Drawing } from "../../src/model/inline/Drawing";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import type { EditContext } from "../../src/edit/EditContext";
import {
  applyPicturePlace,
  applyPictureSize,
  applyPictureWrap,
  canDragPicture,
  MIN_PICTURE,
  PictureTransformCommand,
  pictureWrapOffset,
  pickPictureHandle,
  pickRotateHandle,
  resizedPicture,
  restorePicture,
  ROTATE_HANDLE_OFFSET,
  rotatedAngleFromPointer,
  snapPicture,
  syncPictureStream,
} from "../../src/edit/PictureTransform";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import type { StoryRef } from "../../src/selection/StoryRef";
import { TableCell } from "../../src/model/table/Table";

const body: StoryRef = { slot: "body" };

function picture(): Drawing {
  const drawing = new Drawing();
  drawing.width = 200;
  drawing.height = 100;
  drawing.url = "data:image/png;base64,xx";
  return drawing;
}

function ctx(document: Document, selection: Selection): EditContext {
  return {
    mutator: new Mutator(),
    relayout: { apply: () => false } as unknown as Relayout,
    selection,
    documentOf: () => document,
    afterEdit: () => undefined,
  };
}

describe("图片缩放与位置", () => {
  it("右下角拖大时按比例锁住纵横比，对边不动", () => {
    const next = resizedPicture({ width: 200, height: 100 }, "se", 40, 10, true);
    expect(next.width).toBe(240);
    expect(next.height).toBe(120);
    expect(next.deltaX).toBe(0);
    expect(next.deltaY).toBe(0);
  });

  it("左边拖小时左缘跟着走，高度跟着比例变", () => {
    const next = resizedPicture({ width: 200, height: 100 }, "w", 40, 0, true);
    expect(next.width).toBe(160);
    expect(next.height).toBe(80);
    expect(next.deltaX).toBe(40);
    expect(next.deltaY).toBe(0);
  });

  it("不能缩到最小尺寸以下", () => {
    expect(resizedPicture({ width: 40, height: 20 }, "se", -1000, -1000, true).width).toBe(MIN_PICTURE);
  });

  it("四周型改成浮动并带环绕间距，嵌入型清掉锚点", () => {
    const drawing = picture();
    applyPictureWrap(drawing, "square", { left: 12, top: 8 });
    expect(drawing.position).toBe("anchor");
    expect(drawing.anchorSet?.wrapType).toBe("square");
    expect(drawing.anchorSet?.left).toBe(12);
    applyPictureWrap(drawing, "behind");
    expect(drawing.anchorSet?.behind).toBe(true);
    expect(drawing.anchorSet?.wrapType).toBe("none");
    applyPictureWrap(drawing, "inline");
    expect(drawing.position).toBe("inline");
    expect(drawing.anchorSet).toBeUndefined();
  });

  it("页面位置用对齐而不是偏移", () => {
    const drawing = picture();
    applyPicturePlace(drawing, "top-right");
    expect(drawing.position).toBe("anchor");
    expect(drawing.anchorSet?.leftAlign).toBe("right");
    expect(drawing.anchorSet?.topAlign).toBe("top");
    expect(drawing.anchorSet?.wrapType).toBe("square");
  });

  it("锁比例时改宽度会带动高度", () => {
    const drawing = picture();
    applyPictureSize(drawing, 100, 100, true);
    expect(drawing.width).toBe(100);
    expect(drawing.height).toBe(50);
  });

  it("改环绕可以撤销，字流里不再有行内图", () => {
    const document = new Document();
    const paragraph = new Paragraph(1);
    const block = new Block();
    block.drawing = picture();
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
    new WordStreamBuilder().buildStoryOnly(document);
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const before = snapPicture(block.drawing!);
    applyPictureWrap(block.drawing!, "square", { left: 10, top: 0 });
    const after = snapPicture(block.drawing!);
    restorePicture(block.drawing!, before);
    const history = new History();
    history.do(new PictureTransformCommand(ctx(document, selection), block.drawing!, body, paragraph, before, after));
    expect(block.drawing?.position).toBe("anchor");
    expect([...walk(document)].some((word) => word.drawing === block.drawing)).toBe(false);
    history.undo();
    expect(block.drawing?.position).toBe("inline");
    expect([...walk(document)].some((word) => word.drawing === block.drawing)).toBe(true);
  });

  it("控点命中右下角，贴边也会变成对应方向", () => {
    const box = { x: 20, y: 20, width: 100, height: 60 };
    expect(pickPictureHandle(120, 80, box, 8)).toBe("se");
    expect(pickPictureHandle(70, 22, box, 8)).toBe("n");
    expect(pickPictureHandle(118, 50, box, 8)).toBe("e");
    expect(pickPictureHandle(70, 50, box, 8)).toBeNull();
  });

  it("旋转控点命中与指针角度计算（支持 Shift 15 度吸附和已旋转框）", () => {
    const drawing = picture();
    const box = { x: 20, y: 40, width: 100, height: 60, drawing };
    expect(pickRotateHandle(70, 40 - ROTATE_HANDLE_OFFSET, box, 6)).toBe(true);
    expect(pickRotateHandle(70, 40, box, 6)).toBe(false);

    // 顺时针旋转 90° 后，旋转控点位于中心 (70, 70) 右侧距离 30 + ROTATE_HANDLE_OFFSET 处
    drawing.rotation = 90;
    expect(pickRotateHandle(70 + 30 + ROTATE_HANDLE_OFFSET, 70, box, 6)).toBe(true);

    expect(rotatedAngleFromPointer(box, 70, 0)).toBe(0);
    expect(rotatedAngleFromPointer(box, 140, 70)).toBe(90);
    expect(rotatedAngleFromPointer(box, 70, 140)).toBe(180);
    expect(rotatedAngleFromPointer(box, 0, 70)).toBe(270);
    // 轻微偏右上方时 Shift 吸附到 15 的倍数
    expect(rotatedAngleFromPointer(box, 80, 20, true) % 15).toBe(0);
  });

  it("单元格嵌入图不能拖成浮动，浮动图和正文可以拖", () => {
    const cell = new TableCell(new Document());
    expect(canDragPicture({ slot: "cell", cell }, "inline")).toBe(false);
    expect(canDragPicture({ slot: "cell", cell }, "anchor")).toBe(true);
    expect(canDragPicture({ slot: "body" }, "inline")).toBe(true);
  });

  it("单元格浮动偏移相对格子段首，不用页面坐标", () => {
    const drawing = picture();
    const cell = new TableCell(new Document());
    expect(
      pictureWrapOffset({ x: 90, y: 70, story: { slot: "cell", cell }, drawing }, { x: 80, y: 60 }, { x: 50, y: 200 }),
    ).toEqual({ left: 10, top: 10 });
    expect(pictureWrapOffset({ x: 90, y: 70, story: { slot: "body" }, drawing }, { x: 80, y: 60 }, { x: 50, y: 200 }, 20)).toEqual({
      left: 50,
      top: 180,
    });
  });

  it("浮动图从字流拿掉后，再改回嵌入会插回去", () => {
    const document = new Document();
    const paragraph = new Paragraph(1);
    const block = new Block();
    block.drawing = picture();
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
    new WordStreamBuilder().buildStoryOnly(document);
    block.drawing!.position = "anchor";
    syncPictureStream(document, paragraph, block.drawing!);
    expect([...walk(document)].some((word) => word.kind === "drawing")).toBe(false);
    block.drawing!.position = "inline";
    syncPictureStream(document, paragraph, block.drawing!);
    expect([...walk(document)].some((word) => word.kind === "drawing")).toBe(true);
  });
});

function* walk(document: Document) {
  let node = document.words.head;
  while (node) {
    yield node.data;
    node = node.next;
  }
}
