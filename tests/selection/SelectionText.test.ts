import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { TableCell } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelRange } from "../../src/selection/SelRange";
import { Selection } from "../../src/selection/Selection";
import { SelectionText } from "../../src/selection/SelectionText";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };
const text = new SelectionText();

function doc(value: string): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = value;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function docParas(...values: string[]): Document {
  const document = new Document();
  values.forEach((value, index) => {
    const paragraph = new Paragraph(index + 1);
    const block = new Block();
    block.text = value;
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
  });
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function cell(value: string, row: number, col: number): TableCell {
  const next = new TableCell(doc(value));
  next.rowIndex = row;
  next.colIndex = col;
  return next;
}

function selectAll(document: Document, story: StoryRef = body): Selection {
  const selection = new Selection();
  const start = new CaretPos(story, document.words.head, false);
  const end = new CaretPos(story, document.words.tail, true);
  selection.setRange(new SelRange(story, start, end));
  return selection;
}

describe("SelectionText", () => {
  it("抽出文本选区，跳过折叠光标", () => {
    const document = doc("abcd");
    const selection = new Selection();
    const start = new CaretPos(body, document.words.head, false);
    const end = new CaretPos(body, document.words.head!.next!.next, true);
    selection.setRange(new SelRange(body, start, end));
    expect(text.extract(selection)).toBe("abc");
    selection.collapse(start);
    expect(text.extract(selection)).toBe("");
    expect(text.hasCopyableContent(selection)).toBe(false);
  });

  it("整格选中视为可复制，内容不含末段段落标记", () => {
    const item = cell("hello", 0, 0);
    const story: StoryRef = { slot: "cell", cell: item };
    const selection = new Selection();
    const pos = new CaretPos(story, item.document.words.head, false);
    selection.setRange(new SelRange(story, pos, pos, "cell"));
    expect(text.hasCopyableContent(selection)).toBe(true);
    expect(text.extract(selection)).toBe("hello");
    expect(text.extractRange(text.cellContentRange(item))).toBe("hello");
    expect(text.cellContentRange(item).collapsed()).toBe(false);
  });

  it("空格 cellContentRange 折叠，多段格保留中间换行", () => {
    const empty = cell("", 0, 0);
    expect(text.cellContentRange(empty).collapsed()).toBe(true);
    expect(text.extractCell(empty)).toBe("");

    const multi = new TableCell(docParas("hello", "world"));
    multi.rowIndex = 0;
    multi.colIndex = 0;
    expect(text.extractCell(multi)).toBe("hello\nworld");
  });

  it("多格按行列排成 TSV", () => {
    const a = cell("a", 0, 0);
    const b = cell("b", 0, 1);
    const c = cell("c", 1, 0);
    const selection = new Selection();
    for (const item of [c, b, a]) {
      const story: StoryRef = { slot: "cell", cell: item };
      const pos = new CaretPos(story, item.document.words.head, false);
      selection.addRange(new SelRange(story, pos, pos, "cell"));
    }
    expect(text.extract(selection)).toBe("a\tb\nc");
  });

  it("covers：文本落在选区内，整格命中同格", () => {
    const document = doc("abcd");
    const selection = selectAll(document);
    const inside = new CaretPos(body, document.words.head!.next, false);
    const outsideStory: StoryRef = { slot: "header" };
    expect(text.covers(selection, inside)).toBe(true);
    expect(text.covers(selection, new CaretPos(outsideStory, null, false))).toBe(false);

    const item = cell("x", 0, 0);
    const other = cell("y", 0, 1);
    const story: StoryRef = { slot: "cell", cell: item };
    const cellSel = new Selection();
    const pos = new CaretPos(story, item.document.words.head, false);
    cellSel.setRange(new SelRange(story, pos, pos, "cell"));
    expect(text.covers(cellSel, new CaretPos(story, item.document.words.tail, true))).toBe(true);
    expect(text.covers(cellSel, new CaretPos({ slot: "cell", cell: other }, other.document.words.head, false))).toBe(false);
  });
});
