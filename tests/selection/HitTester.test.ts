import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Line } from "../../src/model/line/Line";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableRow } from "../../src/model/table/Table";
import { Word } from "../../src/model/inline/Word";
import { PageSetup } from "../../src/render/page/PageSetup";
import type { StoryEditor } from "../../src/editor/StoryEditor";
import { HitTester, type HitContext } from "../../src/selection/HitTester";
import { CELL_PAD } from "../../src/layout/LayoutConstants";

function paragraph(text: string, id = 1): Paragraph {
  const p = new Paragraph(id);
  const block = new Block();
  block.text = text;
  p.addBlock(block);
  return p;
}

function story(text: string): { document: Document; line: Line } {
  const document = new Document();
  document.addParagraph(paragraph(text));
  new WordStreamBuilder().buildStoryOnly(document);
  const line = new Line();
  line.startNode = document.words.head;
  line.length = document.words.length;
  line.top = 0;
  line.height = 20;
  line.maxCharHeight = 14;
  line.beforeHeight = 2;
  let left = 0;
  document.words.each((node) => {
    node.data.left = left;
    node.data.kernedWidth = node.data.isEnterChar() ? 0 : 10;
    if (!node.data.isEnterChar()) {
      left += 10;
    }
  });
  document.paragraphs.head!.data.lines = [line];
  line.paragraph = document.paragraphs.head!.data;
  return { document, line };
}

function editor(lines: Line[], document?: Document): StoryEditor {
  return { lines, document } as StoryEditor;
}

function page(): PageSetup {
  return new PageSetup({
    width: 400,
    height: 300,
    leftMargin: 40,
    rightMargin: 40,
    headerHeight: 20,
    footerHeight: 20,
    pageGap: 10,
  });
}

