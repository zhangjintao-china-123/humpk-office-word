import { describe, expect, it } from "vitest";
import { InsertObjectCommand } from "../../src/edit/InsertObjectCommand";
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
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

function doc(text: string): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
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

describe("InsertObjectCommand", () => {
  it("分页符插在字中间，后面再打字不会变成另一个分页符", () => {
    const document = doc("ab");
    const selection = new Selection();
    const a = document.words.head!;
    selection.collapse(new CaretPos(body, a, true));
    const history = new History();
    history.do(new InsertObjectCommand(ctx(document, selection), { type: "pageBreak" }));
    const page = a.next!;
    expect(page.data.kind).toBe("page");
    expect(page.data.block?.charType).toBe("page");
    expect(document.paragraphs.head!.data.blocks.some((block) => block.charType === "page")).toBe(true);
    history.do(new InsertObjectCommand(ctx(document, selection), { type: "pageBreak" }));
    const mutator = new Mutator();
    mutator.insert(document, body, selection.caret()!, "x");
    const blocks = document.paragraphs.head!.data.blocks;
    const text = blocks.filter((block) => block.charType !== "page").map((block) => block.text);
    expect(text.join("")).toBe("axb");
    expect(blocks.filter((block) => block.charType === "page")).toHaveLength(2);
    expect(blocks.find((block) => block.text.includes("x"))?.charType).toBeUndefined();
  });

  it("分页符可以撤销", () => {
    const document = doc("ab");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head!, true));
    const history = new History();
    history.do(new InsertObjectCommand(ctx(document, selection), { type: "pageBreak" }));
    history.undo();
    expect(document.paragraphs.head!.data.blocks.some((block) => block.charType === "page")).toBe(false);
    expect(document.paragraphs.head!.data.getFullText()).toBe("ab");
  });

  it("插入 2×2 表格，撤销后回到原来的段落", () => {
    const document = doc("ab");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head!, true));
    const history = new History();
    history.do(new InsertObjectCommand(ctx(document, selection), { type: "table", rows: 2, cols: 2 }));
    const tablePara = document.paragraphs.head!.next!.data;
    expect(tablePara.isTable).toBe(true);
    expect(tablePara.table?.rows).toHaveLength(2);
    expect(tablePara.table?.rows[0]?.cells).toHaveLength(2);
    expect(tablePara.table?.borders?.insideV?.type).toBe("single");
    expect(selection.caret()?.story.slot).toBe("cell");
    history.undo();
    expect(document.paragraphs.length).toBe(1);
    expect(document.paragraphs.head!.data.getFullText()).toBe("ab");
  });
});
