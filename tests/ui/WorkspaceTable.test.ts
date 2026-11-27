import { describe, expect, it, vi } from "vitest";
import { Block } from "../../src/model/block/Block";
import { InsertCommand } from "../../src/edit/InsertCommand";
import { documentStats } from "../../src/edit/DocumentStats";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { StoryPainter } from "../../src/render/story/StoryPainter";
import { PagePainter } from "../../src/render/page/PagePainter";
import { CaretPos } from "../../src/selection/CaretPos";
import { cmToPx, pxToTwip } from "../../src/shared/units";
import { Ribbon, type RibbonHost } from "../../src/ui/ribbon/Ribbon";
import { StatusBar } from "../../src/ui/statusbar/StatusBar";
import { Workspace } from "../../src/ui/workspace/Workspace";

function stubCanvas2d() {
  const ctx = {
    canvas: { width: 800, height: 600 },
    save() {},
    restore() {},
    scale() {},
    translate() {},
    rotate() {},
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

describe("Workspace 视图与导航", () => {
  it("通过视图显示标尺，随页面移动并将拖动保存为一次可撤销的段落格式修改", async () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    const ribbonHost = document.createElement("div");
    document.body.append(ribbonHost, host);
    const workspace = new Workspace(host);
    const scroll = host.querySelector<HTMLElement>(".ho-word-scroll")!;
    Object.defineProperties(scroll, { clientWidth: { value: 1100 }, clientHeight: { value: 520 } });
    const doc = emptyDoc();
    const paragraph = doc.paragraphs.head!.data;
    paragraph.attrs.firstLineTwip = pxToTwip(cmToPx(0.5));
    workspace.load(doc);
    const ribbon = new Ribbon(ribbonHost, {
      formatState: () => workspace.formatState(""),
      view: workspace,
    } as unknown as RibbonHost);
    const detach = workspace.onUi(() => ribbon.sync());
    try {
      ribbonHost.querySelector<HTMLButtonElement>("[data-tab=view]")!.click();
      const checkbox = ribbonHost.querySelector<HTMLInputElement>("[data-view-option=ruler]")!;
      const rulers = host.querySelector<HTMLElement>(".ho-word-rulers")!;
      const guide = host.querySelector<HTMLElement>(".ho-word-ruler-guide")!;
      const left = rulers.querySelector<HTMLButtonElement>("[data-indent=left]")!;
      expect(rulers.hidden).toBe(true);
      checkbox.click();
      expect(checkbox.checked).toBe(true);
      expect(rulers.hidden).toBe(false);
      workspace.setZoom(1.5);
      const beforeScroll = parseFloat(left.style.left);
      scroll.scrollLeft += 90;
      workspace.paint();
      expect(parseFloat(left.style.left)).toBeCloseTo(beforeScroll - 90);

      const start = 200;
      const end = start + cmToPx(2) * workspace.viewport.zoom;
      const pointer = (type: string, clientX: number) => {
        left.dispatchEvent(new PointerEvent(type, { clientX, pointerId: 1, button: 0, bubbles: true }));
      };
      pointer("pointerdown", start);
      pointer("pointermove", end);
      expect(guide.hidden).toBe(false);
      expect(paragraph.attrs.leftTwip).toBeUndefined();
      pointer("pointerup", end);
      expect(guide.hidden).toBe(true);
      const indent = pxToTwip(cmToPx(2));
      expect(paragraph.attrs.leftTwip).toBe(indent);
      expect(workspace.history.undo()).toBe(true);
      expect(paragraph.attrs.leftTwip).toBeUndefined();
      expect(workspace.history.canUndo()).toBe(false);
      expect(workspace.history.redo()).toBe(true);

      const hanging = rulers.querySelector<HTMLButtonElement>("[data-indent=hanging]")!;
      hanging.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
      expect(paragraph.attrs.leftTwip).toBe(pxToTwip(cmToPx(2.5)));
      expect(paragraph.attrs.firstLineTwip).toBe(0);
      const right = rulers.querySelector<HTMLButtonElement>("[data-indent=right]")!;
      expect(right.getAttribute("aria-valuenow")).toBe("0.00");
      right.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true }));
      expect(right.getAttribute("aria-valuenow")).toBe("0.50");
      const saved = await new DocxReader().read(await workspace.exportDocx());
      expect(saved.paragraphs.head!.data.attrs.leftTwip).toBe(paragraph.attrs.leftTwip);
      expect(saved.paragraphs.head!.data.attrs.firstLineTwip).toBe(0);
      expect(saved.paragraphs.head!.data.attrs.rightTwip).toBe(paragraph.attrs.rightTwip);

      workspace.setFocusMode(true);
      expect(rulers.hidden).toBe(true);
      workspace.setFocusMode(false);
      expect(rulers.hidden).toBe(false);
      checkbox.click();
      expect(rulers.hidden).toBe(true);
    } finally {
      detach();
      ribbon.destroy();
      workspace.dispose();
      host.remove();
      ribbonHost.remove();
      canvas.mockRestore();
    }
  });

  it("在视图菜单打开导航，折叠和跳转标题、浏览页面、搜索并随编辑刷新", () => {
    const canvas = stubCanvas2d();
    const app = document.createElement("div");
    app.className = "ho-word-app";
    const host = document.createElement("div");
    const ribbonHost = document.createElement("div");
    app.append(ribbonHost, host);
    document.body.append(app);
    const workspace = new Workspace(host);
    const scroll = host.querySelector<HTMLElement>(".ho-word-scroll")!;
    Object.defineProperties(scroll, { clientWidth: { value: 1100, configurable: true }, clientHeight: { value: 520 } });
    const doc = new Document();
    for (const [index, title] of ["设计方案", "方案说明", "测试方案"].entries()) {
      const paragraph = new Paragraph(index + 1);
      paragraph.attrs.outlineLevel = index === 1 ? 2 : 1;
      if (index) paragraph.attrs.pageBreakBefore = "1";
      paragraph.addBlock(Object.assign(new Block(), { text: title }));
      doc.addParagraph(paragraph);
    }
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    workspace.load(doc);
    const ribbon = new Ribbon(ribbonHost, {
      formatState: () => workspace.formatState(""),
      view: workspace,
    } as unknown as RibbonHost);
    const detach = workspace.onUi(() => ribbon.sync());
    const nav = host.querySelector<HTMLElement>(".ho-word-navigation")!;
    const select = (selector: string) => nav.querySelector<HTMLButtonElement>(selector)!;
    const runFrames = () => frames.splice(0).forEach((callback) => callback(0));
    try {
      ribbonHost.querySelector<HTMLButtonElement>("[data-tab=view]")!.click();
      const checkbox = ribbonHost.querySelector<HTMLInputElement>("[data-view-option=navigation]")!;
      checkbox.click();
      expect(checkbox.checked).toBe(true);
      expect(nav.hidden).toBe(false);
      expect(nav.querySelectorAll("[data-nav-heading]")).toHaveLength(3);
      select("[data-nav-expand]").click();
      expect(nav.querySelectorAll("[data-nav-heading]")).toHaveLength(2);
      select("[data-nav-expand]").click();
      select("[data-nav-heading='1']").click();
      expect(scroll.scrollTop).toBeGreaterThan(workspace.pageSetup.height);
      expect(workspace.selection.caret()?.node?.data.paragraph?.getFullText()).toBe("方案说明");
      expect(select("[data-nav-heading='1']").getAttribute("aria-current")).toBe("true");

      select("[data-nav-tab=pages]").click();
      runFrames();
      select("[data-nav-page='3']").click();
      expect(workspace.viewportPage()).toBe(3);
      window.visualViewport?.dispatchEvent(new Event("resize"));
      expect(workspace.viewportPage()).toBe(3);
      expect(select("[data-nav-page='3']").getAttribute("aria-current")).toBe("page");
      expect(nav.querySelectorAll("[data-nav-page] canvas").length).toBeGreaterThan(0);
      Object.defineProperty(scroll, "clientWidth", { value: 620, configurable: true });
      workspace.resizeViewport();
      expect(workspace.viewportPage()).toBe(3);
      Object.defineProperty(scroll, "clientWidth", { value: 1100, configurable: true });
      workspace.resizeViewport();
      expect(workspace.viewportPage()).toBe(3);

      ribbon.openFind();
      const input = nav.querySelector<HTMLInputElement>('input[type="search"]')!;
      expect(document.activeElement).toBe(input);
      input.value = "方案";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(140);
      expect(nav.querySelectorAll("[data-nav-result]")).toHaveLength(3);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(nav.querySelector("[data-nav-result][aria-current=true] mark")?.textContent).toBe("方案");
      expect(workspace.selection.caret()?.node?.data.paragraph?.getFullText()).toBe("设计方案");
      expect(document.activeElement).toBe(input);

      select("[data-nav-tab=headings]").click();
      const heading = doc.paragraphs.tail!.data;
      workspace.selection.collapse(new CaretPos({ slot: "body" }, doc.words.tail));
      workspace.history.do(new InsertCommand(workspace, "补充"));
      vi.advanceTimersByTime(160);
      expect(select("[data-nav-heading='2']").textContent).toBe(heading.getFullText());
      ribbonHost.querySelector<HTMLButtonElement>("[data-view-action=page]")!.click();
      expect(workspace.viewState().zoomMode).toBe("page");
      expect(workspace.viewport.zoom).toBeLessThan(1);

      ribbonHost.querySelector<HTMLButtonElement>("[data-view-action=focus]")!.click();
      expect(app.classList.contains("is-focus-mode")).toBe(true);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(app.classList.contains("is-focus-mode")).toBe(false);
      workspace.load(emptyDoc());
      expect(nav.querySelectorAll("[data-nav-heading]")).toHaveLength(0);
      expect(input.value).toBe("");
    } finally {
      detach();
      ribbon.destroy();
      workspace.dispose();
      app.remove();
      vi.useRealTimers();
      raf.mockRestore();
      canvas.mockRestore();
    }
  });
});

