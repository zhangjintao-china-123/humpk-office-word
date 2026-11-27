import { describe, expect, it, vi } from "vitest";
import { InsertCommand } from "../../src/edit/InsertCommand";
import { drawingFromSize } from "../../src/edit/PictureFile";
import { removeSolidBackground } from "../../src/edit/PicturePixels";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Ribbon } from "../../src/ui/ribbon/Ribbon";
import { Workspace } from "../../src/ui/workspace/Workspace";

function mountApp() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const noop =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
    };
  const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    save: noop("save"),
    restore: noop("restore"),
    scale: noop("scale"),
    translate: noop("translate"),
    rotate: noop("rotate"),
    setTransform: noop("setTransform"),
    clearRect: noop("clearRect"),
    fillRect: noop("fillRect"),
    strokeRect: noop("strokeRect"),
    beginPath: noop("beginPath"),
    closePath: noop("closePath"),
    moveTo: noop("moveTo"),
    lineTo: noop("lineTo"),
    arcTo: noop("arcTo"),
    stroke: noop("stroke"),
    fill: noop("fill"),
    ellipse: noop("ellipse"),
    rect: noop("rect"),
    clip: noop("clip"),
    setLineDash: noop("setLineDash"),
    fillText: noop("fillText"),
    measureText: (value: string) => ({ width: value.length * 8 }),
  } as unknown as CanvasRenderingContext2D);

  const ribbonHost = document.createElement("div");
  const wsHost = document.createElement("div");
  document.body.append(ribbonHost, wsHost);

  const workspace = new Workspace(wsHost);
  const root = wsHost.querySelector<HTMLElement>(".ho-word-scroll")!;
  Object.defineProperties(root, {
    clientWidth: { value: 980 },
    clientHeight: { value: 730 },
  });
  workspace.setZoom(1);

  const model = new Document();
  const p = new Paragraph(1);
  const b = new Block();
  b.text = "正文段落";
  p.addBlock(b);
  model.addParagraph(p);
  new WordStreamBuilder().build(model);
  workspace.load(model);

  const ribbon = new Ribbon(ribbonHost, {
    applyFormat: (a) => workspace.applyFormat(a),
    applyOutline: (a) => workspace.applyOutline(a),
    applyTableBorder: (m) => workspace.applyTableBorder(m),
    setBorderPen: (pen) => workspace.setBorderPen(pen),
    undo: () => workspace.history.undo(),
    redo: () => workspace.history.redo(),
    newBlank: () => workspace.newBlank(),
    formatState: () => workspace.formatState(""),
    openFile: () => undefined,
    saveFile: () => undefined,
    insertTable: (r, c) => workspace.insertTable(r, c),
    insertCoverPage: (t) => workspace.insertCoverPage(t),
    removeCoverPage: () => workspace.removeCoverPage(),
    drawTextBox: (d) => workspace.drawTextBox(d),
    insertPageBreak: () => workspace.insertPageBreak(),
    insertBlankPage: () => workspace.insertBlankPage(),
    insertPicture: () => undefined,
    applyPictureWrap: (w) => workspace.applyPictureWrap(w),
    applyPicturePlace: (place) => workspace.applyPicturePlace(place),
    applyPictureSize: (w, h, l) => workspace.applyPictureSize(w, h, l),
    applyPictureAppearance: (action) => workspace.applyPictureAppearance(action),
    applyTextBoxFormat: (c) => workspace.applyTextBoxFormat(c),
    applyLayerOrder: (a) => workspace.applyLayerOrder(a),
    applyAlign: (a, r) => workspace.applyAlign(a, r),
    applyDistribute: (d) => workspace.applyDistribute(d),
    applyRotate: (r) => workspace.applyRotate(r),
    toggleSelectionPane: () => workspace.toggleSelectionPane(),
    editHeader: () => workspace.editHeader(),
    editFooter: () => workspace.editFooter(),
    insertTableRow: () => workspace.insertTableRow(),
    deleteTableRow: () => workspace.deleteTableRow(),
    insertTableColumn: () => workspace.insertTableColumn(),
    deleteTableColumn: () => workspace.deleteTableColumn(),
    mergeTableCells: () => workspace.mergeTableCells(),
    splitTableCell: () => workspace.splitTableCell(),
    insertToc: () => workspace.insertToc(),
    insertPageNumber: () => workspace.insertPageNumber(),
    applyLink: (r) => workspace.applyLink(r),
    clearLink: () => workspace.clearLink(),
    beginComment: () => workspace.beginComment(),
    addFootnote: (t) => workspace.addFootnote(t),
    showNote: () => undefined,
    acceptRevision: () => workspace.acceptRevision(),
    rejectRevision: () => workspace.rejectRevision(),
    toggleTitlePage: () => workspace.toggleTitlePage(),
    toggleEvenOdd: () => workspace.toggleEvenOdd(),
    setZoom: (z) => workspace.setZoom(z),
    print: () => workspace.print(),
    cut: () => void workspace.cut(),
    copy: () => void workspace.copy(),
    paste: () => void workspace.paste(),
    findNext: (q) => workspace.findNext(q),
    findPrev: (q) => workspace.findPrev(q),
    replaceMatch: (q, r) => workspace.replaceMatch(q, r),
    replaceAllMatches: (q, r) => workspace.replaceAllMatches(q, r),
    closeFind: () => workspace.closeFind(),
  });
  workspace.onUi(() => ribbon.sync());
  ribbon.sync();

  function pointer(type: string, x: number, y: number) {
    root.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y }),
    );
  }

  function drag(x: number, y: number, dx: number, dy: number) {
    pointer("pointerdown", x, y);
    if (dx || dy) {
      pointer("pointermove", x + dx, y + dy);
    }
    pointer("pointerup", x + dx, y + dy);
  }

  function addBox(offsetX: number, offsetY: number, label: string, w = 120, h = 60) {
    const ctx = workspace.hitContext();
    const x = ctx.origins[0].x + ctx.pageSetup.contentLeft() + offsetX;
    const y = ctx.origins[0].y + ctx.pageSetup.contentTop() + offsetY;
    workspace.drawTextBox("horizontal");
    drag(x, y, w, h);
    workspace.history.do(new InsertCommand(workspace, label));
    drag(x + 24, y, 0, 0);
    return workspace.selectedPicture()!;
  }

  return {
    workspace,
    ribbon,
    ribbonHost,
    wsHost,
    model,
    calls,
    drag,
    addBox,
    dispose: () => {
      ribbon.destroy();
      workspace.dispose();
      ribbonHost.remove();
      wsHost.remove();
      ctxSpy.mockRestore();
    },
  };
}

