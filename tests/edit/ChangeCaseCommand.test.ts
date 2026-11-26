import { describe, expect, it } from "vitest";
import { ChangeCaseCommand, transformCaseText } from "../../src/edit/ChangeCaseCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import { SelRange } from "../../src/selection/SelRange";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

function buildDoc(runs: Array<{ text: string; bold?: boolean }>): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  for (const run of runs) {
    const block = new Block();
    block.text = run.text;
    if (run.bold) {
      block.style = { bold: true, color: "#C00000" };
    }
    paragraph.addBlock(block);
  }
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

describe("transformCaseText", () => {
  it("支持句首字母大写、小写、大写、每个单词首字母大写、切换大小写、半角和全角", () => {
    expect(transformCaseText("hELLO wORLD. tHIS is 3.14 TEST! 下一句。next", "sentence")).toBe(
      "Hello world. This is 3.14 test! 下一句。Next",
    );
    expect(transformCaseText("Hello WORLD", "lower")).toBe("hello world");
    expect(transformCaseText("Hello World", "upper")).toBe("HELLO WORLD");
    expect(transformCaseText("hello world don't foo-bar 中文abc", "title")).toBe(
      "Hello World Don't Foo-Bar 中文Abc",
    );
    expect(transformCaseText("AbC dEf", "toggle")).toBe("aBc DeF");
    expect(transformCaseText("ＡＢＣ１２３　！＠＃，。", "halfwidth")).toBe("ABC123 !@#,。");
    expect(transformCaseText("ABC123 !@#,。", "fullwidth")).toBe("ＡＢＣ１２３　！＠＃，。");
  });
});

describe("ChangeCaseCommand", () => {
  it("选中局部文字转换大小写时保留各自 run 样式并支持撤销重做", () => {
    const document = buildDoc([
      { text: "hello ", bold: false },
      { text: "world", bold: true },
    ]);
    const selection = new Selection();
    const nodes: NonNullable<typeof document.words.head>[] = [];
    let cursor = document.words.head;
    while (cursor) {
      nodes.push(cursor);
      cursor = cursor.next;
    }
    // 选中 "lo wo"
    selection.setRange(new SelRange(body, new CaretPos(body, nodes[3], false), new CaretPos(body, nodes[7], true)));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new ChangeCaseCommand(ctx, "upper"));

    const para = document.paragraphs.head!.data;
    expect(para.getFullText()).toBe("helLO WOrld");
    expect(para.blocks[0].text).toBe("helLO ");
    expect(para.blocks[1].text).toBe("WOrld");
    expect(para.blocks[1].style.bold).toBe(true);
    expect(para.blocks[1].style.color).toBe("#C00000");

    history.undo();
    expect(para.getFullText()).toBe("hello world");
    expect(para.blocks[1].text).toBe("world");

    history.redo();
    expect(para.getFullText()).toBe("helLO WOrld");
  });

  it("句首字母大写在段内选区时能正确判断上下文，不会把句中选区误当句首", () => {
    const document = buildDoc([{ text: "hello WORLD" }]);
    const selection = new Selection();
    const nodes: NonNullable<typeof document.words.head>[] = [];
    let cursor = document.words.head;
    while (cursor) {
      nodes.push(cursor);
      cursor = cursor.next;
    }
    // 仅选中 "WORLD"
    selection.setRange(new SelRange(body, new CaretPos(body, nodes[6], false), new CaretPos(body, nodes[10], true)));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    new ChangeCaseCommand(ctx, "sentence").do();
    expect(document.paragraphs.head!.data.getFullText()).toBe("hello world");
  });

  it("折叠光标时自动扩展到当前单词并支持半角全角互转", () => {
    const document = buildDoc([{ text: "hello ＡＢＣ" }]);
    const selection = new Selection();
    const nodes: NonNullable<typeof document.words.head>[] = [];
    let cursor = document.words.head;
    while (cursor) {
      nodes.push(cursor);
      cursor = cursor.next;
    }
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();

    // 光标落在 "hello" 中间 -> 每个单词首字母大写
    selection.collapse(new CaretPos(body, nodes[2], false));
    history.do(new ChangeCaseCommand(ctx, "title"));
    expect(document.paragraphs.head!.data.getFullText()).toBe("Hello ＡＢＣ");

    // 光标落在 "ＡＢＣ" 后 -> 转半角
    selection.collapse(new CaretPos(body, nodes[8], true));
    history.do(new ChangeCaseCommand(ctx, "halfwidth"));
    expect(document.paragraphs.head!.data.getFullText()).toBe("Hello ABC");

    history.undo();
    expect(document.paragraphs.head!.data.getFullText()).toBe("Hello ＡＢＣ");
  });
});
