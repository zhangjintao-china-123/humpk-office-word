import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Drawing } from "../../src/model/inline/Drawing";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelRange } from "../../src/selection/SelRange";
import { Selection } from "../../src/selection/Selection";
import { SelectionFragment } from "../../src/selection/SelectionFragment";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };
const fragment = new SelectionFragment();

function styledDoc(): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  paragraph.attrs = { textAlign: "center" };
  const bold = new Block();
  bold.text = "加粗";
  bold.style = { bold: true, color: "#C00000", fontSizePx: 21 };
  const plain = new Block();
  plain.text = "普通";
  paragraph.addBlock(bold);
  paragraph.addBlock(plain);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

describe("SelectionFragment", () => {
  it("按 run 切开并带上字符样式", () => {
    const document = styledDoc();
    const selection = new Selection();
    const start = new CaretPos(body, document.words.head, false);
    const end = new CaretPos(body, document.words.tail, false);
    selection.setRange(new SelRange(body, start, end));
    const payload = fragment.extract(selection);
    expect(payload.text).toBe("加粗普通");
    expect(payload.paragraphs).toHaveLength(1);
    expect(payload.paragraphs[0].attrs.textAlign).toBe("center");
    expect(payload.paragraphs[0].runs).toEqual([
      { text: "加粗", style: { bold: true, color: "#C00000", fontSizePx: 21 } },
      { text: "普通", style: {} },
    ]);
  });

  it("选中图片时带上绘图数据", () => {
    const document = new Document();
    const paragraph = new Paragraph(1);
    const drawing = new Drawing();
    drawing.url = "data:image/png;base64,xx";
    drawing.width = 80;
    drawing.height = 40;
    const block = new Block();
    block.drawing = drawing;
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
    new WordStreamBuilder().buildStoryOnly(document);
    const node = document.words.head!;
    const selection = new Selection();
    selection.setRange(new SelRange(body, new CaretPos(body, node, false), new CaretPos(body, node, true)));
    const payload = fragment.extract(selection);
    expect(payload.empty).toBe(false);
    expect(payload.paragraphs[0].runs[0].drawing).toMatchObject({ url: drawing.url, width: 80, height: 40 });
  });

  it("流式框选同时包含表外文本和表格时按顺序保留全部块", () => {
    const document = new Document();
    const makePara = (id: number, text: string): Paragraph => {
      const p = new Paragraph(id);
      const b = new Block();
      b.text = text;
      p.addBlock(b);
      return p;
    };
    const makeTable = (id: number, cells: string[]): Paragraph => {
      const table = new Table();
      table.columns = cells.map(() => {
        const col = new TableColumn();
        col.width = 80;
        return col;
      });
      const row = new TableRow();
      cells.forEach((value, colIndex) => {
        const cellDoc = new Document();
        cellDoc.kind = "cell";
        cellDoc.addParagraph(makePara(1, value));
        new WordStreamBuilder().buildStoryOnly(cellDoc);
        const cell = new TableCell(cellDoc);
        cell.rowIndex = 0;
        cell.colIndex = colIndex;
        row.cells.push(cell);
      });
      table.rows.push(row);
      const p = new Paragraph(id);
      p.isTable = true;
      p.table = table;
      return p;
    };

    document.addParagraph(makePara(1, "表前文本"));
    document.addParagraph(makeTable(2, ["A1", "B1"]));
    document.addParagraph(makePara(3, "表中文本"));
    document.addParagraph(makeTable(4, ["C1", "D1"]));
    document.addParagraph(makePara(5, "表后文本"));
    new WordStreamBuilder().buildStoryOnly(document);

    const selection = new Selection();
    selection.setFlow(new CaretPos(body, document.words.head, false), new CaretPos(body, document.words.tail, false));
    const payload = fragment.extract(selection, undefined, { document, story: body });
    expect(payload.blocks).toHaveLength(5);
    expect(payload.blocks?.map((b) => b.type)).toEqual(["paragraph", "table", "paragraph", "table", "paragraph"]);
    expect(payload.paragraphs.map((p) => p.runs.map((r) => r.text).join(""))).toEqual(["表前文本", "表中文本", "表后文本"]);
    expect(payload.text).toBe("表前文本\nA1\tB1\n表中文本\nC1\tD1\n表后文本");
  });
});
