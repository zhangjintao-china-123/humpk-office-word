import { describe, expect, it, vi } from "vitest";
import { Block } from "../../src/model/block/Block";
import { InsertCommand } from "../../src/edit/InsertCommand";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { StoryPainter } from "../../src/render/story/StoryPainter";
import { PagePainter } from "../../src/render/page/PagePainter";
import { StatusBar } from "../../src/ui/statusbar/StatusBar";
import { Workspace } from "../../src/ui/workspace/Workspace";

function stubCanvas2d() {
  const ctx = {
    canvas: { width: 800, height: 600 },
    save() {},
    restore() {},
    scale() {},
    translate() {},
    setTransform() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    ellipse() {},
    rect() {},
    clip() {},
    setLineDash() {},
    fillText() {},
    measureText: (text: string) => ({ width: text.length * 8 }),
    drawImage() {},
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
  return vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx);
}

function emptyDoc(): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  paragraph.addBlock(new Block());
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

describe("Workspace 多页绘制", () => {
  it("一帧合并多次滚动，按原页码绘制可见页，并独立刷新光标", () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const workspace = new Workspace(host);
    const statusHost = document.createElement("footer");
    host.after(statusHost);
    const status = new StatusBar(statusHost, workspace);
    const scroll = host.querySelector<HTMLElement>(".ho-word-scroll")!;
    Object.defineProperties(scroll, { clientWidth: { value: 1000 }, clientHeight: { value: 500 } });
    const model = new Document();
    for (let index = 0; index < 3; index += 1) {
      const paragraph = new Paragraph(index + 1);
      paragraph.attrs.pageBreakBefore = index ? "1" : undefined;
      const block = new Block();
      block.text = `第${index + 1}页`;
      paragraph.addBlock(block);
      model.addParagraph(paragraph);
    }
    const pagePaint = vi.spyOn(PagePainter.prototype, "paint");
    const linePaint = vi.spyOn(StoryPainter.prototype, "paintLine");
    const printCanvas = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,");
    let frame: FrameRequestCallback | undefined;
    const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    try {
      workspace.load(model);
      expect(workspace.pageCount).toBe(3);
      expect(statusHost.textContent).toContain("第 1 页 / 共 3 页");
      expect(statusHost.textContent).toContain("9 个字符");
      expect(pagePaint.mock.calls.map((call) => call[4])).toEqual([0]);
      pagePaint.mockClear();
      linePaint.mockClear();

      const { origins, pageSetup } = workspace.hitContext();
      scroll.scrollTop = origins[1].y;
      scroll.dispatchEvent(new Event("scroll"));
      scroll.scrollTop = origins[2].y;
      scroll.dispatchEvent(new Event("scroll"));
      expect(workspace.viewport.scrollY).toBe(origins[2].y);
      expect(request).toHaveBeenCalledTimes(1);
      expect(pagePaint).not.toHaveBeenCalled();
      frame!(0);
      expect(pagePaint.mock.calls.map((call) => call[4])).toEqual([2]);
      expect(statusHost.textContent).toContain("第 3 页 / 共 3 页");
      const pageText = linePaint.mock.calls.filter((call) => call[1].length > 0);
      expect(pageText.map((call) => call[1].paragraph?.getFullText())).toContain("第3页");
      expect(pageText.every((call) => call[4] === 3 && call[5]?.values.NUMPAGES === "3")).toBe(true);

      const point = workspace.viewport.worldToCss(origins[2].x + pageSetup.contentLeft() + 4, origins[2].y + pageSetup.contentTop() + 5);
      const caret = workspace.hitClient(point.x, point.y);
      expect(caret?.node?.data.paragraph?.getFullText()).toBe("第3页");
      linePaint.mockClear();
      workspace.selection.collapse(caret!);
      workspace.onSelectionChange();
      expect(linePaint).not.toHaveBeenCalled();
      expect(host.querySelector<HTMLElement>(".ho-word-caret")?.hidden).toBe(false);

      host.querySelector(".ho-word-ime")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      expect(workspace.selection.caret()?.equals(caret!)).toBe(false);
      expect(linePaint).not.toHaveBeenCalled();

      workspace.setZoom(0.75);
      expect(statusHost.querySelector("input")?.getAttribute("aria-valuetext")).toBe("75%");
      pagePaint.mockClear();
      scroll.scrollTop = origins[2].y * 0.75;
      scroll.dispatchEvent(new Event("scroll"));
      frame!(0);
      expect(pagePaint.mock.calls.map((call) => call[4])).toEqual([2]);

      linePaint.mockClear();
      expect(workspace["renderPrintImages"]()).toHaveLength(3);
      const printedText = linePaint.mock.calls.filter((call) => call[1].length > 0);
      expect(printedText.map((call) => call[1].paragraph?.getFullText())).toEqual(["第1页", "第2页", "第3页"]);
    } finally {
      status.dispose();
      statusHost.remove();
      workspace.dispose();
      host.remove();
      request.mockRestore();
      printCanvas.mockRestore();
      linePaint.mockRestore();
      pagePaint.mockRestore();
      canvas.mockRestore();
    }
  });

  it("编辑后更新字符数，并将滑块、按钮和工作区缩放保持同步", () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    const statusHost = document.createElement("footer");
    document.body.append(host, statusHost);
    const workspace = new Workspace(host);
    const status = new StatusBar(statusHost, workspace);
    const steps: FrameRequestCallback[] = [];
    const frames = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => steps.push(callback));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      workspace.load(emptyDoc());
      expect(statusHost.textContent).toContain("0 个字符");
      workspace.history.do(new InsertCommand(workspace, "中文 AB"));
      vi.advanceTimersByTime(150);
      expect(statusHost.textContent).toContain("4 个字符");
      workspace.history.undo();
      vi.advanceTimersByTime(150);
      expect(statusHost.textContent).toContain("0 个字符");

      const slider = statusHost.querySelector("input")!;
      slider.value = "127";
      slider.dispatchEvent(new Event("input"));
      slider.value = "140";
      slider.dispatchEvent(new Event("input"));
      expect(steps).toHaveLength(1);
      steps[0](0);
      expect(workspace.viewport.zoom).toBe(1.4);
      expect(statusHost.textContent).toContain("140%");
      statusHost.querySelector<HTMLButtonElement>('[data-zoom="in"]')!.click();
      expect(slider.value).toBe("150");
      statusHost.querySelector<HTMLButtonElement>('[data-zoom="reset"]')!.click();
      expect(workspace.viewport.zoom).toBe(1);
    } finally {
      status.dispose();
      workspace.dispose();
      host.remove();
      statusHost.remove();
      vi.useRealTimers();
      frames.mockRestore();
      canvas.mockRestore();
    }
  });
});

