import { describe, expect, it } from "vitest";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { InputController, type InputHost } from "../../src/edit/InputController";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { HitTester } from "../../src/selection/HitTester";
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

function press(input: InputController, key: string, shift = false): void {
  input.el.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true }));
}

function hostOf(document: Document, selection: Selection): InputHost {
  const ctx: EditContext = {
    mutator: new Mutator(),
    relayout: { apply: () => false } as unknown as Relayout,
    selection,
    documentOf: () => document,
    afterEdit: () => undefined,
  };
  return {
    ...ctx,
    history: new History(),
    hitTester: new HitTester(),
    hitContext: () => ({ pageSetup: { contentHeight: 400 } as never, origins: [], body: undefined }),
    caretCss: () => null,
    caretWorld: () => null,
    requestSave: () => undefined,
    copy: () => undefined,
    cut: () => undefined,
    paste: () => undefined,
  };
}

describe("InputController Shift 选区", () => {
  it("Shift+方向键从光标向右扩展，再向左收回", () => {
    const document = doc("abcd");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const input = new InputController(hostOf(document, selection));
    input.attach(globalThis.document.body);
    press(input, "ArrowRight", true);
    press(input, "ArrowRight", true);
    expect(selection.isCollapsed()).toBe(false);
    expect(selection.primaryRange()?.end.node).toBe(document.words.head!.next);
    expect(selection.primaryRange()?.end.after).toBe(true);
    press(input, "ArrowLeft", true);
    press(input, "ArrowLeft", true);
    expect(selection.isCollapsed()).toBe(true);
    input.detach();
  });

  it("已有选区时方向键左/右先折叠到选区两端", () => {
    const document = doc("abcd");
    const selection = new Selection();
    const start = new CaretPos(body, document.words.head, false);
    const end = new CaretPos(body, document.words.head!.next!.next, true);
    selection.setRange(new SelRange(body, start, end));
    const input = new InputController(hostOf(document, selection));
    input.attach(globalThis.document.body);
    press(input, "ArrowLeft");
    expect(selection.isCollapsed()).toBe(true);
    expect(selection.caret()?.equals(start)).toBe(true);
    selection.setRange(new SelRange(body, start, end));
    press(input, "ArrowRight");
    expect(selection.caret()?.equals(end)).toBe(true);
    input.detach();
  });
});
