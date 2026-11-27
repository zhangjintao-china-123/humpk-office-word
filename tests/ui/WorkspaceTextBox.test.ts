import { describe, expect, it, vi } from "vitest";
import { InsertCommand } from "../../src/edit/InsertCommand";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Drawing } from "../../src/model/inline/Drawing";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelectionPainter } from "../../src/selection/SelectionPainter";
import { Workspace } from "../../src/ui/workspace/Workspace";

function createWorkspace() {
  const noop = () => undefined;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    save: noop, restore: noop, scale: noop, translate: noop, rotate: noop, setTransform: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, stroke: noop, fill: noop, ellipse: noop, rect: noop, clip: noop, setLineDash: noop,
    fillText: noop, measureText: (value: string) => ({ width: value.length * 8 }),
  } as unknown as CanvasRenderingContext2D);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const workspace = new Workspace(host);
  const root = host.querySelector<HTMLElement>(".ho-word-scroll")!;
  Object.defineProperties(root, {
    clientWidth: { value: 980 },
    clientHeight: { value: 730 },
  });
  workspace.setZoom(1);
  root.scrollLeft = 0;
  root.scrollTop = 0;
  root.dispatchEvent(new Event("scroll"));
  const model = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = "正文";
  paragraph.addBlock(block);
  model.addParagraph(paragraph);
  new WordStreamBuilder().build(model);
  workspace.load(model);

  function pointer(type: string, x: number, y: number) {
    root.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y,
    }));
  }

  function drag(x: number, y: number, dx: number, dy: number) {
    pointer("pointerdown", x, y);
    if (dx || dy) {
      pointer("pointermove", x + dx, y + dy);
    }
    pointer("pointerup", x + dx, y + dy);
  }

  return {
    workspace, model, root, pointer, drag,
    dispose: () => {
      workspace.dispose();
      host.remove();
      canvas.mockRestore();
    },
  };
}

