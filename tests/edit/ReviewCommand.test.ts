import { describe, expect, it } from "vitest";
import { CommentCommand } from "../../src/edit/CommentCommand";
import { DeleteCommand } from "../../src/edit/DeleteCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { FootnoteCommand } from "../../src/edit/FootnoteCommand";
import { History } from "../../src/edit/History";
import { InsertCommand } from "../../src/edit/InsertCommand";
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

  it("鼠标反向拖选只批注实际选中的文字，并可撤销和重做", () => {
    const { document, selection } = doc([block("甲乙丙丁")]);
    const start = new CaretPos(body, document.words.head!.next, false);
    const end = new CaretPos(body, document.words.tail!.pre!.pre, true);
    selection.setFlow(end, start);
    const history = new History();
    history.do(new CommentCommand(context(document, selection), "只说明乙丙"));
    const paragraph = document.paragraphs.head!.data;
    expect(paragraph.blocks.map(({ text }) => text)).toEqual(["甲", "乙丙", "1", "丁"]);
    expect(paragraph.blocks.filter((item) => item.commentIds?.length).map((item) => item.text)).toEqual(["乙丙"]);
    history.undo();
    expect(paragraph.getFullText()).toBe("甲乙丙丁");
    expect(selection.flow).toEqual({ anchor: end, focus: start });
    history.redo();
    expect(paragraph.blocks.filter((item) => item.commentIds?.length).map((item) => item.text)).toEqual(["乙丙"]);
  });

  it("添加光标批注后继续输入，输入的文字保持普通正文", () => {
    const { document, selection } = doc([block("正文")]);
    selection.collapse(new CaretPos(body, document.words.tail, false));
    const history = new History();
    const ctx = context(document, selection);
    history.do(new CommentCommand(ctx, "光标位置"));
    history.do(new InsertCommand(ctx, "后续文字"));
    const blocks = document.paragraphs.head!.data.blocks;
    expect(blocks.filter((item) => item.commentRef).map((item) => item.text)).toEqual(["1"]);
    expect(blocks.filter((item) => item.commentIds?.length)).toHaveLength(0);
    expect(blocks.at(-1)?.text).toBe("后续文字");
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
    expect(added.style).toEqual({ color: "#2E75B6", underline: "single" });
    history.undo();
    expect(document.paragraphText()[0]).toBe("保留新增删掉");
    expect(document.paragraphs.toArray()[0].blocks.filter((item) => item.revision).map((item) => item.revision?.kind)).toEqual([
      "ins",
      "del",
    ]);
  });

  it("只选中插入修订的一部分时，拒绝整条修订并可恢复", () => {
    const first = block("新");
    const second = block("条目");
    first.revision = { kind: "ins", id: "1" };
    second.revision = { ...first.revision };
    second.style = { bold: true };
    const { document, selection } = doc([block("原文"), first, second, block("结尾")]);
    const node = document.words.head!.next!.next!.next!;
    selection.setFlow(new CaretPos(body, node, true), new CaretPos(body, node));
    const history = new History();
    history.do(new RevisionCommand(context(document, selection), "reject"));
    expect(document.paragraphText()).toEqual(["原文结尾"]);
    history.undo();
    expect(document.paragraphText()).toEqual(["原文新条目结尾"]);
    expect(second.revision?.id).toBe("1");
    history.redo();
    expect(document.paragraphText()).toEqual(["原文结尾"]);
  });

  it("跟踪跨段选区的文字删除，拒绝和撤销均保留段落边界", () => {
    const { document, selection } = doc([block("甲乙")]);
    const second = new Paragraph(2);
    second.addBlock(block("丙丁"));
    document.addParagraph(second);
    new WordStreamBuilder().buildStoryOnly(document);
    const first = document.paragraphs.head!.data;
    const start = new CaretPos(body, document.words.head!.next);
    const end = new CaretPos(body, document.words.tail!.pre!.pre, true);
    selection.setRange(new SelRange(body, start, end));
    const ctx = context(document, selection);
    ctx.recordRevision = (kind) => ({ kind, id: "1", author: "审阅人" });
    const history = new History();
    history.do(new DeleteCommand(ctx, "backward"));
    expect(document.paragraphText()).toEqual(["甲乙", "丙丁"]);
    expect(first.blocks.find((item) => item.revision)?.text).toBe("乙");
    expect(second.blocks.find((item) => item.revision)?.text).toBe("丙");
    history.undo();
    expect(document.paragraphText()).toEqual(["甲乙", "丙丁"]);
    expect([...first.blocks, ...second.blocks].some((item) => item.revision)).toBe(false);
    history.redo();
    selection.setRange(new SelRange(body, start, end));
    history.do(new RevisionCommand(ctx, "reject"));
    expect(document.paragraphText()).toEqual(["甲乙", "丙丁"]);
    expect([...first.blocks, ...second.blocks].some((item) => item.revision)).toBe(false);
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
