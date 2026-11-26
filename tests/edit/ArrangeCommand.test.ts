import { describe, expect, it } from "vitest";
import {
  applyDrawingAlign,
  applyLayerOrder,
  applyRotateAction,
  collectAnchoredEntries,
  distributeAnchoredDrawings,
} from "../../src/edit/ArrangeCommand";
import { pickPictureHandle, pictureHandleCursor, resizedPicture } from "../../src/edit/PictureTransform";
import { AnchorLayout } from "../../src/layout/anchor/AnchorLayout";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { Block } from "../../src/model/block/Block";
import { Document } from "../../src/model/document/Document";
import { Paragraph } from "../../src/model/block/Paragraph";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Drawing } from "../../src/model/inline/Drawing";
import { PlacedAnchor } from "../../src/model/inline/PlacedAnchor";

function makeAnchorDoc(specs: Array<{ x?: number; y?: number; behind?: boolean; zIndex?: number; w?: number; h?: number }>) {
  const doc = new Document();
  const para = new Paragraph(1);
  const text = new Block();
  text.text = "正文";
  para.addBlock(text);
  const drawings: Drawing[] = [];
  for (const spec of specs) {
    const drawing = new Drawing();
    drawing.position = "anchor";
    drawing.width = spec.w ?? 80;
    drawing.height = spec.h ?? 40;
    drawing.anchorSet = {
      wrapType: "none",
      leftFrom: "column",
      topFrom: "paragraph",
      left: spec.x ?? 0,
      top: spec.y ?? 0,
      behind: spec.behind,
      zIndex: spec.zIndex,
    };
    const b = new Block();
    b.drawing = drawing;
    para.addBlock(b);
    drawings.push(drawing);
  }
  para.hasAnchor = true;
  doc.addParagraph(para);
  new WordStreamBuilder().buildStoryOnly(doc);
  return { doc, para, drawings };
}

describe("文本框排列、旋转、对齐与分布", () => {
  it("旋转与翻转状态切换及重置，旋转后控点命中和光标正确", () => {
    const drawing = new Drawing();
    drawing.width = 120;
    drawing.height = 60;
    applyRotateAction(drawing, "rotate90");
    expect(drawing.rotation).toBe(90);
    applyRotateAction(drawing, "rotate90");
    expect(drawing.rotation).toBe(180);
    applyRotateAction(drawing, "rotate-90");
    expect(drawing.rotation).toBe(90);
    applyRotateAction(drawing, "flipH");
    applyRotateAction(drawing, "flipV");
    expect(drawing.flipH).toBe(true);
    expect(drawing.flipV).toBe(true);

    // 未旋转东边控点 (160, 80) 在顺时针旋转 90° 后移到正下方 (100, 140)
    const box = { x: 40, y: 50, width: 120, height: 60, drawing };
    expect(pickPictureHandle(100, 140, box, 6, true)).toBe("e");
    expect(pictureHandleCursor("e", 90)).toBe("ns-resize");

    // 旋转 90° 后向右拖动 (dx=20, dy=0) 对应局部 -y (n 边向上拉)
    const resized = resizedPicture({ width: 120, height: 60 }, "n", 20, 0, false, undefined, 90);
    expect(resized.height).toBeCloseTo(80);
    expect(resized.width).toBeCloseTo(120);

    applyRotateAction(drawing, "reset");
    expect(drawing.rotation).toBeUndefined();
    expect(drawing.flipH).toBeUndefined();
    expect(drawing.flipV).toBeUndefined();
  });

  it("层级调整正确重排并保持衬于文字下方/浮于文字上方分层", () => {
    const { doc, drawings } = makeAnchorDoc([{ zIndex: 10 }, { zIndex: 20 }, { zIndex: 30 }]);
    applyLayerOrder(doc, drawings[0], "bringForward");
    expect(collectAnchoredEntries(doc).map((e) => e.drawing)).toEqual([drawings[1], drawings[0], drawings[2]]);

    applyLayerOrder(doc, drawings[2], "sendToBack");
    expect(collectAnchoredEntries(doc).map((e) => e.drawing)).toEqual([drawings[2], drawings[1], drawings[0]]);

    applyLayerOrder(doc, drawings[0], "behindText");
    expect(drawings[0].anchorSet?.behind).toBe(true);
    expect(collectAnchoredEntries(doc).map((e) => e.drawing)).toEqual([drawings[0], drawings[2], drawings[1]]);

    applyLayerOrder(doc, drawings[0], "inFrontOfText");
    expect(drawings[0].anchorSet?.behind).toBe(false);
    expect(collectAnchoredEntries(doc).map((e) => e.drawing)).toEqual([drawings[2], drawings[1], drawings[0]]);
  });

  it("支持相对于页边距和页面的对齐，并正确计算坐标", () => {
    const { doc, drawings } = makeAnchorDoc([{ w: 100, h: 40 }]);
    const constraints = {
      contentWidth: 600,
      contentHeight: 800,
      leftMargin: 96,
      topMargin: 96,
      pageWidth: 792,
      pageHeight: 992,
      measurer: new FallbackMeasurer(),
      paginate: true,
    };

    applyDrawingAlign(drawings[0], "right", "margin");
    applyDrawingAlign(drawings[0], "bottom", "margin");
    let res = new AnchorLayout().finish(doc, [], constraints);
    expect(res.anchors[0].x).toBe(500);
    expect(res.anchors[0].y).toBe(760);

    applyDrawingAlign(drawings[0], "center", "page");
    applyDrawingAlign(drawings[0], "top", "page");
    res = new AnchorLayout().finish(doc, [], constraints);
    expect(res.anchors[0].x).toBe((792 - 100) / 2 - 96);
    expect(res.anchors[0].y).toBe(-96);
  });

  it("3 个及以上对象可横向与纵向均匀分布，不足 3 个不分布", () => {
    const p = new Paragraph(1);
    const makePlaced = (x: number, y: number, w: number, h: number) => {
      const d = new Drawing();
      d.width = w;
      d.height = h;
      const a = new PlacedAnchor(d, p);
      a.x = x;
      a.y = y;
      return a;
    };

    expect(distributeAnchoredDrawings([makePlaced(0, 0, 40, 20), makePlaced(100, 0, 40, 20)], "distributeH")).toEqual([]);

    const items = [makePlaced(0, 0, 40, 20), makePlaced(50, 40, 40, 20), makePlaced(200, 140, 40, 20)];
    const hChanges = distributeAnchoredDrawings(items, "distributeH");
    expect(hChanges).toHaveLength(1);
    expect(hChanges[0].dx).toBeCloseTo(50); // span=240, sumW=120, gap=60 -> middle x=100

    const vChanges = distributeAnchoredDrawings(items, "distributeV");
    expect(vChanges).toHaveLength(1);
    expect(vChanges[0].dy).toBeCloseTo(30); // span=160, sumH=60, gap=50 -> middle y=70
  });
});