describe("图片拖动", () => {
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it.each([
    { ratio: 0.25, page: 0, angle: 0 },
    { ratio: 0.75, page: 1, angle: 0 },
    { ratio: 0.25, page: 0, angle: 45 },
    { ratio: 0.75, page: 1, angle: 45 },
  ])("页缝松手后，旋转 $angle 度的图片完整吸附到索引 $page 的页面", ({ ratio, page, angle }) => {
    const { workspace, model, root, drag, dispose } = createWorkspace();
    const drawing = new Drawing();
    drawing.width = 150;
    drawing.height = 270;
    drawing.rotation = angle;
    drawing.position = "anchor";
    drawing.anchorSet = { leftFrom: "column", left: 80, topFrom: "paragraph", top: 96, wrapType: "none" };
    const block = new Block();
    block.drawing = drawing;
    model.paragraphs.head!.data.addBlock(block);
    const second = new Paragraph(2);
    second.attrs.pageBreakBefore = "1";
    const text = new Block();
    text.text = "第二页";
    second.addBlock(text);
    model.addParagraph(second);
    new WordStreamBuilder().build(model);

    try {
      workspace.load(model);
      const ctx = workspace.hitContext();
      const initial = workspace.hitTester.pictures(ctx)[0];
      root.scrollTop = initial.y - 110;
      workspace.paint();
      const start = workspace.viewport.worldToCss(initial.x + initial.width / 2, initial.y + initial.height / 2);
      const firstBottom = ctx.origins[0].y + ctx.pageSetup.height;
      const releaseY = firstBottom + ctx.pageSetup.pageGap * ratio;
      const release = workspace.viewport.worldToCss(initial.x + initial.width / 2, releaseY);
      drag(start.x, start.y, 0, release.y - start.y);

      expect(model.anchors[0].pageIndex).toBe(page);
      const placed = workspace.hitTester.pictures(workspace.hitContext())[0];
      const radians = angle * Math.PI / 180;
      const halfHeight = (Math.sin(radians) * placed.width + Math.cos(radians) * placed.height) / 2;
      const placedCenter = placed.y + placed.height / 2;
      if (page === 0) {
        expect(placedCenter + halfHeight).toBeCloseTo(firstBottom);
      } else {
        expect(placedCenter - halfHeight).toBeCloseTo(ctx.origins[1].y);
      }
    } finally {
      dispose();
    }
  });

  it("保留正文与滚动位置，跨页按松手位置提交并可保存重开", async () => {
    const { workspace, model, root, pointer, dispose } = createWorkspace();
    const drawing = new Drawing();
    drawing.width = 110;
    drawing.height = 44;
    drawing.url = pixel;
    drawing.position = "anchor";
    drawing.anchorSet = {
      leftFrom: "column", left: 80, topFrom: "paragraph", top: workspace.pageSetup.contentHeight - 21, wrapType: "square",
    };
    const block = new Block();
    block.drawing = drawing;
    const first = model.paragraphs.head!.data;
    first.addBlock(block);
    const second = new Paragraph(2);
    second.attrs.pageBreakBefore = "1";
    const text = new Block();
    text.text = "第二页正文";
    second.addBlock(text);
    model.addParagraph(second);
    new WordStreamBuilder().build(model);
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => frames.push(frame));
    const layout = vi.spyOn(workspace.relayout, "apply");
    const handles = vi.spyOn(SelectionPainter.prototype, "paintPictureHandles");
    try {
      workspace.load(model);
      const ctx = workspace.hitContext();
      const initial = workspace.hitTester.pictures(ctx)[0];
      root.scrollTop = initial.y - 280;
      workspace.paint();
      const scrollBefore = root.scrollTop;
      const start = workspace.viewport.worldToCss(initial.x + 48, initial.y + 20);
      const targetY = ctx.origins[1].y + 36;
      pointer("pointerdown", start.x, start.y);
      expect(root.scrollTop).toBe(scrollBefore);
      pointer("pointermove", start.x, start.y + 20);
      pointer("pointermove", start.x, start.y + 21);
      expect(frames).toHaveLength(1);
      expect(layout).not.toHaveBeenCalled();
      expect(model.anchors[0].pageIndex).toBe(0);
      frames[0](0);
      expect(handles.mock.lastCall?.[1].y).toBeCloseTo(initial.y + 21);
      pointer("pointerup", start.x + 18, start.y + targetY - initial.y);
      expect(layout).toHaveBeenCalledTimes(1);
      expect(model.anchors[0]).toMatchObject({ pageIndex: 1, paragraph: second, wrap: "square" });
      expect(workspace.selectedPicture()).toMatchObject({ y: targetY, x: initial.x + 18 });
      expect(workspace.history.undo()).toBe(true);
      expect(first.blocks).toContain(block);
      expect(workspace.hitTester.pictures(workspace.hitContext())[0]).toMatchObject({ y: initial.y, x: initial.x });
      expect(workspace.history.redo()).toBe(true);
      expect(second.blocks).toContain(block);
      expect(workspace.hitTester.pictures(workspace.hitContext())[0]).toMatchObject({ y: targetY, x: initial.x + 18 });

      workspace.load(await new DocxReader().read(await workspace.exportDocx()));
      const reopened = workspace.hitContext();
      expect(workspace.hitTester.pictures(reopened)[0]).toMatchObject({ y: reopened.origins[1].y + 36, x: initial.x + 18 });
    } finally {
      handles.mockRestore();
      layout.mockRestore();
      raf.mockRestore();
      dispose();
    }
  });

  it("取消保留内嵌图片，撤销将图片放回原有文字之间", () => {
    const { workspace, model, pointer, dispose } = createWorkspace();
    const paragraph = model.paragraphs.head!.data;
    paragraph.blocks[0].text = "前文字";
    const drawing = new Drawing();
    drawing.width = 110;
    drawing.height = 55;
    const image = new Block();
    image.drawing = drawing;
    paragraph.addBlock(image);
    const tail = new Block();
    tail.text = "后文字";
    paragraph.addBlock(tail);
    new WordStreamBuilder().build(model);
    try {
      workspace.load(model);
      const initial = workspace.hitTester.pictures(workspace.hitContext())[0];
      const point = workspace.viewport.worldToCss(initial.x + 46, initial.y + 24);
      pointer("pointerdown", point.x, point.y);
      pointer("pointermove", point.x + 25, point.y + 18);
      expect(drawing.position).toBe("inline");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(workspace.history.canUndo()).toBe(false);
      expect(workspace.hitTester.pictures(workspace.hitContext())[0].node).toBe(initial.node);
      pointer("pointerdown", point.x, point.y);
      pointer("pointermove", point.x + 25, point.y + 18);
      pointer("pointerup", point.x + 25, point.y + 26);
      expect(drawing.position).toBe("anchor");
      expect(workspace.selectedPicture()).toMatchObject({ x: initial.x + 25, y: initial.y + 26 });
      expect(workspace.history.undo()).toBe(true);
      const restored = workspace.hitTester.pictures(workspace.hitContext())[0];
      expect([restored.x, restored.y]).toEqual([initial.x, initial.y]);
      expect(restored.node).toBe(initial.node);
      expect(restored.node?.pre?.data.block).toBe(paragraph.blocks[0]);
      expect(restored.node?.next?.data.block).toBe(tail);
    } finally {
      dispose();
    }
  });
});