describe("Workspace 引用", () => {
  it("插入和更新书目、题注和页码引用，支持撤销及 DOCX 重新打开", async () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    document.body.append(host);
    const workspace = new Workspace(host);
    try {
      const model = new Document();
      const heading = new Paragraph(1);
      heading.attrs.outlineLevel = 1;
      heading.addBlock(Object.assign(new Block(), { text: "研究方法" }));
      const text = new Paragraph(2);
      text.addBlock(Object.assign(new Block(), { text: "参见" }));
      model.addParagraph(heading);
      model.addParagraph(text);
      workspace.load(model);
      const moveToText = () => {
        let node = model.words.head;
        while (node && (node.data.paragraph !== text || !node.data.isEnterChar())) node = node.next;
        workspace.selection.collapse(new CaretPos({ slot: "body" }, node));
      };
      moveToText();
      expect(workspace.insertCitation({
        type: "Book", title: "研究基础", author: "Li, Ming", year: "2024", container: "示例出版社", url: "",
      })).toBe(true);
      expect(workspace.insertCitation("Ref1")).toBe(true);
      expect(model.citationSources).toHaveLength(1);
      expect(text.blocks.filter((block) => block.field === "CITATION").map((block) => block.text)).toEqual(["(Li, 2024)", "(Li, 2024)"]);
      expect(workspace.insertBibliography()).toBe(true);
      expect(workspace.insertCaption("Figure", "书目之后")).toBe(true);
      expect(model.paragraphs.toArray().find((item) => item.bibliography?.end)?.getNextParagraph()?.getFullText()).toContain("书目之后");
      workspace.history.undo();
      workspace.setCitationStyle("MLA");
      expect(text.blocks.filter((block) => block.field === "CITATION").map((block) => block.text)).toEqual(["(Li)", "(Li)"]);
      expect(workspace.insertBibliography()).toBe(true);
      expect(model.paragraphs.toArray().filter((item) => item.bibliography?.start)).toHaveLength(1);
      workspace.history.undo();
      expect(model.paragraphs.toArray().find((item) => item.bibliography?.start)?.getFullText()).toContain("Li, M.");
      workspace.history.redo();
      expect(model.paragraphs.toArray().find((item) => item.bibliography?.start)?.getFullText()).toContain("Li, Ming.");

      moveToText();
      workspace.addFootnote("脚注内容");
      workspace.addFootnote("尾注第一行\n尾注第二行", "endnote");
      expect(workspace.insertCrossReference(1, "page")).toBe(true);
      expect(text.blocks.find((block) => block.field === "PAGEREF")?.fieldInstr).toContain(heading.bookmarks[0]);
      expect(workspace.insertCaption("Figure", "系统架构")).toBe(true);
      workspace.insertToc();
      expect(model.paragraphs.toArray().some((item) => item.toc?.role === "start")).toBe(true);
      workspace.history.undo();
      workspace.history.undo();
      expect(model.paragraphs.toArray().some((item) => item.getFullText().includes("系统架构"))).toBe(false);
      workspace.history.redo();
      workspace.history.redo();
      expect(workspace.insertFigureList()).toBe(true);

      const data = await workspace.exportDocx();
      const pack = await DocxPackage.open(data);
      expect(pack.xml("word/document.xml")).toContain("BIBLIOGRAPHY");
      expect(pack.xml("word/document.xml")?.match(/<w:fldSimple w:instr="CITATION/g)).toHaveLength(2);
      expect(pack.xml("word/document.xml")).toContain("w:endnoteReference");
      expect(pack.xml("customXml/item1.xml")).toContain("Ref1");
      const saved = await new DocxReader().read(data);
      expect(saved.citationStyle).toBe("MLA");
      expect(saved.citationSources[0]).toMatchObject({ title: "研究基础", author: "Li, Ming" });
      expect(saved.endnotes[0]?.text).toBe("尾注第一行\n尾注第二行");
      const paragraphs = saved.paragraphs.toArray();
      expect(paragraphs.some((item) => item.bibliography?.start)).toBe(true);
      const pageReference = paragraphs.flatMap((item) => item.blocks).find((block) => block.field === "PAGEREF");
      expect(paragraphs.some((item) => item.bookmarks.some((name) => pageReference?.fieldInstr?.includes(name)))).toBe(true);
    } finally {
      workspace.dispose();
      host.remove();
      canvas.mockRestore();
    }
  });
});

describe("Workspace 审阅", () => {
  it("从修订按钮开始记录输入、删除和替换，撤销和 DOCX 往返保留标记及设置", async () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    const ribbonHost = document.createElement("div");
    const statusHost = document.createElement("div");
    document.body.append(ribbonHost, host, statusHost);
    const workspace = new Workspace(host);
    const model = new Document();
    model.props.creator = "审阅人";
    const paragraph = new Paragraph(1);
    paragraph.addBlock(Object.assign(new Block(), { text: "甲乙丙", style: { bold: true } }));
    const imported = new Paragraph(2);
    imported.addBlock(Object.assign(new Block(), { text: "待确认", revision: { kind: "ins", id: "19" } }));
    model.addParagraph(paragraph);
    model.addParagraph(imported);
    workspace.load(model);
    const status = new StatusBar(statusHost, workspace);
    const ribbon = new Ribbon(ribbonHost, {
      formatState: () => workspace.formatState(""),
      reviewState: () => workspace.reviewState(),
      toggleTrackRevisions: () => workspace.toggleTrackRevisions(),
    } as RibbonHost);
    const detach = workspace.onUi(() => ribbon.sync());
    const track = ribbonHost.querySelector<HTMLButtonElement>("[data-act=track-revisions]")!;
    const indicator = statusHost.querySelector<HTMLElement>(".ho-word-statusbar-tracking")!;
    const input = host.querySelector<HTMLTextAreaElement>(".ho-word-ime")!;
    const story = { slot: "body" } as const;
    const marks = () => paragraph.blocks.filter((block) => block.revision)
      .map((block) => [block.text, block.revision?.kind]);
    try {
      ribbonHost.querySelector<HTMLButtonElement>("[data-tab=review]")!.click();
      expect(track.getAttribute("aria-pressed")).toBe("false");
      expect(indicator.hidden).toBe(true);
      track.click();
      expect(track.getAttribute("aria-pressed")).toBe("true");
      expect(indicator.hidden).toBe(false);
      expect(document.activeElement).toBe(input);

      const replaced = model.words.head!.next!;
      workspace.selection.setFlow(new CaretPos(story, replaced), new CaretPos(story, replaced, true));
      input.dispatchEvent(new CompositionEvent("compositionstart"));
      input.value = "新";
      input.dispatchEvent(new CompositionEvent("compositionend", { data: "新" }));
      input.dispatchEvent(new InputEvent("input"));
      expect(marks()).toEqual([["新", "ins"], ["乙", "del"]]);
      expect(paragraph.blocks.find((block) => block.text === "新")?.revision).toMatchObject({
        kind: "ins", id: "21", author: "审阅人",
      });
      workspace.history.undo();
      expect(paragraph.getFullText()).toBe("甲乙丙");
      expect(marks()).toEqual([]);
      workspace.history.redo();
      expect(marks()).toEqual([["新", "ins"], ["乙", "del"]]);

      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
      expect(marks()).toEqual([["新", "ins"], ["乙", "del"], ["丙", "del"]]);
      workspace.history.undo();
      expect(workspace.findNext({ text: "乙", matchCase: true }).total).toBe(0);
      expect(workspace.replaceAllMatches({ text: "甲", matchCase: true }, "今").replaced).toBe(1);
      expect(marks()).toEqual([["今", "ins"], ["甲", "del"], ["新", "ins"], ["乙", "del"]]);

      track.click();
      expect(indicator.hidden).toBe(true);
      let node = model.words.head;
      while (node && node.data.char !== "新") node = node.next;
      expect(node).not.toBeNull();
      workspace.selection.collapse(new CaretPos(story, node, true));
      input.value = "常";
      input.dispatchEvent(new InputEvent("input"));
      expect(paragraph.blocks.find((block) => block.text === "常")?.revision).toBeUndefined();
      const reader = new DocxReader();
      const paused = await reader.read(await workspace.exportDocx());
      expect(paused.trackRevisions).toBe(false);
      expect(paused.paragraphs.head?.data.blocks.filter((block) => block.revision)).toHaveLength(4);

      track.click();
      const saved = await reader.read(await workspace.exportDocx());
      expect(saved.trackRevisions).toBe(true);
      const deleted = saved.paragraphs.head?.data.blocks.find((block) => block.text === "乙");
      expect(deleted?.revision?.kind).toBe("del");
      expect(deleted?.style.bold).toBe(true);
      workspace.load(saved);
      expect(track.getAttribute("aria-pressed")).toBe("true");
      workspace.load(emptyDoc());
      expect(track.getAttribute("aria-pressed")).toBe("false");
    } finally {
      detach();
      status.dispose();
      ribbon.destroy();
      workspace.dispose();
      ribbonHost.remove();
      host.remove();
      statusHost.remove();
      canvas.mockRestore();
    }
  });

  it("从审阅选项卡跳转、显隐和删除批注，处理修订并显示字数", async () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    const ribbonHost = document.createElement("div");
    document.body.append(ribbonHost, host);
    const workspace = new Workspace(host);
    const scroll = host.querySelector(".ho-word-scroll")!;
    Object.defineProperties(scroll, { clientWidth: { value: 1160 }, clientHeight: { value: 550 } });
    const model = new Document();
    const paragraph = new Paragraph(1);
    for (const [text, attributes] of [
      ["说明 ", {}],
      ["新增", { commentIds: ["8"], revision: { kind: "ins", id: "1" }, style: { bold: true } }],
      ["1", { commentRef: "8" }],
      ["旧文", { revision: { kind: "del", id: "2" } }],
      [" Keep", { commentIds: ["9"] }],
      ["2", { commentRef: "9" }],
    ] as const) {
      paragraph.addBlock(Object.assign(new Block(), attributes, { text }));
    }
    model.addParagraph(paragraph);
    model.comments = [
      { id: "8", author: "甲", text: "说明新增内容" },
      { id: "9", author: "乙", text: "保留第二条批注" },
    ];
    workspace.load(model);
    const ribbon = new Ribbon(ribbonHost, {
      formatState: () => workspace.formatState(""),
      reviewState: () => workspace.reviewState(),
      reviewStats: () => ({ ...documentStats(model), pages: workspace.pageCount }),
      navigateComment: (direction) => workspace.navigateComment(direction),
      toggleComments: () => workspace.toggleComments(),
      deleteComment: () => workspace.deleteComment(),
      navigateRevision: (direction) => workspace.navigateRevision(direction),
      acceptRevision: () => workspace.acceptRevision(),
      rejectRevision: () => workspace.rejectRevision(),
    } as RibbonHost);
    const detach = workspace.onUi(() => ribbon.sync());
    const action = (name: string) => ribbonHost.querySelector<HTMLButtonElement>(`[data-page=review] [data-act=${name}]`)!;
    const margin = () => host.querySelectorAll("[data-margin-comment]");
    try {
      ribbonHost.querySelector<HTMLButtonElement>("[data-tab=review]")!.click();
      expect(action("delete-comment").disabled).toBe(true);
      expect(margin()).toHaveLength(2);
      action("next-comment").click();
      expect(host.querySelector("[data-margin-comment][aria-current]")?.getAttribute("data-margin-comment")).toBe("8");
      action("show-comments").click();
      expect(margin()).toHaveLength(0);
      action("next-comment").click();
      expect(margin()).toHaveLength(2);
      expect(host.querySelector("[data-margin-comment][aria-current]")?.getAttribute("data-margin-comment")).toBe("9");
      action("previous-comment").click();
      action("delete-comment").click();
      expect(model.comments.map(({ id }) => id)).toEqual(["9"]);
      expect(paragraph.blocks.filter(({ commentRef }) => commentRef).map(({ text }) => text)).toEqual(["1"]);
      expect(paragraph.blocks.some(({ commentIds }) => commentIds?.includes("8"))).toBe(false);
      workspace.history.undo();
      expect(paragraph.blocks.filter(({ commentRef }) => commentRef).map(({ text }) => text)).toEqual(["1", "2"]);
      workspace.history.redo();
      expect(margin()).toHaveLength(1);

      workspace.selection.collapse(new CaretPos({ slot: "body" }, model.words.head));
      workspace.onSelectionChange();
      action("next-revision").click();
      expect(workspace.selection.primaryRange()?.start.node?.data.block?.revision?.id).toBe("1");
      action("accept-revision").click();
      expect(paragraph.blocks.find(({ text }) => text === "新增")?.style.bold).toBe(true);
      action("next-revision").click();
      expect(workspace.selection.primaryRange()?.start.node?.data.block?.revision?.id).toBe("2");
      action("word-count").click();
      const dialog = ribbonHost.querySelector("dialog")!;
      expect(dialog.open).toBe(true);
      expect(dialog.querySelector("[data-review-stat=words]")?.textContent).toBe("5");
      expect(dialog.querySelector("[data-review-stat=characters]")?.textContent).toBe("8");
      dialog.close();
      action("reject-revision").click();
      expect(action("next-revision").disabled).toBe(true);
      expect(paragraph.getFullText()).toContain("旧文");
      const saved = await new DocxReader().read(await workspace.exportDocx());
      expect(saved.comments.map(({ id }) => id)).toEqual(["9"]);
      expect(saved.paragraphs.head?.data.blocks.some(({ revision }) => revision)).toBe(false);
    } finally {
      detach();
      ribbon.destroy();
      workspace.dispose();
      ribbonHost.remove();
      host.remove();
      canvas.mockRestore();
    }
  });
});

