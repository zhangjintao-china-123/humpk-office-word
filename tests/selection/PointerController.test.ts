import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableRow } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { PointerController } from "../../src/selection/PointerController";
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
  return document;
}

function cell(text: string, row: number, col: number): TableCell {
  const next = new TableCell(words(text));
  next.rowIndex = row;
  next.colIndex = col;
  return next;
}

function dispatch(el: HTMLElement, type: string, x: number, y: number, extra: PointerEventInit = {}): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId: 1,
      ...extra,
    }),
  );
}

describe("PointerController", () => {
  it("跨格拖出矩形 cell ranges", () => {
    const table = new Table();
    const cells = [cell("a", 0, 0), cell("b", 0, 1), cell("c", 1, 0), cell("d", 1, 1)];
    table.rows = [new TableRow(), new TableRow()];
    table.rows[0].cells = [cells[0], cells[1]];
    table.rows[1].cells = [cells[2], cells[3]];

    const hits = [
      new CaretPos({ slot: "cell", cell: cells[0] }, cells[0].document.words.head, false),
      new CaretPos({ slot: "cell", cell: cells[3] }, cells[3].document.words.head, false),
    ];
    let i = 0;
    const selection = new Selection();
    const host = {
      selection,
      hitClient: () => hits[Math.min(i++, hits.length - 1)],
      cellsInRect: () => cells,
      onChange() {},
    };
    const el = document.createElement("div");
    const pointer = new PointerController(host);
    pointer.attach(el);
    dispatch(el, "pointerdown", 10, 10);
    dispatch(el, "pointermove", 80, 80);
    dispatch(el, "pointerup", 80, 80);
    expect(selection.ranges).toHaveLength(4);
    expect(selection.ranges.every((range) => range.mode === "cell")).toBe(true);
    pointer.detach();
  });

  it("连续拖过中间格时仍按起点到终点的行列矩形选", () => {
    const cells = [cell("a", 0, 0), cell("b", 0, 1), cell("c", 1, 0), cell("d", 1, 1)];
    const hits = [
      new CaretPos({ slot: "cell", cell: cells[0] }, cells[0].document.words.head, false),
      new CaretPos({ slot: "cell", cell: cells[1] }, cells[1].document.words.head, false),
      new CaretPos({ slot: "cell", cell: cells[3] }, cells[3].document.words.head, false),
    ];
    let i = 0;
    const selection = new Selection();
    const host = {
      selection,
      hitClient: () => hits[Math.min(i++, hits.length - 1)],
      cellsInRect: (from: TableCell, to: TableCell) => {
        const top = Math.min(from.rowIndex, to.rowIndex);
        const bottom = Math.max(from.rowIndex, to.rowIndex);
        const left = Math.min(from.colIndex, to.colIndex);
        const right = Math.max(from.colIndex, to.colIndex);
        return cells.filter(
          (item) => item.rowIndex >= top && item.rowIndex <= bottom && item.colIndex >= left && item.colIndex <= right,
        );
      },
      onChange() {},
    };
    const el = document.createElement("div");
    const pointer = new PointerController(host);
    pointer.attach(el);
    dispatch(el, "pointerdown", 10, 10);
    dispatch(el, "pointermove", 80, 10);
    dispatch(el, "pointermove", 80, 80);
    dispatch(el, "pointerup", 80, 80);
    const picked = selection.ranges
      .filter((range) => range.story.slot === "cell")
      .map((range) => (range.story.slot === "cell" ? `${range.story.cell.rowIndex},${range.story.cell.colIndex}` : ""));
    expect(picked.sort()).toEqual(["0,0", "0,1", "1,0", "1,1"]);
    pointer.detach();
  });

  it("拖到另一张表时不把两张表的格子拼进同一选区", () => {
    const first = [cell("a", 0, 0), cell("b", 0, 1)];
    const second = [cell("x", 0, 0), cell("y", 0, 1)];
    const hits = [
      new CaretPos({ slot: "cell", cell: first[0] }, first[0].document.words.head, false),
      new CaretPos({ slot: "cell", cell: first[1] }, first[1].document.words.head, false),
      new CaretPos({ slot: "cell", cell: second[1] }, second[1].document.words.head, false),
    ];
    let i = 0;
    const selection = new Selection();
    const host = {
      selection,
      hitClient: () => hits[Math.min(i++, hits.length - 1)],
      cellsInRect: (from: TableCell, to: TableCell) => {
        const group = first.includes(from) && first.includes(to) ? first : second.includes(from) && second.includes(to) ? second : [];
        if (!group.length) {
          return [];
        }
        const left = Math.min(from.colIndex, to.colIndex);
        const right = Math.max(from.colIndex, to.colIndex);
        return group.filter((item) => item.colIndex >= left && item.colIndex <= right);
      },
      onChange() {},
    };
    const el = document.createElement("div");
    const pointer = new PointerController(host);
    pointer.attach(el);
    dispatch(el, "pointerdown", 10, 10);
    dispatch(el, "pointermove", 80, 10);
    dispatch(el, "pointermove", 80, 200);
    dispatch(el, "pointerup", 80, 200);
    const picked = selection.ranges.map((range) =>
      range.story.slot === "cell" ? range.story.cell.document.paragraphText()[0] : "",
    );
    expect(picked.sort()).toEqual(["a", "b"]);
    pointer.detach();
  });

  it("正文一点 + 页眉一点 → 两段选区", () => {
    const bodyDoc = words("正文");
    const headerDoc = words("页眉");
    const body: StoryRef = { slot: "body" };
    const header: StoryRef = { slot: "header" };
    const hits = [
      new CaretPos(body, bodyDoc.words.head, false),
      new CaretPos(header, headerDoc.words.head, false),
    ];
    let i = 0;
    const selection = new Selection();
    const host = {
      selection,
      hitClient: () => hits[Math.min(i++, hits.length - 1)],
      cellsInRect: () => [],
      onChange() {},
    };
    const el = document.createElement("div");
    const pointer = new PointerController(host);
    pointer.attach(el);
    dispatch(el, "pointerdown", 10, 40);
    dispatch(el, "pointermove", 10, 8);
    dispatch(el, "pointerup", 10, 8);
    expect(selection.ranges).toHaveLength(2);
    expect(selection.ranges.map((range) => range.story.slot)).toEqual(["body", "header"]);
    pointer.detach();
  });

  it("Meta+单击追加一段", () => {
    const bodyDoc = words("ab");
    const headerDoc = words("眉");
    const body: StoryRef = { slot: "body" };
    const header: StoryRef = { slot: "header" };
    const hits = [
      new CaretPos(body, bodyDoc.words.head, false),
      new CaretPos(header, headerDoc.words.head, false),
    ];
    let i = 0;
    const selection = new Selection();
    const host = {
      selection,
      hitClient: () => hits[Math.min(i++, hits.length - 1)],
      cellsInRect: () => [],
      onChange() {},
    };
    const el = document.createElement("div");
    const pointer = new PointerController(host);
    pointer.attach(el);
    dispatch(el, "pointerdown", 10, 40);
    dispatch(el, "pointerup", 10, 40);
    dispatch(el, "pointerdown", 10, 8, { metaKey: true });
    dispatch(el, "pointerup", 10, 8);
    expect(selection.ranges).toHaveLength(2);
    pointer.detach();
  });
});