describe("HitTester", () => {
  const hit = new HitTester();
  const setup = page();
  const origins = [{ x: 0, y: 0 }];

  it("点中某字：左半边字前，右半边字后", () => {
    const { line } = story("ab");
    const ctx: HitContext = { pageSetup: setup, origins, body: editor([line]) };
    const first = hit.hit(40 + 3, 20 + 8, ctx);
    expect(first?.node?.data.char).toBe("a");
    expect(first?.after).toBe(false);
    const afterA = hit.hit(40 + 8, 20 + 8, ctx);
    expect(afterA?.node?.data.char).toBe("a");
    expect(afterA?.after).toBe(true);
    const b = hit.hit(40 + 13, 20 + 8, ctx);
    expect(b?.node?.data.char).toBe("b");
    expect(b?.after).toBe(false);
  });

  it("行尾落到 \\n，after=false", () => {
    const { line, document } = story("ab");
    const ctx: HitContext = { pageSetup: setup, origins, body: editor([line]) };
    const pos = hit.hit(40 + 25, 20 + 8, ctx);
    expect(pos?.node?.data.char).toBe("\n");
    expect(pos?.after).toBe(false);
    expect(pos?.node).toBe(document.words.tail);
  });

  it("两个单元格各自命中自己的字", () => {
    const cellA = story("A");
    const cellB = story("B");
    const table = twoCells(cellA.document, cellB.document);
    const tableLine = tableLineOf(table);
    const ctx: HitContext = {
      pageSetup: setup,
      origins,
      body: editor([tableLine], hostDoc(table)),
    };

    const tableX = 40;
    const tableY = 20;
    const inA = hit.hit(tableX + CELL_PAD + 3, tableY + CELL_PAD + 6, ctx);
    expect(inA?.story.slot).toBe("cell");
    expect(inA?.story.slot === "cell" && inA.story.cell).toBe(table.rows[0].cells[0]);
    expect(inA?.node?.data.char).toBe("A");

    const inB = hit.hit(tableX + 50 + CELL_PAD + 3, tableY + CELL_PAD + 6, ctx);
    expect(inB?.story.slot === "cell" && inB.story.cell).toBe(table.rows[0].cells[1]);
    expect(inB?.node?.data.char).toBe("B");
  });

  it("跨格矩形选出包围盒内的格子", () => {
    const cells = [
      [story("a"), story("b")],
      [story("c"), story("d")],
    ];
    const table = grid(cells.map((row) => row.map((item) => item.document)));
    const ctx: HitContext = {
      pageSetup: setup,
      origins,
      body: editor([tableLineOf(table)], hostDoc(table)),
    };
    const from = table.rows[0].cells[0];
    const to = table.rows[1].cells[1];
    const picked = hit.cellsInRect(from, to, ctx);
    expect(picked).toHaveLength(4);
  });

  it("两张表的格子不能拼成一个矩形", () => {
    const a = grid([[story("a").document]]);
    const b = grid([[story("b").document]]);
    const document = new Document();
    for (const table of [a, b]) {
      const paragraph = new Paragraph(document.nextParagraphId());
      paragraph.isTable = true;
      paragraph.table = table;
      document.addParagraph(paragraph);
    }
    const ctx: HitContext = {
      pageSetup: setup,
      origins,
      body: editor([tableLineOf(a), tableLineOf(b)], document),
    };
    const from = a.rows[0].cells[0];
    const to = b.rows[0].cells[0];
    expect(hit.findTable(from, ctx)).toBe(a);
    expect(hit.findTable(to, ctx)).toBe(b);
    expect(hit.cellsInRect(from, to, ctx)).toEqual([]);
  });

  it("页眉 band 可命中", () => {
    const { line } = story("眉");
    const ctx: HitContext = {
      pageSetup: setup,
      origins,
      body: editor([]),
      header: editor([line]),
    };
    const pos = hit.hit(40 + 3, setup.headerTop() + 8, ctx);
    expect(pos?.story.slot).toBe("header");
    expect(pos?.node?.data.char).toBe("眉");
  });

  it("嵌套表格命中内层格子，而不是外层格子", () => {
    const inner = story("N");
    const innerTable = grid([[inner.document]]);
    const innerLine = tableLineOf(innerTable);
    innerLine.top = 0;
    const wrapper = new Document();
    const tablePara = new Paragraph(1);
    tablePara.isTable = true;
    tablePara.table = innerTable;
    tablePara.lines = [innerLine];
    innerLine.paragraph = tablePara;
    wrapper.addParagraph(tablePara);
    const outer = grid([[wrapper]]);
    outer.columnWidths = [80];
    outer.rowHeights = [60];
    const ctx: HitContext = {
      pageSetup: setup,
      origins,
      body: editor([tableLineOf(outer)], hostDoc(outer)),
    };
    const pos = hit.hit(40 + CELL_PAD + CELL_PAD + 3, 20 + CELL_PAD + CELL_PAD + 6, ctx);
    expect(pos?.story.slot).toBe("cell");
    expect(pos?.story.slot === "cell" && pos.story.cell).toBe(innerTable.rows[0].cells[0]);
    expect(pos?.node?.data.char).toBe("N");
    const boxes = hit.cellBoxes(innerTable.rows[0].cells[0], ctx);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].x).toBe(40 + CELL_PAD);
    expect(hit.findTable(innerTable.rows[0].cells[0], ctx)).toBe(innerTable);
  });

  it("正文有行时仍能点中页眉，纸面空白落到最近正文", () => {
    const header = story("眉");
    const body = story("正");
    body.line.top = 0;
    const ctx: HitContext = {
      pageSetup: setup,
      origins,
      body: editor([body.line]),
      header: editor([header.line]),
    };
    const inHeader = hit.hit(40 + 3, setup.headerTop() + 2, ctx);
    expect(inHeader?.story.slot).toBe("header");
    const onPaper = hit.hit(40 + 3, 20 + 80, ctx);
    expect(onPaper?.story.slot).toBe("body");
    expect(onPaper?.node?.data.char).toBe("正");
  });
});

function twoCells(a: Document, b: Document): Table {
  return grid([[a, b]]);
}

function grid(docs: Document[][]): Table {
  const table = new Table();
  table.columnWidths = docs[0].map(() => 50);
  table.rowHeights = docs.map(() => 40);
  docs.forEach((rowDocs, rowIndex) => {
    const row = new TableRow();
    rowDocs.forEach((document, colIndex) => {
      const cell = new TableCell(document);
      cell.rowIndex = rowIndex;
      cell.colIndex = colIndex;
      row.cells.push(cell);
    });
    table.rows.push(row);
  });
  return table;
}

function tableLineOf(table: Table): Line {
  const word = new Word();
  word.kind = "table";
  word.table = table;
  const host = new Document();
  const p = new Paragraph(1);
  p.isTable = true;
  p.table = table;
  host.addParagraph(p);
  host.words.append(word);
  const line = new Line();
  line.type = "table";
  line.startNode = host.words.head;
  line.length = 1;
  line.top = 0;
  line.height = table.rowHeights.reduce((sum, h) => sum + h, 0);
  line.tableRowFrom = 0;
  line.tableRowTo = table.rows.length;
  return line;
}

function hostDoc(table: Table): Document {
  const document = new Document();
  const p = new Paragraph(1);
  p.isTable = true;
  p.table = table;
  document.addParagraph(p);
  return document;
}
