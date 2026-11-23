import { describe, expect, it } from "vitest";
import { CommentCommand } from "../../src/edit/CommentCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { FootnoteCommand } from "../../src/edit/FootnoteCommand";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { RevisionCommand } from "../../src/edit/RevisionCommand";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import { SelRange } from "../../src/selection/SelRange";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

describe("审阅命令", () => {
  it("给选中文字加批注，撤销后批注消失", () => {
    const { document, selection } = doc([block("官网")]);
    const history = new History();
    history.do(new CommentCommand(context(document, selection), "核对口径"));
    expect(document.comments.map((comment) => comment.text)).toEqual(["核对口径"]);
    expect(document.paragraphText()[0]).toContain("官网");
    expect(document.paragraphText()[0]).toContain("1");
    expect(document.paragraphs.toArray()[0].blocks.some((item) => item.commentIds?.length)).toBe(true);
    expect(document.paragraphs.toArray()[0].blocks.some((item) => item.commentRef === document.comments[0].id)).toBe(true);
    history.undo();
    expect(document.comments).toEqual([]);
    expect(document.paragraphText()[0]).toBe("官网");
  });

  it("在光标处插入脚注", () => {
    const { document, selection } = doc([block("正文")]);
    selection.collapse(new CaretPos(body, document.words.tail, false));
    const history = new History();
    history.do(new FootnoteCommand(context(document, selection), "见年报"));
    expect(document.footnotes).toEqual([{ id: "1", text: "见年报" }]);
    expect(document.paragraphs.toArray()[0].blocks.some((item) => item.footnoteId === "1")).toBe(true);
    history.undo();
    expect(document.footnotes).toEqual([]);
    expect(document.paragraphText()[0]).toBe("正文");
  });

  it("接受修订会留下插入、去掉删除", () => {
    const added = block("新增");
    added.revision = { kind: "ins", id: "1", author: "张三" };
    added.style = { color: "#2E75B6", underline: "single" };
    const removed = block("删掉");
    removed.revision = { kind: "del", id: "2", author: "张三" };
    removed.style = { color: "#C00000", strike: "single" };
    const { document, selection } = doc([block("保留"), added, removed]);
    const history = new History();
    history.do(new RevisionCommand(context(document, selection), "accept"));
    expect(document.paragraphText()[0]).toBe("保留新增");
    expect(document.paragraphs.toArray()[0].blocks.some((item) => item.revision)).toBe(false);
    history.undo();
    expect(document.paragraphText()[0]).toBe("保留新增删掉");
    expect(document.paragraphs.toArray()[0].blocks.filter((item) => item.revision).map((item) => item.revision?.kind)).toEqual([
      "ins",
      "del",
    ]);
  });
});

function block(text: string): Block {
  const item = new Block();
  item.text = text;
  return item;
}

function doc(blocks: Block[]): { document: Document; selection: Selection } {
  const document = new Document();
  const paragraph = new Paragraph(1);
  for (const item of blocks) {
    paragraph.addBlock(item);
  }
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  const selection = new Selection();
  selection.setRange(new SelRange(body, new CaretPos(body, document.words.head, false), new CaretPos(body, document.words.tail, true)));
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
