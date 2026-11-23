import { describe, expect, it } from "vitest";
import { findInStories, indexAtOrAfter, type FindQuery } from "../../src/edit/Find";
import { collectStories } from "../../src/edit/Find";
import { ReplaceCommand } from "../../src/edit/ReplaceCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Drawing } from "../../src/model/inline/Drawing";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableRow } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };
const loose: FindQuery = { text: "", matchCase: false };

describe("查找替换", () => {
  it("不区分大小写，并且不跨过换行", () => {
    const document = paragraphs(["Alpha", "beta"]);
    const stories = [{ story: body, document }];
    expect(findInStories(stories, { ...loose, text: "alpha" })).toHaveLength(1);
    expect(findInStories(stories, { text: "alpha", matchCase: true })).toHaveLength(0);
    expect(findInStories(stories, { ...loose, text: "ab" })).toHaveLength(0);
  });

  it("重叠的查找只取不重叠的命中", () => {
    const document = paragraphs(["aaaa"]);
    expect(findInStories([{ story: body, document }], { ...loose, text: "aa" })).toHaveLength(2);
  });

  it("单元格里的字也能找到", () => {
    const cellDocument = paragraphs(["格子"]);
    const cell = new TableCell(cellDocument);
    const table = new Table();
    const row = new TableRow();
    row.cells.push(cell);
    table.rows.push(row);
    const host = new Document();
    const paragraph = new Paragraph(1);
    paragraph.isTable = true;
    paragraph.table = table;
    host.addParagraph(paragraph);
    const hits = findInStories(collectStories([{ story: body, document: host }]), { ...loose, text: "格" });
    expect(hits).toHaveLength(1);
    expect(hits[0].story.slot).toBe("cell");
  });

  it("文本框里的字也能被找到", () => {
    const inner = paragraphs(["框内说明"]);
    const drawing = new Drawing();
    drawing.shape = { preset: "rect", insets: { left: 0, top: 0, right: 0, bottom: 0 }, text: inner };
    const block = new Block();
    block.drawing = drawing;
    const host = new Document();
    const paragraph = new Paragraph(9);
    paragraph.addBlock(block);
    host.addParagraph(paragraph);
    const hits = findInStories(collectStories([{ story: body, document: host }]), { ...loose, text: "说明" });
    expect(hits).toHaveLength(1);
    expect(hits[0].story.slot).toBe("textbox");
  });

  it("从光标之后开始，到末尾后回到开头", () => {
    const document = paragraphs(["ab ab"]);
    const hits = findInStories([{ story: body, document }], { ...loose, text: "ab" });
    const caret = new CaretPos(body, hits[0].end, true);
    expect(indexAtOrAfter(hits, caret, [body])).toBe(1);
    const atEnd = new CaretPos(body, hits[1].end, true);
    expect(indexAtOrAfter(hits, atEnd, [body])).toBe(0);
  });

  it("替换当前命中并可以整批撤销", () => {
    const document = paragraphs(["cat and cat"]);
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const history = new History();
    const hits = findInStories([{ story: body, document }], { ...loose, text: "cat" });
    history.do(new ReplaceCommand(context(document, selection), [hits[0]], "dog"));
    expect(document.paragraphText()[0]).toBe("dog and cat");
    history.do(new ReplaceCommand(context(document, selection), findInStories([{ story: body, document }], { ...loose, text: "cat" }), "dog"));
    expect(document.paragraphText()[0]).toBe("dog and dog");
    history.undo();
    expect(document.paragraphText()[0]).toBe("dog and cat");
    history.undo();
    expect(document.paragraphText()[0]).toBe("cat and cat");
  });

  it("全部替换一次撤销", () => {
    const document = paragraphs(["aa aa"]);
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const history = new History();
    const hits = findInStories([{ story: body, document }], { ...loose, text: "aa" });
    history.do(new ReplaceCommand(context(document, selection), hits, "b"));
    expect(document.paragraphText()[0]).toBe("b b");
    history.undo();
    expect(document.paragraphText()[0]).toBe("aa aa");
  });
});

function paragraphs(texts: string[]): Document {
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

function context(document: Document, selection: Selection): EditContext {
  return {
    mutator: new Mutator(),
    relayout: { apply: () => false } as unknown as Relayout,
    selection,
    documentOf: () => document,
    afterEdit: () => undefined,
  };
}