describe("图片工具", () => {
  it("应用比例裁剪、透明度、图片样式和替代文字，并保留 DOCX 往返", async () => {
    const app = mountApp();
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
    const drawing = drawingFromSize(png, 160, 100, 160, 100);
    app.workspace.insertPicture(drawing);
    const button = (action: string) => app.ribbonHost.querySelector<HTMLButtonElement>(`[data-picture-format="${action}"]`)!;
    const open = (action: string) => {
      button(action).closest(".ho-picture-drop")?.querySelector<HTMLButtonElement>("[data-drop-toggle]")!.click();
    };
    try {
      expect(app.ribbonHost.querySelector("[data-page=picture]")?.hasAttribute("hidden")).toBe(false);
      expect(button("style:black").querySelector("img")?.getAttribute("src")).toBe(png);
      button("style:black").click();
      expect(button("style:black").getAttribute("aria-pressed")).toBe("true");

      open("ratio:1");
      button("ratio:1").click();
      expect(drawing.width).toBeCloseTo(100);
      expect(drawing.height).toBeCloseTo(100);
      expect(drawing.pictureAppearance?.crop?.left).toBeCloseTo(0.1875);
      app.workspace.history.undo();
      expect(drawing.width).toBe(160);
      expect(drawing.pictureAppearance?.crop).toBeUndefined();
      app.workspace.history.redo();
      expect(drawing.width).toBeCloseTo(100);

      open("opacity:30");
      button("opacity:30").click();
      expect(drawing.pictureAppearance?.opacity).toBeCloseTo(0.7);
      open("color:gray");
      button("color:gray").click();
      open("description");
      const text = app.ribbonHost.querySelector<HTMLTextAreaElement>('[data-picture-form="description"] textarea')!;
      text.value = "测试图片";
      button("description").click();
      expect(drawing.description).toBe("测试图片");

      const reopened = await new DocxReader().read(await app.workspace.exportDocx());
      const restored = reopened.paragraphs.toArray().flatMap((p) => p.blocks).find((block) => block.drawing)?.drawing;
      expect(restored?.width).toBeCloseTo(100);
      expect(restored?.description).toBe("测试图片");
      expect(restored?.pictureAppearance).toMatchObject({
        crop: { left: 0.1875, right: 0.1875 }, opacity: 0.7, color: "gray", border: { color: "#26394e", width: 2 },
      });
    } finally {
      app.dispose();
    }
  });

  it("删除纯色背景时保留被前景围住的同色区域", () => {
    const width = 5;
    const data = new Uint8ClampedArray(width * width * 4).fill(255);
    for (const pixel of [6, 7, 8, 11, 13, 16, 17, 18]) data.fill(0, pixel * 4, pixel * 4 + 3);
    const image = { width, height: width, data } as ImageData;
    expect(removeSolidBackground(image)).toBe(true);
    expect(data[3]).toBe(0);
    expect(data[6 * 4 + 3]).toBe(255);
    expect(data[12 * 4 + 3]).toBe(255);
  });
});

