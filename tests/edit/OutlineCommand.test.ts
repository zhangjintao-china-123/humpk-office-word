import { describe, expect, it } from "vitest";
import { History } from "../../src/edit/History";
import { InsertCommand } from "../../src/edit/InsertCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { Mutator } from "../../src/edit/Mutator";
import { OutlineCommand } from "../../src/edit/OutlineCommand";
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
});