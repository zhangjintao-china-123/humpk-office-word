import { describe, expect, it } from "vitest";
import { History } from "../../src/edit/History";
import { InsertCommand } from "../../src/edit/InsertCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { Mutator } from "../../src/edit/Mutator";
import { OutlineCommand } from "../../src/edit/OutlineCommand";
import {
  activeMultilevelPresetId,
  bulletGlyphOf,
  currentListPreview,
  documentBullets,
  documentNumberings,
  numberingPresetOf,
} from "../../src/edit/OutlineNumbering";
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

function story(...texts: string[]): Document {
  const document = new Document();
  texts.forEach((text, index) => {
    const paragraph = new Paragraph(index + 1);
    const block = new Block();
    block.text = text;
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
  });
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
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

function labels(document: Document): string[] {
  return document.paragraphs.toArray().map((paragraph) => paragraph.attrs.titleSerial?.label ?? "");
}

describe("套用大纲和改级别", () => {
  it("套用后按顺序编号，降一级变成 1.1，撤销后恢复", () => {
    const document = story("总则", "范围", "职责");
    const selection = new Selection();
    const head = document.words.head!;
    let tail = head;
    while (tail.next) {
      tail = tail.next;
    }
    selection.setRange(new SelRange(body, new CaretPos(body, head, false), new CaretPos(body, tail, true)));
    const context = ctx(document, selection);
    const history = new History();
    history.do(new OutlineCommand(context, { type: "apply" }));
    expect(labels(document)).toEqual(["1 ", "2 ", "3 "]);

    const rangeWord = document.paragraphs.toArray()[1];
    let node = document.words.head;
    while (node && node.data.paragraph !== rangeWord) {
      node = node.next;
    }
    selection.collapse(new CaretPos(body, node, false));
    history.do(new OutlineCommand(context, { type: "demote" }));
    expect(labels(document)).toEqual(["1 ", "1.1 ", "2 "]);
    expect(rangeWord.attrs.ilvl).toBe("1");
    expect(rangeWord.attrs.leftTwip).toBe(840);

    history.undo();
    expect(labels(document)).toEqual(["1 ", "2 ", "3 "]);
    history.undo();
    expect(labels(document)).toEqual(["", "", ""]);
    expect(document.paragraphs.head!.data.attrs.numId).toBeUndefined();
  });

  it("回车后下一段接着编号，再撤销回到一段", () => {
    const document = story("总则");
    const selection = new Selection();
    const head = document.words.head!;
    selection.collapse(new CaretPos(body, head, true));
    const context = ctx(document, selection);
    const history = new History();
    history.do(new OutlineCommand(context, { type: "apply" }));
    history.do(new InsertCommand(context, "\n"));
    expect(labels(document)).toEqual(["1 ", "2 "]);
    history.undo();
    expect(document.paragraphs.toArray()).toHaveLength(1);
    expect(labels(document)).toEqual(["1 "]);
  });

  it("直接指定 3 级", () => {
    const document = story("条款");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    new OutlineCommand(ctx(document, selection), { type: "level", ilvl: 2 }).do();
    expect(labels(document)).toEqual(["1.1.1 "]);
    expect(document.paragraphs.head!.data.attrs.ilvl).toBe("2");
  });

  it("流式选区套用项目符号与开关切换，降级循环符号且支持撤销", () => {
    const document = story("第一项", "第二项", "第三项");
    const selection = new Selection();
    selection.setFlow(new CaretPos(body, document.words.head, false), new CaretPos(body, document.words.tail, false));
    const context: EditContext = {
      ...ctx(document, selection),
      flowOwner: () => ({ document, story: body }),
    };
    const history = new History();
    history.do(new OutlineCommand(context, { type: "toggleBullet" }));
    expect(labels(document)).toEqual(["● ", "● ", "● "]);
    expect(bulletGlyphOf(document.numbering, document.paragraphs.head!.data)).toBe("●");

    // 仅对第二段降级并切换符号，应保持缩进层级并更换当前级符号
    const second = document.paragraphs.toArray()[1];
    let secondNode = document.words.head;
    while (secondNode && secondNode.data.paragraph !== second) {
      secondNode = secondNode.next;
    }
    selection.collapse(new CaretPos(body, secondNode, false));
    history.do(new OutlineCommand(context, { type: "demote" }));
    expect(labels(document)).toEqual(["● ", "○ ", "● "]);
    expect(second.attrs.ilvl).toBe("1");
    expect(second.attrs.leftTwip).toBe(840);

    history.do(new OutlineCommand(context, { type: "bullet", symbol: "✓" }));
    expect(labels(document)).toEqual(["● ", "✓ ", "● "]);
    expect(second.attrs.ilvl).toBe("1");

    // 再次全选 toggleBullet 应清除全部项目符号
    selection.setFlow(new CaretPos(body, document.words.head, false), new CaretPos(body, document.words.tail, false));
    history.do(new OutlineCommand(context, { type: "toggleBullet" }));
    expect(labels(document)).toEqual(["", "", ""]);
    expect(document.paragraphs.toArray().every((p) => !p.attrs.numId)).toBe(true);

    history.undo();
    expect(labels(document)).toEqual(["● ", "✓ ", "● "]);
  });

  it("文档项目符号列表会去重并归一化私有区符号", () => {
    const document = story("甲", "乙");
    document.numbering.setLevel("1", "0", { start: 1, numFmt: "bullet", lvlText: "\uF0A7", font: "Wingdings", ilvl: 0 });
    document.numbering.setLevel("2", "0", { start: 1, numFmt: "bullet", lvlText: "●", ilvl: 0 });
    const paras = document.paragraphs.toArray();
    paras[0].attrs = { numId: "1", ilvl: "0" };
    paras[1].attrs = { numId: "2", ilvl: "0" };
    expect(documentBullets(document.numbering, document)).toEqual(["▪", "●"]);
  });

  it("流式选区套用预设编号、升降级循环编号、自定义起始编号并支持开关切换", () => {
    const document = story("第一条", "第二条", "第三条");
    const selection = new Selection();
    selection.setFlow(new CaretPos(body, document.words.head, false), new CaretPos(body, document.words.tail, false));
    const context: EditContext = {
      ...ctx(document, selection),
      flowOwner: () => ({ document, story: body }),
    };
    const history = new History();
    history.do(new OutlineCommand(context, { type: "toggleNumbering" }));
    expect(labels(document)).toEqual(["1. ", "2. ", "3. "]);
    expect(numberingPresetOf(document.numbering, document.paragraphs.head!.data)).toEqual({
      numFmt: "decimal",
      lvlText: "%1.",
      start: 1,
    });

    // 切到中文顿号 一、二、三、
    history.do(new OutlineCommand(context, { type: "numbering", numFmt: "chineseCounting", lvlText: "%1、", start: 1 }));
    expect(labels(document)).toEqual(["一、 ", "二、 ", "三、 "]);
    expect(documentNumberings(document.numbering, document)).toContainEqual({
      numFmt: "chineseCounting",
      lvlText: "%1、",
      start: 1,
    });

    // 第二段降一级，再切为自定义大写字母起始 2 -> B.
    const second = document.paragraphs.toArray()[1];
    let secondNode = document.words.head;
    while (secondNode && secondNode.data.paragraph !== second) {
      secondNode = secondNode.next;
    }
    selection.collapse(new CaretPos(body, secondNode, false));
    history.do(new OutlineCommand(context, { type: "demote" }));
    expect(labels(document)).toEqual(["一、 ", "a) ", "二、 "]);
    expect(second.attrs.ilvl).toBe("1");

    history.do(new OutlineCommand(context, { type: "numbering", numFmt: "upperLetter", lvlText: "%1.", start: 2 }));
    expect(labels(document)).toEqual(["一、 ", "B. ", "二、 "]);

    // 再次全选 toggleNumbering 清除编号
    selection.setFlow(new CaretPos(body, document.words.head, false), new CaretPos(body, document.words.tail, false));
    history.do(new OutlineCommand(context, { type: "toggleNumbering" }));
    expect(labels(document)).toEqual(["", "", ""]);

    history.undo();
    expect(labels(document)).toEqual(["一、 ", "B. ", "二、 "]);
  });

  it("多级列表支持预设库、关联标题自动编号、当前列表预览与撤销", () => {
    const document = story("引言", "子节", "细分");
    const paras = document.paragraphs.toArray();
    paras[0].attrs = { styleId: "Heading1", outlineLevel: 1 };
    paras[1].attrs = { styleId: "Heading2", outlineLevel: 2 };
    paras[2].attrs = { styleId: "Heading3", outlineLevel: 3 };

    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const history = new History();
    const context = ctx(document, selection);

    // 选「第 I 条 标题 1 / 节 1.01 标题 2 / (a) 标题 3」会联动全文所有标题段落
    history.do(new OutlineCommand(context, { type: "multilevel", presetId: "article-heading" }));
    expect(labels(document)).toEqual(["第 I 条 ", "节 1.01 ", "(a) "]);
    expect(activeMultilevelPresetId(document.numbering, paras[0])).toBe("article-heading");
    expect(currentListPreview(document.numbering, paras[0])?.map((r) => r.label)).toEqual([
      "第 I 条",
      "节 1.01",
      "(a)",
    ]);

    // 切换到「第一章 标题 1 / 标题 2 / 标题 3」
    history.do(new OutlineCommand(context, { type: "multilevel", presetId: "chapter-heading" }));
    expect(labels(document)).toEqual(["第一章 ", "", ""]);

    // 撤销两次恢复初始无编号状态
    history.undo();
    expect(labels(document)).toEqual(["第 I 条 ", "节 1.01 ", "(a) "]);
    history.undo();
    expect(labels(document)).toEqual(["", "", ""]);
  });
});