import { describe, expect, it } from "vitest";
import { HyperlinkCommand } from "../../src/edit/HyperlinkCommand";
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

describe("超链接命令", () => {
  it("选中文字套上链接，撤销后还原", () => {
    const { document, selection } = doc("官网");
    const history = new History();
    history.do(new HyperlinkCommand(context(document, selection), { url: "https://example.com" }));
    expect(document.paragraphs.toArray()[0].blocks[0].link?.url).toBe("https://example.com");
    expect(document.paragraphs.toArray()[0].blocks[0].style.color).toBe("#0563C1");
    history.undo();
    expect(document.paragraphs.toArray()[0].blocks[0].link).toBeUndefined();
    expect(document.paragraphText()[0]).toBe("官网");
  });

  it("没有选区时插入链接文字", () => {
    const { document, selection } = doc("");
    selection.collapse(new CaretPos(body, document.words.head, false));
    const history = new History();
    history.do(new HyperlinkCommand(context(document, selection), { anchor: "结论" }));
    expect(document.paragraphText()[0]).toBe("#结论");
    expect(document.paragraphs.toArray()[0].blocks.some((block) => block.link?.anchor === "结论")).toBe(true);
    history.undo();
    expect(document.paragraphText()[0]).toBe("");
  });
});

function doc(text: string): { document: Document; selection: Selection } {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  const selection = new Selection();
  const head = document.words.head;
  const tail = document.words.tail;
  if (head && tail && text) {
    selection.setRange(new SelRange(body, new CaretPos(body, head, false), new CaretPos(body, tail, true)));
  } else if (head) {
    selection.collapse(new CaretPos(body, head, false));
  }
  return { document, selection };
}

function context(document: Document, selection: Selection): EditContext {
  return {
    mutator: new Mutator(),
    relayout: { apply: () => false } as unknown as Relayout,
    selection,
    documentOf: () => document,
    afterEdit: () => undefined,
  };
}