describe("文本框调整", () => {
  it.each(["horizontal", "vertical"] as const)("支持 %s 文本框移动、缩放和继续编辑", async (direction) => {
    const { workspace, model, pointer, drag, dispose } = createWorkspace();
    try {
      const ctx = workspace.hitContext();
      const page = ctx.origins[0];
      const x = page.x + ctx.pageSetup.contentLeft() + 50;
      const y = page.y + ctx.pageSetup.contentTop() + 40;
      workspace.drawTextBox(direction);
      drag(x, y, 180, 90);
      workspace.history.do(new InsertCommand(workspace, "说明"));

      drag(x + 42, y, 30, 20);
      expect(workspace.selectedPicture()).toMatchObject({ x: x + 30, y: y + 20, width: 180, height: 90 });
      expect(workspace.formatState("").pictureIsTextBox).toBe(true);
      expect(workspace.selection.caret()).toBeUndefined();

      const left = x + 30;
      const top = y + 20;
      drag(left, top, 22, 18);
      expect(workspace.selectedPicture()).toMatchObject({ x: left + 22, y: top + 18, width: 158, height: 72 });
      workspace.history.undo();
      expect(workspace.selectedPicture()).toMatchObject({ x: left, y: top, width: 180, height: 90 });
      workspace.history.redo();
      expect(workspace.selectedPicture()).toMatchObject({ x: left + 22, y: top + 18, width: 158, height: 72 });

      pointer("pointerdown", left + 180, top + 90);
      pointer("pointermove", left + 215, top + 125);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(workspace.selectedPicture()).toMatchObject({ width: 158, height: 72 });

      drag(left + 100, top + 52, 0, 0);
      expect(workspace.selectedPicture()).toBeNull();
      expect(workspace.selection.caret()?.story.slot).toBe("textbox");
      workspace.history.do(new InsertCommand(workspace, "新版"));

      expect(model.paragraphText()).toEqual(["正文"]);
      const drawing = model.anchors[0].drawing;
      const reopened = await new DocxReader().read(await workspace.exportDocx());
      const saved = reopened.paragraphs.head!.data.blocks.find((block) => block.drawing)?.drawing;
      expect(saved).toMatchObject({
        width: 158, height: 72, position: "anchor", lockAspect: false,
        anchorSet: { left: drawing.anchorSet!.left, top: drawing.anchorSet!.top, wrapType: "none" },
      });
      const edited = drawing.shape!.text!.paragraphText();
      expect(edited.join("")).toContain("新版");
      expect(saved?.shape?.text?.paragraphText()).toEqual(edited);
      expect(saved?.shape?.textDirection ?? "horizontal").toBe(direction);
    } finally {
      dispose();
    }
  });

  it("从位置预设继续拖动，且删除撤销后保留位置和比例锁定", async () => {
    const { workspace, model, drag, dispose } = createWorkspace();
    try {
      const { pageSetup, origins: [page] } = workspace.hitContext();
      const x = page.x + pageSetup.contentLeft() + 50;
      const y = page.y + pageSetup.contentTop() + 40;
      workspace.drawTextBox("horizontal");
      drag(x, y, 180, 90);
      drag(x + 42, y, 0, 0);

      workspace.applyPictureSize(240, 90, true);
      expect(workspace.selectedPicture()).toMatchObject({ width: 240, height: 120 });
      workspace.applyPicturePlace("top-center");
      const placed = workspace.selectedPicture()!;
      expect(placed.x).toBe(x - 50 + (pageSetup.contentWidth - 240) / 2);
      expect(placed.y).toBe(y - 40);
      drag(placed.x + 42, placed.y, 27, 32);
      expect(workspace.selectedPicture()).toMatchObject({ x: placed.x + 27, y: placed.y + 32, width: 240, height: 120 });

      workspace.deleteContent("forward");
      expect(model.anchors).toHaveLength(0);
      workspace.history.undo();
      expect(model.anchors).toHaveLength(1);
      const restored = workspace.hitTester.pictures(workspace.hitContext())[0];
      expect(restored).toMatchObject({ x: placed.x + 27, y: placed.y + 32, width: 240, height: 120 });

      const reopened = await new DocxReader().read(await workspace.exportDocx());
      const saved = reopened.paragraphs.head!.data.blocks.find((block) => block.drawing)?.drawing;
      expect(saved).toMatchObject({ position: "anchor", lockAspect: true });
    } finally {
      dispose();
    }
  });

  it("切换已有文本框的方向和对齐后重新排版，保留字格式和命中位置", () => {
    const { workspace, model, drag, dispose } = createWorkspace();
    try {
      const { pageSetup, origins: [page] } = workspace.hitContext();
      const x = page.x + pageSetup.contentLeft() + 60;
      const y = page.y + pageSetup.contentTop() + 40;
      workspace.drawTextBox("horizontal");
      drag(x, y, 180, 90);
      const story = workspace.selection.caret()!.story;
      workspace.setPendingRunStyle({ bold: true });
      const content = "文本框文字方向和对齐测试";
      workspace.history.do(new InsertCommand(workspace, content));
      const shape = model.anchors[0].drawing.shape!;
      const text = shape.text!;
      const first = new CaretPos(story, text.words.head);
      const wordBox = () => workspace.hitTester.wordBox(first, workspace.hitContext())!;
      const start = wordBox();
      drag(x + 38, y, 0, 0);

      workspace.applyTextBoxFormat({ textAlign: "end" });
      const bottom = wordBox();
      expect(bottom.x).toBeCloseTo(start.x);
      expect(bottom.y).toBeGreaterThan(start.y);
      workspace.applyTextBoxFormat({ textDirection: "vertical" });
      expect(text.paragraphs.head!.data.lines.length).toBeGreaterThan(1);
      const left = wordBox();
      workspace.applyTextBoxFormat({ textAlign: "start" });
      expect(wordBox().x).toBeGreaterThan(left.x);
      workspace.history.undo();
      expect(wordBox().x).toBeCloseTo(left.x);
      workspace.history.undo();
      expect(wordBox().y).toBeCloseTo(bottom.y);
      workspace.history.redo();

      const vertical = wordBox();
      const column = vertical.x + vertical.width / 2;
      const startY = vertical.y + vertical.height / 4;
      drag(column, startY, 0, 2 * vertical.height);
      expect(workspace.selection.isCollapsed()).toBe(false);
      drag(column, startY, 0, 0);
      expect(workspace.selection.caret()?.node).toBe(text.words.head);
      expect(workspace.caretWorld()?.height).toBe(1);
      expect(text.words.head!.data.getStyle()?.bold).toBe(true);
      expect(text.paragraphText()).toEqual([content]);
      workspace.history.do(new InsertCommand(workspace, "新"));
      expect(text.paragraphText()[0]).toContain("新");
      expect(model.paragraphText()).toEqual(["正文"]);
    } finally {
      dispose();
    }
  });

  it("颜色、轮廓和对齐可写回，重新打开后仍可清除样式和拖动", async () => {
    const { workspace, drag, dispose } = createWorkspace();
    try {
      const { pageSetup, origins: [page] } = workspace.hitContext();
      const x = page.x + pageSetup.contentLeft() + 50;
      const y = page.y + pageSetup.contentTop() + 40;
      workspace.drawTextBox("horizontal");
      drag(x, y, 180, 90);
      workspace.history.do(new InsertCommand(workspace, "样式回写"));
      drag(x + 42, y, 0, 0);
      workspace.applyTextBoxFormat({ fill: "#C6E1F5" });
      workspace.applyTextBoxFormat({ line: "#0070C0" });
      workspace.applyTextBoxFormat({ lineWidth: 4 });
      workspace.applyTextBoxFormat({ textDirection: "vertical" });
      workspace.applyTextBoxFormat({ textAlign: "center" });
      workspace.history.undo();
      expect(workspace.formatState("").textBoxFormat?.textAlign).toBeUndefined();
      workspace.history.redo();

      const reader = new DocxReader();
      workspace.load(await reader.read(await workspace.exportDocx()));
      const box = workspace.hitTester.pictures(workspace.hitContext())[0];
      expect(box.drawing.shape).toMatchObject({
        fill: "#C6E1F5", line: "#0070C0", lineWidth: 4, textDirection: "vertical", textAlign: "center",
      });
      drag(box.x + 42, box.y, 0, 0);
      workspace.applyTextBoxFormat({ fill: undefined });
      workspace.applyTextBoxFormat({ line: undefined });
      drag(box.x + 42, box.y, 25, 15);
      expect(workspace.selectedPicture()).toMatchObject({ x: box.x + 25, y: box.y + 15 });
      const pack = await DocxPackage.open(await workspace.exportDocx());
      const xml = pack.xml("word/document.xml");
      expect(xml).toContain('<a:noFill/><a:ln w="38100"><a:noFill/></a:ln>');
      expect(xml).toContain('vert="eaVert" anchor="ctr"');
      const saved = reader.readPackage(pack).paragraphs.head!.data.blocks.find((block) => block.drawing)!.drawing!.shape;
      expect(saved).toMatchObject({ fill: undefined, line: undefined, lineWidth: 4, textDirection: "vertical", textAlign: "center" });
      expect(saved?.text?.paragraphText()).toEqual(["样式回写"]);
    } finally {
      dispose();
    }
  });
});