describe("文本框二期：样式库、更改形状、旋转翻转、层级、对齐分布与选择窗格", () => {
  it("支持更改形状、形状样式库、旋转翻转并保留 DOCX 往返", { timeout: 15000 }, async () => {
    const app = mountApp();
    try {
      const box = app.addBox(60, 50, "星形文本", 140, 80);

      app.ribbonHost.querySelector<HTMLElement>('[data-shape-preset="star5"]')?.click();
      expect(box.drawing.shape?.preset).toBe("star5");
      expect(app.ribbonHost.querySelector('[data-shape-preset="star5"]')?.classList.contains("is-on")).toBe(true);

      app.ribbonHost.querySelector<HTMLElement>('[data-shape-style="solid-blue"]')?.click();
      expect(box.drawing.shape).toMatchObject({ fill: "#4472C4", line: "#2F5597", lineWidth: 1 });
      expect(app.ribbonHost.querySelector('[data-shape-style="solid-blue"]')?.classList.contains("is-on")).toBe(true);

      app.ribbonHost.querySelector<HTMLElement>('[data-picture-rotate="rotate90"]')?.click();
      app.ribbonHost.querySelector<HTMLElement>('[data-picture-rotate="flipH"]')?.click();
      expect(box.drawing.rotation).toBe(90);
      expect(box.drawing.flipH).toBe(true);
      expect(app.calls.some((c) => c.op === "rotate")).toBe(true);
      expect(app.calls.some((c) => c.op === "scale" && c.args[0] === -1 && c.args[1] === 1)).toBe(true);

      // 旋转 90° 后原本 140x80 的框在世界里竖立为 80x140，点击上下延伸区域仍能命中文字编辑
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      app.drag(cx, cy + 50, 0, 0);
      expect(app.workspace.selection.caret()?.story.slot).toBe("textbox");

      app.workspace.history.undo(); // 撤销 flipH
      expect(box.drawing.flipH).toBeUndefined();
      app.workspace.history.redo();
      expect(box.drawing.flipH).toBe(true);

      // 选中框边框后拖拽画布上的旋转手柄进行任意角度旋转并支持撤销/重做
      // 当前 box.drawing.rotation === 90，旋转控点在右侧 (cx + box.height/2 + 24, cy)
      app.drag(cx + box.height / 2, cy, 0, 0);
      expect(app.workspace.selectedPicture()?.drawing).toBe(box.drawing);
      const handleX = cx + box.height / 2 + 24;
      app.drag(handleX, cy, cx - handleX, cy + 80 - cy);
      expect(box.drawing.rotation).toBe(180);
      app.workspace.history.undo();
      expect(box.drawing.rotation).toBe(90);
      app.workspace.history.redo();
      expect(box.drawing.rotation).toBe(180);
      app.ribbonHost.querySelector<HTMLElement>('[data-picture-rotate="rotate-90"]')?.click();
      expect(box.drawing.rotation).toBe(90);

      const reopened = await new DocxReader().read(await app.workspace.exportDocx());
      const saved = reopened.paragraphs.head!.data.blocks.find((b) => b.drawing)!.drawing!;
      expect(saved.rotation).toBe(90);
      expect(saved.flipH).toBe(true);
      expect(saved.shape?.preset).toBe("star5");
      expect(saved.shape?.fill).toBe("#4472C4");
    } finally {
      app.dispose();
    }
  });

  it("支持对象层级调整、对齐与横向分布", { timeout: 15000 }, () => {
    const app = mountApp();
    try {
      app.addBox(20, 40, "框1", 80, 50);
      app.addBox(80, 40, "框2", 80, 50);
      const third = app.addBox(260, 40, "框3", 80, 50);

      // 当前有 3 个对象，分布按钮启用
      const distHBtn = app.ribbonHost.querySelector<HTMLButtonElement>('[data-picture-distribute="distributeH"]')!;
      expect(distHBtn.disabled).toBe(false);
      distHBtn.click();
      const sortedX = app.workspace.hitTester
        .pictures(app.workspace.hitContext())
        .map((p) => p.x)
        .sort((a, b) => a - b);
      expect(sortedX[1] - sortedX[0]).toBeCloseTo(sortedX[2] - sortedX[1], 1);

      // 对齐页面中心
      app.ribbonHost.querySelector<HTMLElement>('[data-align-ref="page"]')?.click();
      app.ribbonHost.querySelector<HTMLElement>('[data-picture-align="center"]')?.click();
      const centered = app.workspace.selectedPicture()!;
      expect(centered.drawing.anchorSet?.leftFrom).toBe("page");
      expect(centered.drawing.anchorSet?.leftAlign).toBe("center");
      expect(centered.x + centered.width / 2).toBeCloseTo(
        app.workspace.hitContext().origins[0].x + app.workspace.hitContext().pageSetup.width / 2,
        1,
      );

      // 层级调整：置底并撤销/重做
      app.ribbonHost.querySelector<HTMLElement>('[data-picture-layer="sendToBack"]')?.click();
      const orderAfterSend = app.workspace.hitTester.pictures(app.workspace.hitContext()).map((p) => p.drawing);
      expect(orderAfterSend[0]).toBe(third.drawing);

      app.workspace.history.undo();
      const orderAfterUndo = app.workspace.hitTester.pictures(app.workspace.hitContext()).map((p) => p.drawing);
      expect(orderAfterUndo[orderAfterUndo.length - 1]).toBe(third.drawing);
    } finally {
      app.dispose();
    }
  });

  it("支持选择窗格显隐、层级移动与 DOCX 写回", { timeout: 15000 }, async () => {
    const app = mountApp();
    try {
      const first = app.addBox(20, 40, "框1", 80, 50);
      const second = app.addBox(140, 40, "框2", 80, 50);

      app.ribbonHost.querySelector<HTMLElement>('[data-page="picture"] [data-act="selection-pane"]')?.click();
      const pane = app.wsHost.querySelector<HTMLElement>(".ho-word-selection-pane")!;
      expect(pane.hidden).toBe(false);
      expect(pane.querySelectorAll(".ho-word-pane-item")).toHaveLength(2);

      // 选中底层对象并在选择窗格中上移一层
      pane.querySelectorAll<HTMLElement>("[data-pane-select]")[1]?.click();
      expect(app.workspace.selectedPicture()?.drawing).toBe(first.drawing);
      pane.querySelector<HTMLElement>("[data-pane-up]")?.click();
      const orderAfterUp = app.workspace.hitTester.pictures(app.workspace.hitContext()).map((p) => p.drawing);
      expect(orderAfterUp[1]).toBe(first.drawing);

      // 隐藏其中一个并验证命中
      pane.querySelectorAll<HTMLElement>("[data-pane-vis]")[0]?.click();
      expect(first.drawing.hidden).toBe(true);
      expect(app.workspace.hitTester.pictures(app.workspace.hitContext())).toHaveLength(1);

      // 全部隐藏 & 全部显示
      pane.querySelector<HTMLElement>("[data-pane-hide-all]")?.click();
      expect(app.workspace.hitTester.pictures(app.workspace.hitContext())).toHaveLength(0);
      expect(second.drawing.hidden).toBe(true);

      pane.querySelector<HTMLElement>("[data-pane-show-all]")?.click();
      expect(app.workspace.hitTester.pictures(app.workspace.hitContext())).toHaveLength(2);

      // 隐藏其中一个并导出 DOCX 验证 hidden 和 relativeHeight 写回
      pane.querySelectorAll<HTMLElement>("[data-pane-vis]")[0]?.click();
      const reopened = await new DocxReader().read(await app.workspace.exportDocx());
      const savedDrawings = reopened.paragraphs.head!.data.blocks.map((b) => b.drawing).filter(Boolean);
      expect(savedDrawings.some((d) => d?.hidden === true)).toBe(true);
      expect(savedDrawings.every((d) => d?.anchorSet?.zIndex != null)).toBe(true);
    } finally {
      app.dispose();
    }
  });
});