describe("Workspace 多页绘制", () => {
  it("批注正文随对应页面滚动，在纸面右侧错开并可回到原文", () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    document.body.append(host);
    const workspace = new Workspace(host);
    const scroll = host.querySelector<HTMLElement>(".ho-word-scroll")!;
    Object.defineProperties(scroll, { clientWidth: { value: 1160 }, clientHeight: { value: 550 } });
    const model = new Document();
    model.comments = [
      { id: "1", author: "甲", text: "核对金额\n请附依据" },
      { id: "2", author: "乙", text: "同一处的第二条批注" },
      { id: "3", author: "丙", text: "第二页批注" },
    ];
    for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
      const paragraph = new Paragraph(pageIndex + 1);
      if (pageIndex) paragraph.attrs.pageBreakBefore = "1";
      const block = new Block();
      block.text = `第${pageIndex + 1}页的原文`;
      block.commentIds = pageIndex ? ["3"] : ["1", "2"];
      paragraph.addBlock(block);
      model.addParagraph(paragraph);
    }
    let frame: FrameRequestCallback | undefined;
    const frames = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    try {
      workspace.load(model);
      const { origins, pageSetup } = workspace.hitContext();
      const margin = host.querySelector<HTMLElement>(".ho-word-comment-margin")!;
      const first = margin.querySelector<HTMLElement>('[data-comment-page="1"]')!;
      const [card, next] = first.querySelectorAll<HTMLButtonElement>(".ho-word-comment-card");
      expect(card.querySelector(".ho-word-comment-content")?.textContent).toBe("核对金额\n请附依据");
      expect(Number.parseFloat(first.style.left)).toBeGreaterThan((origins[0].x + pageSetup.width) * workspace.viewport.zoom);
      expect(Number.parseFloat(next.style.top)).toBeGreaterThan(Number.parseFloat(card.style.top));
      expect(margin.querySelector('[data-comment-page="2"]')).toBeNull();

      scroll.scrollTop = origins[1].y * workspace.viewport.zoom;
      scroll.dispatchEvent(new Event("scroll"));
      frame!(0);
      expect(margin.querySelector('[data-comment-page="1"]')).toBeNull();
      const second = margin.querySelector<HTMLElement>('[data-comment-page="2"]')!;
      expect(Number.parseFloat(second.style.top)).toBeCloseTo(origins[1].y * workspace.viewport.zoom);
      const target = second.querySelector<HTMLButtonElement>(".ho-word-comment-card")!;
      target.click();
      expect(workspace.selection.caret()?.node?.data.paragraph?.getFullText()).toBe("第2页的原文");
      expect(target.getAttribute("aria-current")).toBe("true");

      workspace.beginComment();
      const draft = margin.querySelector<HTMLFormElement>("[data-comment-form]")!;
      expect(draft.closest("[data-comment-page]")?.getAttribute("data-comment-page")).toBe("2");
      expect(document.activeElement).toBe(draft.querySelector("textarea"));
      expect(margin.querySelectorAll('[data-comment-page="2"] [data-margin-comment]')).toHaveLength(1);
      expect(model.comments).toHaveLength(3);

      workspace.load(emptyDoc());
      expect(margin.hidden).toBe(true);
      expect(margin.childElementCount).toBe(0);
    } finally {
      workspace.dispose();
      host.remove();
      frames.mockRestore();
      canvas.mockRestore();
    }
  });

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
  it("单击插入批注在页面右侧编辑，提交后定位表格中的原选区并保存", async () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    const ribbonHost = document.createElement("div");
    document.body.append(ribbonHost, host);
    const workspace = new Workspace(host);
    const scroll = host.querySelector<HTMLElement>(".ho-word-scroll")!;
    Object.defineProperties(scroll, { clientWidth: { value: 1100 }, clientHeight: { value: 550 } });
    workspace.load(emptyDoc());
    workspace.insertTable(2, 2);
    const model = workspace.bodyDocument()!;
    const cell = model.paragraphs.toArray().find((p) => p.table)!.table!.rows[0].cells[0];
    const story = { slot: "cell", cell } as const;
    workspace.selection.collapse(new CaretPos(story, cell.document.words.head, false));
    workspace.history.do(new InsertCommand(workspace, "甲乙丙"));
    const selected = cell.document.words.head!.next!;
    workspace.selection.setFlow(new CaretPos(story, selected, false), new CaretPos(story, selected, true));
    const ribbon = new Ribbon(ribbonHost, {
      formatState: () => workspace.formatState(""),
      beginComment: () => workspace.beginComment(),
    } as RibbonHost);
    const detach = workspace.onUi(() => ribbon.sync());
    const button = (selector: string) => ribbonHost.querySelector<HTMLButtonElement>(selector)!;
    try {
      button("[data-tab=insert]").click();
      const insert = button("[data-act=new-comment]");
      const draft = () => host.querySelector<HTMLFormElement>(".ho-word-comment-margin [data-comment-form]");
      insert.click();
      expect(draft()?.closest("[data-comment-page]")?.getAttribute("data-comment-page")).toBe("1");
      const form = draft()!;
      const input = form.querySelector("textarea")!;
      expect(document.activeElement).toBe(input);
      expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(draft()).toBeNull();
      expect(workspace.selection.flow?.anchor.node).toBe(selected);
      expect(model.comments).toHaveLength(0);

      insert.click();
      const nextInput = draft()!.querySelector("textarea")!;
      nextInput.value = "核对金额\n补充出处";
      nextInput.dispatchEvent(new Event("input", { bubbles: true }));
      workspace.selection.collapse(new CaretPos({ slot: "body" }, model.words.tail, false));
      insert.click();
      expect(document.activeElement).toBe(nextInput);
      expect(draft()!.querySelector("textarea")?.value).toBe("核对金额\n补充出处");
      nextInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
      expect(draft()).toBeNull();
      expect(model.comments.map((item) => item.text)).toEqual(["核对金额\n补充出处"]);
      const card = host.querySelector<HTMLButtonElement>("button[data-margin-comment]")!;
      expect(card.querySelector(".ho-word-comment-content")?.textContent).toBe("核对金额\n补充出处");
      const blocks = cell.document.paragraphs.head!.data.blocks;
      expect(blocks.filter((item) => item.commentIds?.length).map((item) => item.text)).toEqual(["乙"]);

      workspace.selection.collapse(new CaretPos({ slot: "body" }, model.words.tail, false));
      card.click();
      expect(workspace.selection.caret()?.story).toEqual(story);
      expect(workspace.selection.caret()?.node?.data.char).toBe("乙");
      const reopened = await new DocxReader().read(await workspace.exportDocx());
      expect(reopened.comments[0]?.text).toBe("核对金额\n补充出处");
      const savedCell = reopened.paragraphs.toArray().find((p) => p.table)?.table?.rows[0].cells[0];
      const savedBlocks = savedCell?.document.paragraphs.head?.data.blocks ?? [];
      expect(savedBlocks.filter((item) => item.commentIds?.includes(reopened.comments[0].id)).map((item) => item.text)).toEqual(["乙"]);
      expect(savedBlocks.filter((item) => item.commentRef === reopened.comments[0].id)).toHaveLength(1);
      workspace.history.undo();
      expect(model.comments).toHaveLength(0);
      expect(host.querySelector(".ho-word-comment-card")).toBeNull();
      workspace.history.redo();
      expect(model.comments).toHaveLength(1);
      expect(host.querySelector(".ho-word-comment-card")).not.toBeNull();
    } finally {
      detach();
      ribbon.destroy();
      workspace.dispose();
      host.remove();
      ribbonHost.remove();
      canvas.mockRestore();
    }
  });

  it("表格布局菜单修改实际列宽和对齐，并可撤销及保存为 DOCX", async () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    const ribbonHost = document.createElement("div");
    document.body.append(ribbonHost, host);
    const workspace = new Workspace(host);
    workspace.load(emptyDoc());
    workspace.insertTable(3, 2);
    const table = workspace.bodyDocument()!.paragraphs.toArray().find((p) => p.table)!.table!;
    const cell = table.rows[0].cells[0];
    workspace.selection.collapse(new CaretPos({ slot: "cell", cell }, cell.document.words.head, false));
    const ribbon = new Ribbon(ribbonHost, {
      formatState: () => workspace.formatState(""),
      applyTableLayout: (action) => workspace.applyTableLayout(action),
    } as RibbonHost);
    workspace.onUi(() => ribbon.sync());
    const button = (selector: string) => ribbonHost.querySelector<HTMLButtonElement>(selector)!;
    try {
      button("[data-tab=table]").click();
      expect(ribbonHost.querySelector("[data-page=table]")?.hasAttribute("hidden")).toBe(false);
      expect(button("[data-table-tool=merge]").disabled).toBe(true);
      const oldWidths = [...table.columnWidths];
      const width = ribbonHost.querySelector<HTMLInputElement>("[data-table-dimension=width]")!;
      width.value = "3.00";
      width.dispatchEvent(new Event("change", { bubbles: true }));
      expect(table.columnWidths[0]).toBeCloseTo(113.386);
      expect(table.columnWidths[1]).toBeCloseTo(oldWidths[1]);
      workspace.history.undo();
      expect(table.columnWidths).toEqual(oldWidths);
      workspace.history.redo();
      expect(table.columnWidths[0]).toBeCloseTo(113.386);

      const align = button('[data-table-tool="align:right:bottom"]');
      align.click();
      expect(align.getAttribute("aria-pressed")).toBe("true");
      expect(cell.vAlign).toBe("bottom");
      expect(cell.document.paragraphs.head?.data.attrs.textAlign).toBe("right");
      workspace.history.undo();
      expect(align.getAttribute("aria-pressed")).toBe("false");
      workspace.history.redo();

      const more = button("[data-table-more] > [data-drop-toggle]");
      const sections = [...ribbonHost.querySelectorAll<HTMLButtonElement>("[data-table-more-section]")];
      const properties = sections.find((section) => section.textContent?.includes("表格属性"))!;
      const margins = sections.find((section) => section.textContent?.includes("单元格边距"))!;
      more.click();
      properties.click();
      expect(properties.getAttribute("aria-expanded")).toBe("true");
      margins.click();
      expect(properties.getAttribute("aria-expanded")).toBe("false");
      expect(margins.getAttribute("aria-expanded")).toBe("true");
      const marginForm = ribbonHost.querySelector<HTMLFormElement>('[data-table-form="margins"]')!;
      const left = marginForm.querySelector<HTMLInputElement>('[name="left"]')!;
      expect(Number(left.value)).toBeGreaterThan(0);
      left.value = "0.5";
      button('[data-table-more] [data-table-tool="margins"]').click();
      expect(table.cellMargin?.left).toBeCloseTo(0.5 * 96 / 2.54);
      expect(more.getAttribute("aria-expanded")).toBe("false");

      button("[data-table-tool=repeat-header]").click();
      expect(table.rows.map((row) => row.header)).toEqual([true, false, false]);
      more.click();
      const grid = button("[data-table-more] [data-table-tool=gridlines]");
      grid.click();
      expect(grid.getAttribute("aria-pressed")).toBe("true");

      const { default: JSZip } = await import("jszip");
      const archive = await JSZip.loadAsync(await workspace.exportDocx());
      const xml = await archive.file("word/document.xml")!.async("string");
      expect(xml).toContain("<w:tblHeader");
      expect(xml).toContain('<w:vAlign w:val="bottom"');
      expect(xml).toContain('<w:jc w:val="right"');
      workspace.history.undo();
      expect(table.rows[0].header).toBe(false);
    } finally {
      ribbon.destroy();
      workspace.dispose();
      host.remove();
      ribbonHost.remove();
      canvas.mockRestore();
    }
  });

  it("拆分普通单元格、合并保留文字，拆分表格和转换文本可撤销", () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    document.body.append(host);
    const workspace = new Workspace(host);
    try {
      workspace.load(emptyDoc());
      workspace.insertTable(3, 2);
      const doc = workspace.bodyDocument()!;
      const table = doc.paragraphs.toArray().find((p) => p.table)!.table!;
      const first = table.rows[0].cells[0];
      const second = table.rows[0].cells[1];
      const select = (cell: typeof first) => {
        workspace.selection.collapse(new CaretPos({ slot: "cell", cell }, cell.document.words.head, false));
      };
      select(first);
      workspace.history.do(new InsertCommand(workspace, "甲"));
      select(second);
      workspace.history.do(new InsertCommand(workspace, "乙"));
      workspace.applyTableLayout({ type: "select", scope: "row" });
      workspace.applyTableLayout({ type: "merge" });
      expect(first.document.paragraphText()).toEqual(["甲", "乙"]);
      workspace.history.undo();
      expect(first.document.paragraphText()).toEqual(["甲"]);
      expect(second.document.paragraphText()).toEqual(["乙"]);
      workspace.history.redo();
      expect(first.document.paragraphText()).toEqual(["甲", "乙"]);
      workspace.history.undo();

      select(first);
      workspace.applyTableLayout({ type: "split-selection", rows: 2, columns: 2 });
      expect(table.rows).toHaveLength(4);
      expect(table.columnWidths).toHaveLength(3);
      expect(second.rowSpan).toBe(2);
      expect(table.rows[2].cells[0].colSpan).toBe(2);
      workspace.history.undo();
      expect(table.rows).toHaveLength(3);
      expect(table.columnWidths).toHaveLength(2);
      expect(second.rowSpan).toBe(1);

      const last = table.rows[2].cells[0];
      select(last);
      workspace.applyTableLayout({ type: "split-table" });
      let tables = doc.paragraphs.toArray().flatMap((p) => p.table ? [p.table] : []);
      expect(tables.map((t) => t.rows.length)).toEqual([2, 1]);
      expect(last.rowIndex).toBe(0);
      workspace.history.undo();
      expect(last.rowIndex).toBe(2);
      tables = doc.paragraphs.toArray().flatMap((p) => p.table ? [p.table] : []);
      expect(tables).toHaveLength(1);
      workspace.history.redo();
      expect(last.rowIndex).toBe(0);
      workspace.history.undo();

      select(first);
      workspace.applyTableLayout({ type: "convert", separator: "\t" });
      expect(doc.paragraphs.toArray().some((p) => p.isTable)).toBe(false);
      expect(doc.paragraphText()).toContain("甲\t乙");
      workspace.history.undo();
      expect(doc.paragraphs.toArray().some((p) => p.table === table)).toBe(true);
    } finally {
      workspace.dispose();
      host.remove();
      canvas.mockRestore();
    }
  });

  it("绘制和擦除分隔线修改单元格网格，文字方向和公式保存后可以继续编辑", async () => {
    const canvas = stubCanvas2d();
    const host = document.createElement("div");
    document.body.append(host);
    const workspace = new Workspace(host);
    const scroll = host.querySelector<HTMLElement>(".ho-word-scroll")!;
    Object.defineProperties(scroll, { clientWidth: { value: 900 }, clientHeight: { value: 700 } });
    scroll.getBoundingClientRect = () => DOMRect.fromRect({ width: 900, height: 700 });
    try {
      workspace.load(emptyDoc());
      workspace.insertTable(3, 2);
      const table = workspace.bodyDocument()!.paragraphs.toArray().find((p) => p.table)!.table!;
      const cell = table.rows[0].cells[0];
      const select = (target: typeof cell) => workspace.selection.collapse(new CaretPos(
        { slot: "cell", cell: target }, target.document.words.head, false,
      ));
      const pointer = (type: string, x: number, y: number) => {
        const css = workspace.viewport.worldToCss(x, y);
        scroll.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: css.x, clientY: css.y }));
      };
      select(cell);
      const box = workspace.hitTester.cellBoxes(cell, workspace.hitContext())[0];
      const middle = box.x + box.width / 2;
      workspace.applyTableLayout({ type: "draw-table" });
      pointer("pointerdown", middle, box.y + 2);
      pointer("pointermove", middle, box.y + box.height - 2);
      pointer("pointerup", middle, box.y + box.height - 2);
      expect(table.rows[0].cells).toHaveLength(3);
      workspace.applyTableLayout({ type: "erase-table" });
      pointer("pointerdown", middle, box.y + box.height / 2);
      expect(table.rows[0].cells).toHaveLength(2);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(workspace.formatState("").tableLayout?.drawing).toBeUndefined();
      workspace.history.undo();
      expect(table.rows[0].cells).toHaveLength(3);
      workspace.history.undo();
      expect(table.rows[0].cells).toHaveLength(2);

      select(cell);
      workspace.history.do(new InsertCommand(workspace, "12"));
      select(table.rows[1].cells[0]);
      workspace.history.do(new InsertCommand(workspace, "18"));
      const total = table.rows[2].cells[0];
      select(total);
      workspace.applyTableLayout({ type: "formula", operation: "SUM", direction: "ABOVE" });
      expect(total.document.paragraphText()).toEqual(["30"]);
      expect(total.document.words.head?.data.char).toBe("30");
      workspace.history.undo();
      expect(total.document.paragraphText()).toEqual([""]);
      workspace.history.redo();

      const direction = table.rows[0].cells[1];
      select(direction);
      workspace.history.do(new InsertCommand(workspace, "竖排文字"));
      workspace.applyTableLayout({ type: "direction", vertical: true });
      expect(direction.textDirection).toBe("tbRlV");
      const ctx = workspace.hitContext();
      const { x, y, width, height } = workspace.hitTester.wordBox(
        new CaretPos({ slot: "cell", cell: direction }, direction.document.words.head, false), ctx,
      )!;
      const hit = workspace.hitTester.hit(x + width / 2, y + height / 4, ctx);
      expect(hit?.story).toEqual({ slot: "cell", cell: direction });
      expect(hit?.node?.data.char).toBe("竖");
      expect(workspace.caretWorld()?.height).toBe(1);

      const reopened = await new DocxReader().read(await workspace.exportDocx());
      const reopenedTable = reopened.paragraphs.toArray().find((p) => p.table)!.table!;
      expect(reopenedTable.rows[0].cells[1].textDirection).toBe("tbRlV");
      expect(reopenedTable.rows[2].cells[0].document.paragraphs.head?.data.blocks[0]).toMatchObject({
        text: "30", field: "FORMULA", fieldInstr: "=SUM(ABOVE)",
      });
      workspace.history.undo();
      expect(direction.textDirection).toBeUndefined();
    } finally {
      workspace.dispose();
      host.remove();
      canvas.mockRestore();
    }
  });

  it("点击和右键表格左上角控点后，工具栏与右键菜单均可操作整张表", () => {
    const spy = stubCanvas2d();
    const host = document.createElement("div");
    const ribbonHost = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 900, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 700, configurable: true });
    document.body.append(ribbonHost, host);

    const workspace = new Workspace(host);
    workspace.load(emptyDoc());
    workspace.insertTable(2, 2);
    const ribbon = new Ribbon(ribbonHost, {
      formatState: () => workspace.formatState(""),
    } as RibbonHost);
    const detachRibbon = workspace.onUi((revealTableLayout) => ribbon.sync(revealTableLayout));
    const tablePanel = ribbonHost.querySelector<HTMLElement>("[data-page=table]")!;

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

    const clickHandle = () => {
      scroll.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX, clientY, pointerId: 1 }));
      scroll.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX, clientY, pointerId: 1 }));
    };
    expect(tablePanel.hidden).toBe(true);
    clickHandle();
    expect(tablePanel.hidden).toBe(false);
    expect(workspace.selection.flow).not.toBeNull();
    expect(workspace.formatState("").inTable).toBe(true);
    expect(workspace.tableMenuState()).toEqual({
      canMerge: true,
      canSplit: false,
      canDeleteRow: true,
      canDeleteCol: true,
    });
    expect(ribbonHost.querySelector<HTMLButtonElement>("[data-table-tool=merge]")?.disabled).toBe(false);

    ribbonHost.querySelector<HTMLButtonElement>("[data-tab=home]")!.click();
    workspace.onSelectionChange();
    expect(tablePanel.hidden).toBe(true);
    clickHandle();
    expect(tablePanel.hidden).toBe(false);

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
    expect(tablePanel.hidden).toBe(true);

    workspace.history.undo();
    expect(doc.paragraphs.toArray().some((item) => item.isTable)).toBe(true);

    detachRibbon();
    ribbon.destroy();
    ribbonHost.remove();
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
