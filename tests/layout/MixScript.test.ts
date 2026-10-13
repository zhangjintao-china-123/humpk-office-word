import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Word } from "../../src/model/inline/Word";
import { Line } from "../../src/model/line/Line";
import { LinkedList } from "../../src/model/list/LinkedList";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { MeasurePass } from "../../src/layout/measure/MeasurePass";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { LinePositioner } from "../../src/layout/line/LinePositioner";
import { TokenBuilder } from "../../src/layout/token/TokenBuilder";
import type { Line as LineModel } from "../../src/model/line/Line";

function paragraph(text: string): Paragraph {
  const block = new Block();
  block.text = text;
  const item = new Paragraph(1);
  item.addBlock(block);
  return item;
}

function doc(text: string): Document {
  const document = new Document();
  document.addParagraph(paragraph(text));
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function layout(document: Document, width: number) {
  return new StoryLayout().layout(document, {
    contentWidth: width,
    contentHeight: 800,
    measurer: new FallbackMeasurer(),
    paginate: false,
  });
}

function lineText(line: LineModel): string {
  const chars: string[] = [];
  let node = line.startNode;
  for (let i = 0; i < line.length; i += 1) {
    if (node?.data.kind === "text" && !node.data.isEnterChar()) {
      chars.push(node.data.char);
    }
    node = node?.next ?? null;
  }
  return chars.join("");
}

function glyph(char: string, width: number): Word {
  const word = new Word();
  word.char = char;
  word.intChar = char.codePointAt(0) ?? 0;
  word.width = width;
  word.kernedWidth = width;
  word.height = 14;
  return word;
}

describe("中西文间距", () => {
  it("汉字和英文之间留四分之一个汉字，两边一样宽", () => {
    const eastThenWest = layout(doc("中A"), 200);
    const first = eastThenWest[0].startNode!.data;
    const second = eastThenWest[0].startNode!.next!.data;
    expect(first.kernedWidth).toBeCloseTo(17.5, 5);
    expect(second.kernedWidth).toBeCloseTo(7, 5);

    const westThenEast = layout(doc("A中"), 200);
    const latin = westThenEast[0].startNode!.data;
    const han = westThenEast[0].startNode!.next!.data;
    expect(latin.kernedWidth).toBeCloseTo(10.5, 5);
    expect(han.kernedWidth).toBeCloseTo(14, 5);
  });

  it("关掉中西文间距后不再加那一截空隙", () => {
    const document = doc("中A");
    document.paragraphs.head!.data.attrs.autoSpaceDE = "0";
    const lines = layout(document, 200);
    expect(lines[0].startNode!.data.kernedWidth).toBeCloseTo(14, 5);
  });

  it("换行后行尾不留下给下一个英文单词的空隙", () => {
    const lines = layout(doc("中Hello"), 40).filter((line) => line.type === "");
    expect(lineText(lines[0])).toBe("中");
    expect(lines[0].startNode!.data.kernedWidth).toBeCloseTo(14, 5);
    expect(lineText(lines[1])).toBe("Hello");
  });

  it("半角括号按半个字宽，全角括号按整字", () => {
    const measurer = new FallbackMeasurer();
    const pass = new MeasurePass();
    const half = new Word();
    half.char = "(";
    half.intChar = 40;
    half.block = new Block();
    half.block.style = { fontSizePx: 14 };
    const full = new Word();
    full.char = "（";
    full.intChar = 0xff08;
    full.block = new Block();
    full.block.style = { fontSizePx: 14 };
    pass.measureWord(half, measurer);
    pass.measureWord(full, measurer);
    expect(half.width).toBeCloseTo(7, 5);
    expect(full.width).toBeCloseTo(14, 5);
  });
});

describe("中西文断行", () => {
  it("don't 和 café 各自是一个词", () => {
    const contraction = new TokenBuilder().build(doc("don't").words.head);
    expect(contraction[0].kind).toBe("latin");
    expect(contraction[0].length).toBe(5);
    const accented = new TokenBuilder().build(doc("café").words.head);
    expect(accented[0].kind).toBe("latin");
    expect(accented[0].length).toBe(4);
  });

  it("字母和数字连在一起换行", () => {
    const lines = layout(doc("测Windows10"), 70).filter((line) => line.type === "");
    expect(lineText(lines[0])).toBe("测");
    expect(lineText(lines[1])).toBe("Windows10");
  });

  it("连字符留在上一截的末尾", () => {
    const lines = layout(doc("测测well-known"), 62).filter((line) => line.type === "");
    expect(lineText(lines[0])).toBe("测测");
    expect(lineText(lines[1])).toBe("well-");
    expect(lineText(lines[2])).toBe("known");
  });

  it("允许西文在单词中间换行时按字母断开", () => {
    const kept = layout(doc("测Hello"), 36).filter((line) => line.type === "");
    expect(lineText(kept[0])).toBe("测");
    expect(lineText(kept[1])).toBe("Hello");

    const document = doc("测Hello");
    document.paragraphs.head!.data.attrs.wordWrap = "0";
    const broken = layout(document, 36).filter((line) => line.type === "");
    expect(lineText(broken[0])).toBe("测He");
    expect(lineText(broken[1])).toBe("llo");
  });
});

describe("两端对齐的中西文", () => {
  it("多余空隙加在汉字和单词两侧，不加进字母里面", () => {
    const chars = [glyph("你", 17.5), glyph("A", 7), glyph("B", 10.5), glyph("你", 14)];
    const list = new LinkedList<Word>();
    for (const item of chars) {
      list.append(item);
    }
    const line = new Line();
    line.startNode = list.head;
    line.length = chars.length;
    line.isLast = false;
    const paragraph = new Paragraph(1);
    paragraph.attrs.textAlign = "both";
    line.paragraph = paragraph;
    new LinePositioner().place(line, 77);
    expect(chars[1].kernedWidth).toBeCloseTo(7, 5);
    expect(chars[2].left).toBeCloseTo(chars[1].left + chars[1].kernedWidth, 5);
    expect(chars[3].left).toBeGreaterThan(chars[2].left + 10.5);
  });
});
