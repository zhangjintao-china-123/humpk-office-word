import { describe, expect, it } from "vitest";
import { FormatCommand } from "../../src/edit/FormatCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import type { RunStyle } from "../../src/model/style/RunStyle";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import { SelRange } from "../../src/selection/SelRange";
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

describe("FormatCommand", () => {
  it("选中文字加粗，undo 后恢复", () => {
    const document = doc("ab");
    const selection = new Selection();
    const a = document.words.head!;
    const b = a.next!;
    selection.setRange(new SelRange(body, new CaretPos(body, a, false), new CaretPos(body, b, true)));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "bold" }));
    expect(a.data.getStyle()?.bold).toBe(true);
    expect(b.data.getStyle()?.bold).toBe(true);
    history.undo();
    expect(a.data.getStyle()?.bold).toBeFalsy();
  });

  it("折叠光标加粗写入 pending，随后插入的字带粗体", () => {
    const document = doc("a");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, true));
    let pending: RunStyle | undefined;
    const mutator = new Mutator();
    const ctx: EditContext = {
      mutator,
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
      pendingRunStyle: () => pending,
      setPendingRunStyle: (style) => {
        pending = style;
      },
    };
    new FormatCommand(ctx, { type: "bold" }).do();
    expect(pending?.bold).toBe(true);
    expect(document.words.head!.data.getStyle()?.bold).toBe(true);
    const patch = mutator.insert(document, body, selection.caret()!, "x", pending);
    expect(patch.caret.node?.data.getStyle()?.bold).toBe(true);
  });

  it("段落对齐写到 attrs", () => {
    const document = doc("a");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    new FormatCommand(ctx, { type: "align", value: "center" }).do();
    expect(document.paragraphs.head!.data.attrs.textAlign).toBe("center");
  });
});
