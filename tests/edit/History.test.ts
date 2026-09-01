import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import type { StoryRef } from "../../src/selection/StoryRef";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { DeleteCommand } from "../../src/edit/DeleteCommand";
import { InsertCommand } from "../../src/edit/InsertCommand";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";

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

function join(document: Document): string {
  return new WordStreamBuilder().joinText(document);
}

describe("History", () => {
  it("插入再 undo，光标和文本回到原处", () => {
    const document = doc("ac");
    const selection = new Selection();
    const pos = new CaretPos(body, document.words.head!.next, false);
    selection.collapse(pos);
    const mutator = new Mutator();
    const ctx: EditContext = {
      mutator,
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new InsertCommand(ctx, "b"));
    expect(join(document)).toBe("abc\n");
    expect(selection.caret()?.after).toBe(true);
    history.undo();
    expect(join(document)).toBe("ac\n");
    expect(selection.caret()?.equals(pos)).toBe(true);
    history.redo();
    expect(join(document)).toBe("abc\n");
  });

  it("回车再退格再 undo 两次，文本还原", () => {
    const document = doc("测试一下");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const mutator = new Mutator();
    const ctx: EditContext = {
      mutator,
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new InsertCommand(ctx, "X"));
    history.do(new InsertCommand(ctx, "\n"));
    history.do(new DeleteCommand(ctx, "backward"));
    expect(join(document)).toBe("X测试一下\n");
    history.undo();
    expect(document.paragraphs.length).toBe(2);
    history.undo();
    expect(document.paragraphs.length).toBe(1);
    expect(join(document)).toBe("X测试一下\n");
    expect(document.paragraphs.head!.data.getFullText()).toBe("X测试一下");
    history.undo();
    expect(join(document)).toBe("测试一下\n");
    expect(document.paragraphs.head!.data.getFullText()).toBe("测试一下");
  });
});