describe("Workspace 整表选择与操作", () => {
  it("点击和右键表格左上角控点后，工具栏与右键菜单均可操作整张表", () => {
    const spy = stubCanvas2d();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 900, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 700, configurable: true });
    document.body.appendChild(host);

    const workspace = new Workspace(host);
    workspace.load(emptyDoc());
    workspace.insertTable(2, 2);

    const doc = workspace.bodyDocument()!;
    const tablePara = doc.paragraphs.toArray().find((item) => item.isTable)!;
    const table = tablePara.table!;
    expect(table.rows).toHaveLength(2);

    const scroll = host.querySelector<HTMLElement>(".ho-word-scroll")!;
    Object.defineProperty(scroll, "clientWidth", { value: 900, configurable: true });
    Object.defineProperty(scroll, "clientHeight", { value: 700, configurable: true });
    scroll.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    const handles = (workspace as unknown as { hit: { tableHandles: (ctx: unknown) => { x: number; y: number; size: number }[] }; hitContext: () => unknown })
      .hit.tableHandles((workspace as unknown as { hitContext: () => unknown }).hitContext());
    expect(handles).toHaveLength(1);
    const handle = handles[0];
    const vp = (workspace as unknown as { viewport: { worldToCss: (x: number, y: number) => { x: number; y: number } } }).viewport;
    const handleCss = vp.worldToCss(handle.x + handle.size / 2, handle.y + handle.size / 2);
    const clientX = handleCss.x;
    const clientY = handleCss.y;

    // 左键点表格左上角控点：选中整表，Ribbon 进入表格态，支持合并和框线
    scroll.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX, clientY, pointerId: 1 }));
    scroll.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX, clientY, pointerId: 1 }));
    expect(workspace.selection.flow).not.toBeNull();
    expect(workspace.formatState("").inTable).toBe(true);
    expect(workspace.tableMenuState()).toEqual({
      canMerge: true,
      canSplit: false,
      canDeleteRow: true,
      canDeleteCol: true,
    });

    // 右键点表格左上角控点：保持整表选中并弹出表格右键菜单
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY }));
    const menu = host.querySelector<HTMLElement>(".ho-word-contextmenu")!;
    expect(menu.hidden).toBe(false);
    const mergeBtn = [...menu.querySelectorAll("button")].find((btn) => btn.dataset.act === "mergeCells")!;
    expect(mergeBtn.disabled).toBe(false);
    mergeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(table.rows[0].cells).toHaveLength(1);
    expect(table.rows[0].cells[0].rowSpan).toBe(2);
    expect(table.rows[0].cells[0].colSpan).toBe(2);

    // 整表选区仍保留：此时可以拆回 2x2
    expect(workspace.tableMenuState()?.canSplit).toBe(true);
    workspace.splitTableCell();
    expect(table.rows[0].cells).toHaveLength(2);
    expect(table.rows[1].cells).toHaveLength(2);

    // 整表选区下应用边框
    workspace.applyTableBorder("none");
    expect(table.rows[0].cells[0].borders?.top?.type).toBe("nil");

    // 右键点单元格内部时仍保留整表选区，并可通过“删除表格”删掉整张表及撤销恢复
    const box = (workspace as unknown as { hit: { cellBoxes: (cell: unknown, ctx: unknown) => { x: number; y: number }[] }; hitContext: () => unknown })
      .hit.cellBoxes(table.rows[0].cells[1], (workspace as unknown as { hitContext: () => unknown }).hitContext())[0];
    const cellCss = vp.worldToCss(box.x + 8, box.y + 8);
    scroll.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: cellCss.x, clientY: cellCss.y }),
    );
    expect(workspace.tableMenuState()?.canMerge).toBe(true);
    const delTableBtn = [...menu.querySelectorAll("button")].find((btn) => btn.dataset.act === "deleteTable")!;
    delTableBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(doc.paragraphs.toArray().some((item) => item.isTable)).toBe(false);

    workspace.history.undo();
    expect(doc.paragraphs.toArray().some((item) => item.isTable)).toBe(true);

    workspace.dispose();
    host.remove();
    spy.mockRestore();
  });

  it("表格内按 Tab 切换到下一个单元格，末格按 Tab 自动追加新行", () => {
    const spy = stubCanvas2d();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 900, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 700, configurable: true });
    document.body.appendChild(host);

    const workspace = new Workspace(host);
    workspace.load(emptyDoc());
    workspace.insertTable(2, 2);

    const doc = workspace.bodyDocument()!;
    const table = doc.paragraphs.toArray().find((item) => item.isTable)!.table!;
    const ime = host.querySelector<HTMLTextAreaElement>(".ho-word-ime")!;
    expect(workspace.selection.caret()?.story).toEqual({ slot: "cell", cell: table.rows[0].cells[0] });

    const tab = (shiftKey = false) =>
      ime.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }));

    tab();
    expect(workspace.selection.caret()?.story).toEqual({ slot: "cell", cell: table.rows[0].cells[1] });
    tab();
    expect(workspace.selection.caret()?.story).toEqual({ slot: "cell", cell: table.rows[1].cells[0] });
    tab(true);
    expect(workspace.selection.caret()?.story).toEqual({ slot: "cell", cell: table.rows[0].cells[1] });
    tab();
    tab();
    expect(workspace.selection.caret()?.story).toEqual({ slot: "cell", cell: table.rows[1].cells[1] });
    tab();
    expect(table.rows).toHaveLength(3);
    expect(workspace.selection.caret()?.story).toEqual({ slot: "cell", cell: table.rows[2].cells[0] });

    workspace.dispose();
    host.remove();
    spy.mockRestore();
  });
});
