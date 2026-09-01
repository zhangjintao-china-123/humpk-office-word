import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelRange } from "../../src/selection/SelRange";
import type { StoryRef } from "../../src/selection/StoryRef";
import { Mutator } from "../../src/edit/Mutator";

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

function docParas(...texts: string[]): Document {
  const document = new Document();
  texts.forEach((text, index) => {
    const paragraph = new Paragraph(index + 1);
    const block = new Block();
    block.text = text;
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
  });
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function join(document: Document): string {
  return new WordStreamBuilder().joinText(document);
}

function before(document: Document, char: string): CaretPos {
  let node = document.words.head;
  while (node) {
    if (node.data.char === char) {
      return new CaretPos(body, node, false);
    }
    node = node.next;
  }
  return new CaretPos(body, document.words.head, false);
}

describe("Mutator", () => {
  const mutator = new Mutator();

  it("插入后 Block.text 与链表一致", () => {
    const document = doc("ac");
    const pos = before(document, "c");
    mutator.insert(document, body, pos, "b");
    expect(join(document)).toBe("abc\n");
    expect(document.paragraphs.head!.data.getFullText()).toBe("abc");
    expect(document.paragraphs.head!.data.blocks[0].text).toBe("abc");
  });

  it("Enter 拆段", () => {
    const document = doc("ab");
    const pos = before(document, "b");
    const patch = mutator.insert(document, body, pos, "\n");
    expect(patch.impact.structure).toBe("split");
    expect(document.paragraphs.length).toBe(2);
    expect(document.paragraphs.head!.data.getFullText()).toBe("a");
    expect(document.paragraphs.head!.next!.data.getFullText()).toBe("b");
    expect(patch.impact.dirty).toHaveLength(2);
  });

  it("段末回车后新段继承上一行的字体样式", () => {
    const document = doc("ab");
    const source = document.paragraphs.head!.data;
    source.attrs = { textAlign: "center", firstLineChars: 200 };
    source.inheritedRunStyle = { wEastAsia: "楷体" };
    source.blocks[0].style = { fontSizePx: 28, bold: true, color: "#cc0000", wEastAsia: "楷体" };
    const pos = before(document, "\n");
    const patch = mutator.insert(document, body, pos, "\n");
    const created = document.paragraphs.head!.next!.data;
    expect(created.attrs.textAlign).toBe("center");
    expect(created.attrs.firstLineChars).toBe(200);
    expect(created.blocks[0].style.fontSizePx).toBe(28);
    expect(created.blocks[0].style.bold).toBe(true);
    expect(created.blocks[0].style.color).toBe("#cc0000");
    mutator.insert(document, body, patch.caret, "字");
    let node = document.words.head;
    while (node && node.data.char !== "字") {
      node = node.next;
    }
    expect(node?.data.paragraph).toBe(created);
    expect(node?.data.getStyle()?.fontSizePx).toBe(28);
    expect(node?.data.getStyle()?.bold).toBe(true);
  });

  it("段首删合并", () => {
    const document = docParas("ab", "cd");
    const second = document.paragraphs.head!.next!.data;
    const firstOfSecond = document.words.head;
    let node = firstOfSecond;
    while (node && node.data.paragraph !== second) {
      node = node.next;
    }
    const pos = new CaretPos(body, node, false);
    const patch = mutator.deleteBackward(document, body, pos);
    expect(patch.impact.structure).toBe("merge");
    expect(document.paragraphs.length).toBe(1);
    expect(document.paragraphs.head!.data.getFullText()).toBe("abcd");
    expect(join(document)).toBe("abcd\n");
  });

  it("删除选区后原文同步", () => {
    const document = doc("abcd");
    const a = before(document, "b");
    const c = before(document, "d");
    mutator.deleteRange(document, body, new SelRange(body, a, c));
    expect(document.paragraphs.head!.data.getFullText()).toBe("ad");
  });

  it("invert 插入后文本回到原处", () => {
    const document = doc("ac");
    const pos = before(document, "c");
    const patch = mutator.insert(document, body, pos, "b");
    mutator.invert(document, patch);
    expect(join(document)).toBe("ac\n");
    expect(document.paragraphs.head!.data.getFullText()).toBe("ac");
  });

  it("invert 删除选区后文本回到原处", () => {
    const document = doc("abcd");
    const start = before(document, "a");
    const end = before(document, "d");
    const patch = mutator.deleteRange(document, body, new SelRange(body, start, end));
    expect(join(document)).toBe("d\n");
    mutator.invert(document, patch);
    expect(join(document)).toBe("abcd\n");
    expect(document.paragraphs.head!.data.getFullText()).toBe("abcd");
  });
});
