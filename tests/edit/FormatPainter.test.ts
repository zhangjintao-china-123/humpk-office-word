import { describe, expect, it } from "vitest";
import { DeleteCommand } from "../../src/edit/DeleteCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { captureFormatSample, FormatPainterCommand } from "../../src/edit/FormatPainter";
import { History } from "../../src/edit/History";
import { InputController, type InputHost } from "../../src/edit/InputController";
import { Mutator } from "../../src/edit/Mutator";
import { OutlineCommand } from "../../src/edit/OutlineCommand";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import type { RunStyle } from "../../src/model/style/RunStyle";
import { CaretPos } from "../../src/selection/CaretPos";
import { HitTester } from "../../src/selection/HitTester";
import { Selection } from "../../src/selection/Selection";
import { SelRange } from "../../src/selection/SelRange";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

function buildDoc(items: Array<{ text: string; style?: RunStyle; attrs?: Paragraph["attrs"] }>): Document {
  const document = new Document();
  items.forEach((item, index) => {
    const paragraph = new Paragraph(index + 1);
    if (item.attrs) {
      paragraph.attrs = { ...item.attrs };
    }
    const block = new Block();
    block.text = item.text;
    if (item.style) {
      block.style = { ...item.style };
    }
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
  });
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function wordsOf(document: Document, paragraph: Paragraph) {
  const list = [];
  let node = document.words.head;
  while (node) {
    if (node.data.paragraph === paragraph) {
      list.push(node);
    }
    node = node.next;
  }
  return list;
}

describe("FormatPainter", () => {
  it("选区局部字符格式刷只覆盖字符样式，不改动目标段落对齐，且可撤销重做", () => {
    const document = buildDoc([
      {
        text: "abcd",
        style: { bold: true, italic: true, color: "#C00000", fontFamily: "黑体", fontSizePx: 20 },
        attrs: { textAlign: "left" },
      },
      {
        text: "wxyz",
        style: { underline: "single", backgroundColor: "#FFFF00" },
        attrs: { textAlign: "center", firstLineChars: 200 },
      },
    ]);
    const [p1, p2] = document.paragraphs.toArray();
    const w1 = wordsOf(document, p1);
    const w2 = wordsOf(document, p2);
    const selection = new Selection();
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };

    // 仅选中第一段前两个字符（非整段）
    selection.setRange(new SelRange(body, new CaretPos(body, w1[0], false), new CaretPos(body, w1[1], true)));
    const sample = captureFormatSample(ctx)!;
    expect(sample.includeParagraph).toBe(false);

    // 拖选第二段中的 "xy"
    selection.setRange(new SelRange(body, new CaretPos(body, w2[1], false), new CaretPos(body, w2[2], true)));
    const history = new History();
    history.do(new FormatPainterCommand(ctx, sample));

    // "xy" 获得源格式并清除了原有的下划线和突出显示；"w" 与 "z" 保持原样
    expect(w2[0].data.getStyle()?.underline).toBe("single");
    expect(w2[1].data.getStyle()?.bold).toBe(true);
    expect(w2[1].data.getStyle()?.italic).toBe(true);
    expect(w2[1].data.getStyle()?.color).toBe("#C00000");
    expect(w2[1].data.getStyle()?.underline).toBe("none");
    expect(w2[1].data.getStyle()?.backgroundColor).toBeUndefined();
    expect(w2[3].data.getStyle()?.underline).toBe("single");
    // 未覆盖段落格式
    expect(p2.attrs.textAlign).toBe("center");
    expect(p2.attrs.firstLineChars).toBe(200);

    history.undo();
    expect(w2[1].data.getStyle()?.bold).toBeFalsy();
    expect(w2[1].data.getStyle()?.underline).toBe("single");
    expect(w2[1].data.getStyle()?.backgroundColor).toBe("#FFFF00");

    history.redo();
    expect(w2[1].data.getStyle()?.bold).toBe(true);
    expect(w2[1].data.getStyle()?.color).toBe("#C00000");
  });

  it("折叠光标格式刷同时复制字符样式、段落格式与项目符号列表，并支持撤销", () => {
    const document = buildDoc([
      {
        text: "来源段落",
        style: { bold: true, color: "#1F4E79", fontSizePx: 22 },
        attrs: { textAlign: "right", line: "360", lineRule: "auto" },
      },
      {
        text: "目标段落",
        style: { italic: true },
        attrs: { textAlign: "left" },
      },
    ]);
    const [p1, p2] = document.paragraphs.toArray();
    const w1 = wordsOf(document, p1);
    const w2 = wordsOf(document, p2);
    const selection = new Selection();
    let pending: RunStyle | undefined;
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
      pendingRunStyle: () => pending,
      setPendingRunStyle: (style) => {
        pending = style;
      },
    };
    const history = new History();

    // 给第一段加上项目符号
    selection.collapse(new CaretPos(body, w1[0], false));
    history.do(new OutlineCommand(ctx, { type: "bullet", symbol: "■" }));
    expect(p1.attrs.titleSerial?.label).toBe("■ ");

    // 在第一段折叠光标采样
    const sample = captureFormatSample(ctx)!;
    expect(sample.includeParagraph).toBe(true);

    // 在第二段词内折叠点击应用
    selection.collapse(new CaretPos(body, w2[1], false));
    history.do(new FormatPainterCommand(ctx, sample));

    expect(w2[0].data.getStyle()?.bold).toBe(true);
    expect(w2[0].data.getStyle()?.italic).toBe(false);
    expect(w2[0].data.getStyle()?.color).toBe("#1F4E79");
    expect(p2.attrs.textAlign).toBe("right");
    expect(p2.attrs.line).toBe("360");
    expect(p2.attrs.numId).toBe(p1.attrs.numId);
    expect(p2.attrs.titleSerial?.label).toBe("■ ");
    expect(pending?.bold).toBe(true);

    // 撤销后第二段恢复原有样式与左对齐、无项目符号
    history.undo();
    expect(w2[0].data.getStyle()?.bold).toBeFalsy();
    expect(w2[0].data.getStyle()?.italic).toBe(true);
    expect(p2.attrs.textAlign).toBe("left");
    expect(p2.attrs.numId).toBeUndefined();
    expect(p2.attrs.titleSerial).toBeUndefined();
  });

  it("空段落也能接收字符与段落格式刷并支持撤销", () => {
    const document = buildDoc([
      {
        text: "标题",
        style: { bold: true, color: "#2E75B6", fontSizePx: 24 },
        attrs: { textAlign: "center" },
      },
      { text: "" },
    ]);
    const [p1, p2] = document.paragraphs.toArray();
    const w1 = wordsOf(document, p1);
    const w2 = wordsOf(document, p2);
    const selection = new Selection();
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };

    selection.collapse(new CaretPos(body, w1[0], false));
    const sample = captureFormatSample(ctx)!;
    selection.collapse(new CaretPos(body, w2[0], false));
    const history = new History();
    history.do(new FormatPainterCommand(ctx, sample));

    expect(p2.blocks[0].style.bold).toBe(true);
    expect(p2.blocks[0].style.color).toBe("#2E75B6");
    expect(p2.attrs.textAlign).toBe("center");

    history.undo();
    expect(p2.blocks[0].style.bold).toBeUndefined();
    expect(p2.attrs.textAlign).toBeUndefined();
  });

  it("InputController 支持 Ctrl+Shift+C / Ctrl+Shift+V 快捷键与 Esc 取消格式刷", () => {
    const document = buildDoc([{ text: "ab" }]);
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const calls: string[] = [];
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    let painterOn = true;
    const host: InputHost = {
      ...ctx,
      history,
      hitTester: new HitTester(),
      hitContext: () => ({ pageSetup: { contentHeight: 400 } as never, origins: [], body: undefined }),
      caretCss: () => null,
      caretWorld: () => null,
      requestSave: () => undefined,
      copy: () => {
        calls.push("copy");
      },
      cut: () => undefined,
      paste: () => {
        calls.push("paste");
      },
      deleteContent: (direction) => history.do(new DeleteCommand(ctx, direction)),
      copyFormat: () => calls.push("copyFormat"),
      pasteFormat: () => calls.push("pasteFormat"),
      cancelFormatPainter: () => {
        if (!painterOn) return false;
        painterOn = false;
        calls.push("cancel");
        return true;
      },
    };
    const input = new InputController(host);
    input.attach(globalThis.document.body);

    input.el.dispatchEvent(new KeyboardEvent("keydown", { key: "C", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    input.el.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    input.el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));

    expect(calls).toEqual(["copyFormat", "pasteFormat", "cancel"]);
    input.detach();
  });
});
