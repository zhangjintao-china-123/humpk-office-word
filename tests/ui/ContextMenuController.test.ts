import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { TableCell } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelRange } from "../../src/selection/SelRange";
import { Selection } from "../../src/selection/Selection";
import type { StoryRef } from "../../src/selection/StoryRef";
import { ContextMenuBuilder } from "../../src/ui/contextmenu/ContextMenuBuilder";
import { ContextMenuController } from "../../src/ui/contextmenu/ContextMenuController";

const body: StoryRef = { slot: "body" };

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

describe("ContextMenuBuilder", () => {
  const builder = new ContextMenuBuilder();

  it("折叠光标只启用粘贴", () => {
    const items = builder.build("text", false);
    expect(items.map((item) => [item.action, item.enabled])).toEqual([
      ["cut", false],
      ["copy", false],
      ["paste", true],
      ["delete", false],
    ]);
  });

  it("表格菜单第一期条目与文本相同", () => {
    const text = builder.build("text", true);
    const table = builder.build("table", true);
    expect(table.map((item) => item.action)).toEqual(text.map((item) => item.action));
    expect(table.every((item) => item.enabled)).toBe(true);
  });
});

describe("ContextMenuController", () => {
  it("右键阻止默认菜单，选区外先折叠再弹出", () => {
    const model = doc("abcd");
    const selection = new Selection();
    const start = new CaretPos(body, model.words.head, false);
    const end = new CaretPos(body, model.words.head!.next!.next, true);
    selection.setRange(new SelRange(body, start, end));

    const outside = new CaretPos(body, model.words.tail, false);
    let changed = 0;
    const host = globalThis.document.createElement("div");
    const scroll = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(host);
    const controller = new ContextMenuController({
      selection,
      hitClient: () => outside,
      onSelectionChange: () => {
        changed += 1;
      },
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteSelection: () => undefined,
    });
    controller.attach(host, scroll);

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 });
    scroll.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(selection.isCollapsed()).toBe(true);
    expect(selection.caret()?.equals(outside)).toBe(true);
    expect(changed).toBe(1);
    expect(controller.menu.isOpen()).toBe(true);
    expect(controller.menu.el.querySelectorAll("button")).toHaveLength(4);

    globalThis.document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(controller.menu.isOpen()).toBe(false);
    controller.detach();
    host.remove();
  });

  it("命中当前整格选区不改选区，弹出表格菜单", () => {
    const cell = new TableCell(doc("x"));
    const story: StoryRef = { slot: "cell", cell };
    const selection = new Selection();
    const pos = new CaretPos(story, cell.document.words.head, false);
    selection.setRange(new SelRange(story, pos, pos, "cell"));

    const host = document.createElement("div");
    const scroll = document.createElement("div");
    const controller = new ContextMenuController({
      selection,
      hitClient: () => new CaretPos(story, cell.document.words.tail, true),
      onSelectionChange: () => {
        throw new Error("should keep cell selection");
      },
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteSelection: () => undefined,
    });
    controller.attach(host, scroll);
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    expect(selection.primaryRange()?.mode).toBe("cell");
    expect(controller.menu.isOpen()).toBe(true);
    controller.detach();
  });
});
