import { describe, expect, it } from "vitest";
import { EnclosedCommand, inspectEnclosed } from "../../src/edit/EnclosedCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { parseEnclosedInstruction } from "../../src/model/inline/EnclosedChar";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import { SelRange } from "../../src/selection/SelRange";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

function buildDoc(text: string, bold = false): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  if (bold) {
    block.style = { bold: true, color: "#C00000" };
  }
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

describe("parseEnclosedInstruction", () => {
  it("解析 Word 标准 EQ \\o\\ac 域指令并识别形状与模式", () => {
    expect(parseEnclosedInstruction("eq \\o\\ac(○,字)", 21, 10.5)).toEqual({
      text: "字",
      spec: { shape: "circle", mode: "enlarge", symbol: "○" },
    });
    expect(parseEnclosedInstruction("EQ \\o\\ac(\\s\\do 1(□),12)")).toEqual({
      text: "12",
      spec: { shape: "square", mode: "enlarge", symbol: "□" },
    });
    expect(parseEnclosedInstruction("eq \\o\\ac(△,甲)", 11, 8)).toEqual({
      text: "甲",
      spec: { shape: "triangle", mode: "shrink", symbol: "△" },
    });
    expect(parseEnclosedInstruction("eq \\o(◇,乙)")).toEqual({
      text: "乙",
      spec: { shape: "diamond", mode: "shrink", symbol: "◇" },
    });
  });
});

describe("EnclosedCommand", () => {
  it("选中多个字符应用带圈字符，保留原有样式，支持取消圈号及 undo/redo", () => {
    const document = buildDoc("123", true);
    const selection = new Selection();
    const nodes: NonNullable<typeof document.words.head>[] = [];
    let cursor = document.words.head;
    while (cursor) {
      nodes.push(cursor);
      cursor = cursor.next;
    }
    // 选中 "12"
    selection.setRange(new SelRange(body, new CaretPos(body, nodes[0], false), new CaretPos(body, nodes[1], true)));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };

    const inspected = inspectEnclosed(ctx);
    expect(inspected.text).toBe("12");
    expect(inspected.active).toBe(false);

    const history = new History();
    history.do(new EnclosedCommand(ctx, { type: "apply", text: "12", shape: "circle", mode: "shrink" }));

    const words = document.words.toArray();
    expect(words[0].char).toBe("12");
    expect(words[0].block?.enclosed).toEqual({ shape: "circle", mode: "shrink", symbol: "○" });
    expect(words[0].block?.style.bold).toBe(true);
    expect(words[0].block?.style.color).toBe("#C00000");
    expect(words[1].char).toBe("3");
    expect(words[1].block?.enclosed).toBeUndefined();

    // 在折叠光标处 inspectEnclosed 应检测到当前带圈状态
    const afterInspect = inspectEnclosed(ctx);
    expect(afterInspect.active).toBe(true);
    expect(afterInspect.text).toBe("12");
    expect(afterInspect.shape).toBe("circle");

    // 取消带圈后还原为普通字符 "12"
    history.do(new EnclosedCommand(ctx, { type: "remove" }));
    expect(document.paragraphs.head!.data.getFullText()).toBe("123");
    expect(document.words.head!.data.block?.enclosed).toBeUndefined();

    history.undo();
    expect(document.words.head!.data.char).toBe("12");
    expect(document.words.head!.data.block?.enclosed?.shape).toBe("circle");

    history.undo();
    expect(document.paragraphs.head!.data.getFullText()).toBe("123");
    expect(document.words.head!.data.char).toBe("1");
    expect(document.words.head!.data.block?.enclosed).toBeUndefined();

    history.redo();
    expect(document.words.head!.data.char).toBe("12");
    expect(document.words.head!.data.block?.enclosed?.shape).toBe("circle");
  });

  it("在带圈字符之后继续输入普通文字不会继承带圈属性", () => {
    const document = buildDoc("A");
    const selection = new Selection();
    const first = document.words.head!;
    selection.setRange(new SelRange(body, new CaretPos(body, first, false), new CaretPos(body, first, true)));
    const mutator = new Mutator();
    const ctx: EditContext = {
      mutator,
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };

    new EnclosedCommand(ctx, { type: "apply", text: "A", shape: "diamond", mode: "enlarge" }).do();
    const patch = mutator.insert(document, body, selection.caret()!, "B");
    expect(patch.caret.node?.data.char).toBe("B");
    expect(patch.caret.node?.data.block?.enclosed).toBeUndefined();
    expect(document.words.head!.data.block?.enclosed).toEqual({
      shape: "diamond",
      mode: "enlarge",
      symbol: "◇",
    });
  });
});
