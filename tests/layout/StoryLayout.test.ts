import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Drawing } from "../../src/model/inline/Drawing";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { classifyChar } from "../../src/layout/classify/CharClass";
import { TokenBuilder } from "../../src/layout/token/TokenBuilder";

function paragraph(text: string, id = 1): Paragraph {
  const p = new Paragraph(id);
  const block = new Block();
  block.text = text;
  p.addBlock(block);
  return p;
}

function doc(...texts: string[]): Document {
  const document = new Document();
  texts.forEach((text, index) => document.addParagraph(paragraph(text, index + 1)));
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function layout(document: Document, width = 200, pageHeight = 400) {
  return new StoryLayout().layout(document, {
    contentWidth: width,
    contentHeight: pageHeight,
    measurer: new FallbackMeasurer(),
    paginate: true,
  });
}

describe("字符分类", () => {
  it("区分汉字、英文、全角标点", () => {
    expect(classifyChar("测", 0x6d4b)).toBe("cjk");
    expect(classifyChar("A", 65)).toBe("latin");
    expect(classifyChar("。")).toBe("fullPun");
    expect(classifyChar("，")).toBe("fullPun");
  });
});

describe("Token 词组", () => {
  it("连续英文合成一个 token，汉字逐字", () => {
    const document = doc("Hi世界");
    const tokens = new TokenBuilder().build(document.words.head);
    const kinds = tokens.map((token) => token.kind);
    expect(kinds[0]).toBe("latin");
    expect(tokens[0].length).toBe(2);
    expect(kinds[1]).toBe("cjk");
    expect(kinds[2]).toBe("cjk");
  });
});

describe("StoryLayout", () => {
  it("英文单词不断在词中，但比行宽时按字拆到下一行", () => {
    const document = doc("HelloWorld");
    const lines = layout(document, 40);
    const textLines = lines.filter((line) => line.type === "");
    expect(textLines.length).toBeGreaterThan(1);
    expect(textLines[0].length).toBeLessThan(10);
    for (const line of textLines) {
      let node = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        if (node && !node.data.isEnterChar()) {
          expect(node.data.left + node.data.kernedWidth).toBeLessThanOrEqual(40.5);
        }
        node = node?.next ?? null;
      }
    }
  });

  it("连续数字折到第二行后继续按行宽拆开，不画出纸外", () => {
    const document = doc(`字${"1".repeat(40)}`);
    const width = 56;
    const lines = layout(document, width);
    expect(lines.filter((line) => line.type === "").length).toBeGreaterThan(1);
    for (const line of lines) {
      if (line.type !== "") {
        continue;
      }
      let node = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        if (node && !node.data.isEnterChar()) {
          expect(node.data.left + node.data.kernedWidth).toBeLessThanOrEqual(width + 0.5);
        }
        node = node?.next ?? null;
      }
    }
  });

  it("空格后的下一个英文词换到下一行，而不是拆开 Hello", () => {
    const document = doc("Hello World");
    const lines = layout(document, 50);
    expect(lines.length).toBeGreaterThan(1);
    const first = lines[0];
    const text: string[] = [];
    let node = first.startNode;
    for (let i = 0; i < first.length; i += 1) {
      if (node?.data.kind === "text" && !node.data.isEnterChar()) {
        text.push(node.data.char);
      }
      node = node?.next ?? null;
    }
    expect(text.join("").trim()).toBe("Hello");
  });

  it("汉字按字换行", () => {
    const document = doc("测试测试测试测试");
    const lines = layout(document, 40);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("行尾闭标点不单独落到下一行", () => {
    const document = doc("字。");
    const lines = layout(document, 20);
    const textLines = lines.filter((line) => line.type === "");
    expect(textLines).toHaveLength(1);
    expect(textLines[0].overflowPun || textLines[0].length >= 2).toBe(true);
  });

  it("首行缩进让可用宽度变窄", () => {
    const document = doc("测试测试测试测试");
    document.paragraphs.head!.data.attrs.firstLineChars = 200;
    const indented = layout(document, 56);
    document.paragraphs.head!.data.attrs.firstLineChars = undefined;
    const plain = layout(doc("测试测试测试测试"), 56);
    expect(indented[0].leftBlankWidth).toBeGreaterThan(0);
    expect(indented.length).toBeGreaterThanOrEqual(plain.length);
  });

  it("内容超过一页时会分页", () => {
    const document = doc(...Array.from({ length: 20 }, (_, i) => `第${i}段`));
    const lines = layout(document, 200, 40);
    const last = lines.at(-1);
    expect(last).toBeTruthy();
    expect((last!.top + last!.height) / 40).toBeGreaterThan(1);
  });

  it("表格按行切到下一页", () => {
    const cellDoc = (text: string) => {
      const inner = new Document();
      inner.kind = "cell";
      inner.addParagraph(paragraph(text, 1));
      return inner;
    };
    const table = new Table();
    const col = new TableColumn();
    col.width = 120;
    table.columns.push(col);
    for (let i = 0; i < 4; i += 1) {
      const row = new TableRow();
      const cell = new TableCell(cellDoc("格"));
      cell.rowIndex = i;
      row.cells.push(cell);
      table.rows.push(row);
    }
    const document = new Document();
    const p = new Paragraph(1);
    p.isTable = true;
    p.table = table;
    document.addParagraph(p);
    new WordStreamBuilder().buildStoryOnly(document);
    const lines = layout(document, 160, 50);
    const slices = lines.filter((line) => line.type === "table");
    expect(slices.length).toBeGreaterThan(1);
    expect(slices[0].tableRowTo).toBeLessThan(4);
    expect(slices.at(-1)!.tableRowTo).toBe(4);
  });

  it("行高至少等于行内图片高度", () => {
    const document = new Document();
    const p = new Paragraph(1);
    const block = new Block();
    const drawing = new Drawing();
    drawing.width = 80;
    drawing.height = 60;
    drawing.position = "inline";
    block.drawing = drawing;
    p.addBlock(block);
    document.addParagraph(p);
    new WordStreamBuilder().buildStoryOnly(document);
    const lines = layout(document, 200, 400);
    expect(lines[0].height).toBeGreaterThanOrEqual(60);
    expect(lines[0].maxCharHeight).toBeGreaterThanOrEqual(60);
  });

  it("上下型锚定图会把后续行推到图下方", () => {
    const document = new Document();
    const first = paragraph("锚", 1);
    const drawing = new Drawing();
    drawing.position = "anchor";
    drawing.width = 80;
    drawing.height = 50;
    drawing.anchorSet = { wrapType: "nowrap", left: 10, top: 0, leftFrom: "column", topFrom: "paragraph" };
    const image = new Block();
    image.drawing = drawing;
    first.addBlock(image);
    first.hasAnchor = true;
    document.addParagraph(first);
    document.addParagraph(paragraph("后面的字", 2));
    new WordStreamBuilder().buildStoryOnly(document);
    const lines = layout(document, 200, 400);
    const later = lines.find((line) => line.paragraph?.getFullText() === "后面的字");
    expect(document.anchors).toHaveLength(1);
    expect(document.anchors[0].wrap).toBe("nowrap");
    expect(later?.top).toBeGreaterThanOrEqual(50);
  });

  it("相对页面的锚定水平位置要减去左边距", () => {
    const document = new Document();
    const first = paragraph("页", 1);
    const drawing = new Drawing();
    drawing.position = "anchor";
    drawing.width = 40;
    drawing.height = 20;
    drawing.anchorSet = { wrapType: "none", left: 96, top: 8, leftFrom: "page", topFrom: "page" };
    const image = new Block();
    image.drawing = drawing;
    first.addBlock(image);
    first.hasAnchor = true;
    document.addParagraph(first);
    new WordStreamBuilder().buildStoryOnly(document);
    new StoryLayout().layout(document, {
      contentWidth: 200,
      contentHeight: 400,
      leftMargin: 96,
      measurer: new FallbackMeasurer(),
      paginate: true,
    });
    expect(document.anchors[0].x).toBe(0);
    expect(document.anchors[0].y).toBe(8);
  });

  it("相对字符的锚定图贴在插入点后面", () => {
    const document = new Document();
    const first = paragraph("前面", 1);
    const drawing = new Drawing();
    drawing.position = "anchor";
    drawing.width = 40;
    drawing.height = 20;
    drawing.anchorSet = { wrapType: "none", left: 10, top: 0, leftFrom: "character", topFrom: "character" };
    const image = new Block();
    image.drawing = drawing;
    first.addBlock(image);
    first.hasAnchor = true;
    document.addParagraph(first);
    new WordStreamBuilder().buildStoryOnly(document);
    new StoryLayout().layout(document, {
      contentWidth: 200,
      contentHeight: 400,
      measurer: new FallbackMeasurer(),
      paginate: true,
    });
    expect(document.anchors[0].x).toBeGreaterThan(20);
    expect(document.anchors[0].y).toBe(document.paragraphs.head!.data.lines[0].top);
  });

  it("紧密绕排按多边形扫描线让出宽度", () => {
    const document = new Document();
    const first = paragraph("绕排文字绕排文字绕排文字绕排文字", 1);
    const drawing = new Drawing();
    drawing.position = "anchor";
    drawing.width = 80;
    drawing.height = 80;
    drawing.anchorSet = {
      wrapType: "tight",
      wrapSide: "right",
      left: 0,
      top: 0,
      leftFrom: "column",
      topFrom: "paragraph",
      polygon: [
        { x: 0, y: 0 },
        { x: 80, y: 40 },
        { x: 0, y: 80 },
      ],
    };
    const image = new Block();
    image.drawing = drawing;
    first.addBlock(image);
    first.hasAnchor = true;
    document.addParagraph(first);
    new WordStreamBuilder().buildStoryOnly(document);
    const lines = layout(document, 200, 400);
    const textLine = lines.find((line) => line.type === "" && line.length > 1);
    expect(textLine).toBeTruthy();
    expect(textLine!.getWord(0)?.left ?? 0).toBeGreaterThan(8);
  });
});
