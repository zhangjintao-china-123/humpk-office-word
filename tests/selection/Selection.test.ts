import { describe, expect, it } from "vitest";
import { Document } from "../../src/model/document/Document";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Block } from "../../src/model/block/Block";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { TableCell } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelRange } from "../../src/selection/SelRange";
import { Selection } from "../../src/selection/Selection";
import type { StoryRef } from "../../src/selection/StoryRef";

function words(text: string) {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document.words;
}

describe("Selection 多段选区", () => {
  const body: StoryRef = { slot: "body" };

  it("反向拖动后 normalized 保证 start 在前", () => {
    const list = words("abcd");
    const a = new CaretPos(body, list.head, false);
    const d = new CaretPos(body, list.head!.next!.next!.next, true);
    const range = new SelRange(body, d, a).normalized();
    expect(range.start.node).toBe(list.head);
    expect(range.end.node).toBe(d.node);
  });

  it("collapse 只留一段折叠选区", () => {
    const list = words("ab");
    const selection = new Selection();
    selection.addRange(new SelRange(body, new CaretPos(body, list.head), new CaretPos(body, list.tail)));
    selection.addRange(new SelRange({ slot: "header" }, new CaretPos({ slot: "header" }, null), new CaretPos({ slot: "header" }, null)));
    const pos = new CaretPos(body, list.head, true);
    selection.collapse(pos);
    expect(selection.ranges).toHaveLength(1);
    expect(selection.isCollapsed()).toBe(true);
    expect(selection.caret()?.after).toBe(true);
  });

  it("跨 Editor 可以同时保留两段", () => {
    const list = words("ab");
    const header = words("眉");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, list.head));
    selection.addRange(
      new SelRange({ slot: "header" }, new CaretPos({ slot: "header" }, header.head), new CaretPos({ slot: "header" }, header.head)),
    );
    expect(selection.ranges).toHaveLength(2);
    expect(selection.ranges[0].story.slot).toBe("body");
    expect(selection.ranges[1].story.slot).toBe("header");
  });

  it("extendInStory 只改同一 Story 的终点", () => {
    const list = words("abc");
    const selection = new Selection();
    const start = new CaretPos(body, list.head, false);
    selection.collapse(start);
    selection.extendInStory(new CaretPos(body, list.head!.next, true));
    expect(selection.ranges).toHaveLength(1);
    expect(selection.ranges[0].start.node).toBe(list.head);
    expect(selection.ranges[0].end.after).toBe(true);
  });

  it("同一单元格 Story 用对象身份区分", () => {
    const cellA = new TableCell(new Document());
    const cellB = new TableCell(new Document());
    const a: StoryRef = { slot: "cell", cell: cellA };
    const b: StoryRef = { slot: "cell", cell: cellB };
    const selection = new Selection();
    selection.addRange(new SelRange(a, new CaretPos(a, null), new CaretPos(a, null)));
    selection.addRange(new SelRange(b, new CaretPos(b, null), new CaretPos(b, null)));
    expect(selection.ranges).toHaveLength(2);
  });
});
