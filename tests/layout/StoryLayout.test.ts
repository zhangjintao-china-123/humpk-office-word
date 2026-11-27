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

function anchored(
  text: string,
  spec: {
    wrapType: "none" | "square" | "tight" | "through" | "nowrap";
    wrapSide?: "both" | "left" | "right" | "largest";
    left: number;
    top: number;
    leftFrom: string;
    topFrom: string;
    width: number;
    height: number;
    polygon?: { x: number; y: number }[];
  },
): Document {
  const document = new Document();
  const first = paragraph(text, 1);
  const drawing = new Drawing();
  drawing.position = "anchor";
  drawing.width = spec.width;
  drawing.height = spec.height;
  drawing.anchorSet = {
    wrapType: spec.wrapType,
    wrapSide: spec.wrapSide,
    left: spec.left,
    top: spec.top,
    leftFrom: spec.leftFrom,
    topFrom: spec.topFrom,
    polygon: spec.polygon,
  };
  const image = new Block();
  image.drawing = drawing;
  first.addBlock(image);
  first.hasAnchor = true;
  document.addParagraph(first);
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

  it("上一段的段后距不会把绕排段的第一行和第二行挤紧", () => {
    const document = new Document();
    const title = paragraph("标题", 1);
    title.attrs.after = "200";
    document.addParagraph(title);
    const body = paragraph("绕排文字".repeat(16), 2);
    const drawing = new Drawing();
    drawing.position = "anchor";
    drawing.width = 80;
    drawing.height = 70;
    drawing.anchorSet = { wrapType: "square", wrapSide: "both", left: 0, top: 0, leftFrom: "column", topFrom: "paragraph" };
    const image = new Block();
    image.drawing = drawing;
    body.addBlock(image);
    body.hasAnchor = true;
    document.addParagraph(body);
    new WordStreamBuilder().buildStoryOnly(document);
    layout(document, 200, 400);
    const lines = body.lines.filter((line) => line.type === "" && !line.sharesBand);
    expect(lines.length).toBeGreaterThan(2);
    const glyph = (line: (typeof lines)[number]) => line.top + line.beforeHeight;
    const firstGap = glyph(lines[1]) - glyph(lines[0]);
    const secondGap = glyph(lines[2]) - glyph(lines[1]);
    expect(firstGap).toBeCloseTo(secondGap, 1);
  });

  it("四周型图在左侧时文字折到图右且不超出版心", () => {
    const document = anchored("绕排文字绕排文字绕排文字绕排文字绕排文字", {
      wrapType: "square",
      wrapSide: "both",
      left: 0,
      top: 0,
      leftFrom: "column",
      topFrom: "paragraph",
      width: 80,
      height: 70,
    });
    const lines = layout(document, 200, 400).filter((line) => line.type === "");
    const beside = lines.filter((line) => line.top + line.height * 0.5 < 70);
    expect(beside.length).toBeGreaterThan(0);
    for (const line of beside) {
      let node = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        const word = node?.data;
        if (word && word.kind === "text" && !word.isEnterChar()) {
          expect(word.left).toBeGreaterThanOrEqual(79);
          expect(word.left + word.kernedWidth).toBeLessThanOrEqual(200.5);
        }
        node = node?.next ?? null;
      }
    }
  });

  it("文字只绕在图左侧时不会穿进右侧的图", () => {
    const document = anchored("绕排文字绕排文字绕排文字绕排文字绕排文字", {
      wrapType: "square",
      wrapSide: "left",
      left: 120,
      top: 0,
      leftFrom: "column",
      topFrom: "paragraph",
      width: 70,
      height: 80,
    });
    const lines = layout(document, 200, 400).filter((line) => line.type === "");
    const beside = lines.filter((line) => line.top + line.height * 0.5 < 80);
    expect(beside.length).toBeGreaterThan(0);
    for (const line of beside) {
      let node = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        const word = node?.data;
        if (word && word.kind === "text" && !word.isEnterChar()) {
          expect(word.left + word.kernedWidth).toBeLessThanOrEqual(120.5);
        }
        node = node?.next ?? null;
      }
    }
  });

  it("两边绕排时同一行左右都有字", () => {
    const document = anchored("绕排文字绕排文字绕排文字绕排文字绕排文字绕排文字", {
      wrapType: "square",
      wrapSide: "both",
      left: 80,
      top: 0,
      leftFrom: "column",
      topFrom: "paragraph",
      width: 40,
      height: 60,
    });
    const lines = layout(document, 200, 400).filter((line) => line.type === "");
    const tops = new Set(lines.map((line) => line.top));
    expect(tops.size).toBeLessThan(lines.length);
    const band = lines.filter((line) => line.top === lines[0].top);
    const lefts = band.flatMap((line) => {
      const found: number[] = [];
      let node = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        const word = node?.data;
        if (word && word.kind === "text" && !word.isEnterChar()) {
          found.push(word.left);
        }
        node = node?.next ?? null;
      }
      return found;
    });
    expect(lefts.some((left) => left < 80)).toBe(true);
    expect(lefts.some((left) => left >= 120)).toBe(true);
  });

  it("穿越绕排让字进入轮廓中间，紧密绕排则让到外缘之外", () => {
    const frame = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
      { x: 8, y: 8 },
      { x: 8, y: 92 },
      { x: 92, y: 92 },
      { x: 92, y: 8 },
      { x: 8, y: 8 },
    ];
    const through = layout(
      anchored("绕排文字".repeat(10), {
        wrapType: "through",
        wrapSide: "both",
        left: 0,
        top: 0,
        leftFrom: "column",
        topFrom: "paragraph",
        width: 100,
        height: 100,
        polygon: frame,
      }),
      220,
      400,
    );
    expect(through[0].getWord(0)?.left).toBeGreaterThanOrEqual(100);
    const inside = through.find((line) => {
      const left = line.getWord(0)?.left ?? 0;
      return left >= 8 && left < 90;
    });
    expect(inside?.top).toBeGreaterThanOrEqual(8);

    const tight = layout(
      anchored("绕排文字绕排文字", {
        wrapType: "tight",
        wrapSide: "both",
        left: 0,
        top: 0,
        leftFrom: "column",
        topFrom: "paragraph",
        width: 100,
        height: 100,
        polygon: frame,
      }),
      220,
      400,
    );
    expect(tight.find((line) => line.type === "")?.getWord(0)?.left ?? 0).toBeGreaterThanOrEqual(99);
  });

  it("上下型图超出本页剩余高度时文字排到下一页", () => {
    const document = anchored("下一页的文字", {
      wrapType: "nowrap",
      left: 0,
      top: 0,
      leftFrom: "column",
      topFrom: "paragraph",
      width: 40,
      height: 90,
    });
    const lines = layout(document, 200, 100);
    const text = lines.find((line) => line.type === "" && (line.getWord(0)?.char ?? "") !== "");
    expect(text?.top ?? 0).toBeGreaterThanOrEqual(100);
  });

  it("相对段落的水平位置加上左缩进", () => {
    const document = anchored("缩进", {
      wrapType: "none",
      left: 10,
      top: 0,
      leftFrom: "paragraph",
      topFrom: "paragraph",
      width: 20,
      height: 20,
    });
    document.paragraphs.head!.data.attrs.leftChars = 200;
    layout(document, 200, 400);
    expect(document.anchors[0].x).toBeCloseTo(38, 0);
  });

  it("绕排把字推开后，相对字符的图跟着字走", () => {
    const document = new Document();
    const first = new Paragraph(1);
    const square = new Drawing();
    square.position = "anchor";
    square.width = 70;
    square.height = 40;
    square.anchorSet = { wrapType: "square", wrapSide: "both", left: 0, top: 0, leftFrom: "column", topFrom: "paragraph" };
    const mark = new Drawing();
    mark.position = "anchor";
    mark.width = 10;
    mark.height = 10;
    mark.anchorSet = { wrapType: "none", left: 0, top: 0, leftFrom: "character", topFrom: "character" };
    const squareBlock = new Block();
    squareBlock.drawing = square;
    const markBlock = new Block();
    markBlock.drawing = mark;
    const text = new Block();
    text.text = "绕排文字绕排文字绕排文字";
    first.addBlock(squareBlock);
    first.addBlock(markBlock);
    first.addBlock(text);
    first.hasAnchor = true;
    document.addParagraph(first);
    new WordStreamBuilder().buildStoryOnly(document);
    const lines = layout(document, 200, 400);
    const word = lines.find((line) => line.type === "")?.getWord(0);
    const character = document.anchors.find((anchor) => anchor.drawing === mark);
    expect(word?.left ?? 0).toBeGreaterThan(60);
    expect(character?.x ?? 0).toBeCloseTo(word?.left ?? -1, 0);
  });

  it("浮动表格按锚点绘制，旁边的文字让开", () => {
    const inner = new Document();
    inner.kind = "cell";
    inner.addParagraph(paragraph("表", 1));
    const table = new Table();
    const col = new TableColumn();
    col.width = 90;
    table.columns.push(col);
    const row = new TableRow();
    const cell = new TableCell(inner);
    cell.rowIndex = 0;
    row.cells.push(cell);
    table.rows.push(row);
    table.anchorType = "relative";
    table.anchorSet = { leftFrom: "column", left: 0, topFrom: "paragraph", top: 0 };
    const document = new Document();
    const host = new Paragraph(1);
    host.isTable = true;
    host.table = table;
    host.hasAnchor = true;
    document.addParagraph(host);
    document.addParagraph(paragraph("绕排文字绕排文字绕排文字绕排文字", 2));
    new WordStreamBuilder().buildStoryOnly(document);
    const lines = layout(document, 200, 400);
    const tableLine = lines.find((line) => line.type === "table");
    expect(tableLine?.leftBlankWidth ?? -1).toBeCloseTo(0, 0);
    const text = lines.find((line) => line.type === "" && line.length > 1);
    expect(text?.getWord(0)?.left ?? 0).toBeGreaterThanOrEqual(89);
  });

  it("段首大纲编号占住悬挂宽度", () => {
    const document = new Document();
    const first = paragraph("正文", 1);
    first.attrs.titleSerial = {
      start: 1,
      numFmt: "decimal",
      lvlText: "%1.",
      serial: 1,
      ilvl: 0,
      label: "1. ",
    };
    document.addParagraph(first);
    new WordStreamBuilder().buildStoryOnly(document);
    const lines = layout(document, 300, 400);
    expect(lines[0].outlineLabel).toBe("1. ");
    expect(lines[0].isFirst).toBe(true);
    expect(lines[0].leftBlankWidth).toBeGreaterThan(10);
    expect(lines[0].getWord(0)?.left ?? 0).toBeGreaterThanOrEqual(lines[0].leftBlankWidth);
  });

  it("悬挂缩进让首行退回，其余行停在左缩进上", () => {
    const document = doc("一二三四五六七八九十一二三四五");
    const item = document.paragraphs.head!.data;
    item.attrs.leftTwip = 300;
    item.attrs.hangingTwip = 150;
    const lines = layout(document, 80, 400);
    const first = lines.find((line) => line.isFirst);
    const next = lines.find((line) => line.paragraph === item && !line.isFirst);
    expect(first?.getWord(0)?.left ?? -1).toBeCloseTo(10, 0);
    expect(next?.getWord(0)?.left ?? -1).toBeCloseTo(20, 0);
  });

  it("编号的悬挂缩进让正文和后面的行对齐", () => {
    const document = doc("条款正文一二三");
    const item = document.paragraphs.head!.data;
    item.attrs.leftTwip = 420;
    item.attrs.hangingTwip = 420;
    item.attrs.titleSerial = {
      start: 1,
      numFmt: "decimal",
      lvlText: "%1.",
      serial: 1,
      ilvl: 0,
      label: "1.",
    };
    const lines = layout(document, 200, 400);
    expect(lines[0].getWord(0)?.left ?? 0).toBeCloseTo(28, 0);
    const next = lines.find((line) => !line.isFirst);
    if (next) {
      expect(next.getWord(0)?.left ?? 0).toBeCloseTo(28, 0);
    }
  });
});
