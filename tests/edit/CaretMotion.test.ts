import { describe, expect, it } from "vitest";
import { moveLeft, moveLineEnd, moveLineStart, movePage, moveRight, moveVertical } from "../../src/edit/CaretMotion";
import type { StoryEditor } from "../../src/editor/StoryEditor";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Line } from "../../src/model/line/Line";
import type { LinkedNode } from "../../src/model/list/LinkedList";
import type { Word } from "../../src/model/inline/Word";
import { PageSetup } from "../../src/render/page/PageSetup";
import { CaretPos } from "../../src/selection/CaretPos";
import { HitTester, type HitContext } from "../../src/selection/HitTester";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

function doc(text: string) {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document.words;
}

function laid(chunks: string[], lineHeight = 20) {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = chunks.join("");
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);

  const lines: Line[] = [];
  let node = document.words.head;
  let top = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const last = i === chunks.length - 1;
    const line = new Line();
    line.startNode = node;
    line.length = chunks[i].length + (last ? 1 : 0);
    line.top = top;
    line.height = lineHeight;
    line.maxCharHeight = 14;
    line.beforeHeight = 2;
    let left = 0;
    let current = node;
    for (let j = 0; j < line.length; j += 1) {
      if (!current) {
        break;
      }
      current.data.left = left;
      current.data.kernedWidth = current.data.isEnterChar() ? 0 : 10;
      if (!current.data.isEnterChar()) {
        left += 10;
      }
      current = current.next;
    }
    paragraph.lines.push(line);
    line.paragraph = paragraph;
    lines.push(line);
    node = advance(node, line.length);
    top += lineHeight;
  }

  const setup = new PageSetup({
    width: 400,
    height: 300,
    leftMargin: 40,
    rightMargin: 40,
    headerHeight: 20,
    footerHeight: 20,
    pageGap: 10,
  });
  const hit = new HitTester();
  const ctx: HitContext = {
    pageSetup: setup,
    origins: [{ x: 0, y: 0 }],
    body: { lines, document } as StoryEditor,
  };
  return { ctx, hit, lines };
}

function advance(node: LinkedNode<Word> | null, steps: number) {
  let current = node;
  for (let i = 0; i < steps; i += 1) {
    current = current?.next ?? null;
  }
  return current;
}

describe("CaretMotion", () => {
  it("右键从字后直接跳到下一字后，不在等价位置停一拍", () => {
    const list = doc("ab");
    const a = list.head!;
    const b = a.next!;
    const afterA = new CaretPos(body, a, true);
    const right = moveRight(afterA);
    expect(right.node).toBe(b);
    expect(right.after).toBe(true);
  });

  it("左键从字前直接跳到上一字前", () => {
    const list = doc("ab");
    const a = list.head!;
    const b = a.next!;
    const beforeB = new CaretPos(body, b, false);
    const left = moveLeft(beforeB);
    expect(left.node).toBe(a);
    expect(left.after).toBe(false);
  });

  it("下键落到下一行同一列，上键回来", () => {
    const { ctx, hit, lines } = laid(["ab", "cd"]);
    const a = lines[0].startNode!;
    const afterA = new CaretPos(body, a, true);
    const box = hit.caretBox(afterA, ctx)!;
    const down = moveVertical(afterA, 1, box.x, hit, ctx);
    expect(hit.lineOf(down, ctx)).toBe(lines[1]);
    expect(hit.caretBox(down, ctx)?.x).toBe(box.x);
    const up = moveVertical(down, -1, box.x, hit, ctx);
    expect(hit.lineOf(up, ctx)).toBe(lines[0]);
    expect(hit.caretBox(up, ctx)?.x).toBe(box.x);
  });

  it("翻页跳过中间行，落到距一页最近的一行", () => {
    const { ctx, hit, lines } = laid(["a", "b", "c"], 80);
    const a = lines[0].startNode!;
    const afterA = new CaretPos(body, a, true);
    const box = hit.caretBox(afterA, ctx)!;
    const down = movePage(afterA, 1, box.x, hit, ctx);
    expect(hit.lineOf(down, ctx)).toBe(lines[2]);
    const stay = movePage(down, 1, box.x, hit, ctx);
    expect(stay.equals(down)).toBe(true);
  });

  it("Home 到行首，End 到行尾段落标记前", () => {
    const { ctx, hit, lines } = laid(["ab", "cd"]);
    const c = lines[1].startNode!;
    const afterC = new CaretPos(body, c, true);
    const home = moveLineStart(afterC, hit, ctx);
    expect(home.node).toBe(c);
    expect(home.after).toBe(false);
    const end = moveLineEnd(afterC, hit, ctx);
    expect(end.node?.data.char).toBe("\n");
    expect(end.after).toBe(false);
  });
});
