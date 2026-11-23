import { describe, expect, it } from "vitest";
import { DeleteCommand } from "../../src/edit/DeleteCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableRow } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { caretRank, coverFlow, moveInFlow } from "../../src/selection/MainWalk";
import { Selection } from "../../src/selection/Selection";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

function textDoc(text: string): Document {
  const document = new Document();
  document.kind = "cell";
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function cellOf(text: string, row: number, col: number): TableCell {
  const cell = new TableCell(textDoc(text));
  cell.rowIndex = row;
  cell.colIndex = col;
  return cell;
}

function sample(): { document: Document; cells: TableCell[] } {
  const document = new Document();
  const before = new Paragraph(1);
  const beforeBlock = new Block();
  beforeBlock.text = "AB";
  before.addBlock(beforeBlock);
  document.addParagraph(before);
  const cells = [cellOf("a", 0, 0), cellOf("b", 0, 1), cellOf("c", 1, 0), cellOf("d", 1, 1)];
  const table = new Table();
  table.rows = [new TableRow(), new TableRow()];
  table.rows[0].cells = [cells[0], cells[1]];
  table.rows[1].cells = [cells[2], cells[3]];
  const tablePara = new Paragraph(2);
  tablePara.isTable = true;
  tablePara.table = table;
  document.addParagraph(tablePara);
  const after = new Paragraph(3);
  const afterBlock = new Block();
  afterBlock.text = "YZ";
  after.addBlock(afterBlock);
  document.addParagraph(after);
  new WordStreamBuilder().buildStoryOnly(document);
  return { document, cells };
}

describe("MainWalk", () => {
  it("表格前的字、格子、表格后的字按阅读顺序排", () => {
    const { document, cells } = sample();
    const first = document.words.head!;
    const after = [...walk(document)].find((node) => node.data.char === "Y")!;
    const rankBefore = caretRank(document, body, new CaretPos(body, first, false));
    const rankCell = caretRank(document, body, new CaretPos({ slot: "cell", cell: cells[0] }, cells[0].document.words.head, false));
    const rankLast = caretRank(document, body, new CaretPos({ slot: "cell", cell: cells[3] }, cells[3].document.words.head, false));
    const rankAfter = caretRank(document, body, new CaretPos(body, after, false));
    expect(rankBefore).toBeLessThan(rankCell!);
    expect(rankCell).toBeLessThan(rankLast!);
    expect(rankLast).toBeLessThan(rankAfter!);
  });

  it("从第一格中间拖到最后一格前面时，中间格子整格算进同一次选择", () => {
    const { document, cells } = sample();
    const cover = coverFlow(
      document,
      body,
      new CaretPos({ slot: "cell", cell: cells[0] }, cells[0].document.words.head, true),
      new CaretPos({ slot: "cell", cell: cells[3] }, cells[3].document.words.head, false),
    );
    expect(cover.fullCells.map((cell) => cell.document.paragraphText()[0])).toEqual(["b", "c"]);
    expect(cover.tables).toHaveLength(0);
    expect(cover.glyphs.some((item) => item.node.data.char === "a")).toBe(false);
    expect(cover.glyphs.some((item) => item.node.data.char === "d")).toBe(false);
  });

  it("起点和终点都在表格外面时，整张表单独成一块", () => {
    const { document } = sample();
    const head = document.words.head!;
    const tail = [...walk(document)].find((node) => node.data.char === "Z")!;
    const cover = coverFlow(document, body, new CaretPos(body, head, false), new CaretPos(body, tail, true));
    expect(cover.tables).toHaveLength(1);
    expect(cover.fullCells).toHaveLength(0);
  });

  it("方向键从正文走进第一格，再从最后一格走回正文", () => {
    const { document, cells } = sample();
    const enter = document.words.head!.next!.next!;
    const into = moveInFlow(document, body, new CaretPos(body, enter, false), 1);
    expect(into.story.slot).toBe("cell");
    expect(into.story.slot === "cell" && into.story.cell).toBe(cells[0]);
    const last = cells[3].document.words.tail!;
    const out = moveInFlow(document, body, new CaretPos({ slot: "cell", cell: cells[3] }, last, false), 1);
    expect(out.story.slot).toBe("body");
    expect(out.node?.data.char).toBe("Y");
  });

  it("删掉盖住整张表的选择后，表消失，前后文字还在", () => {
    const { document } = sample();
    const head = document.words.head!;
    const selection = new Selection();
    const beforeEnter = head.next!;
    const after = [...walk(document)].find((node) => node.data.char === "Y")!;
    selection.setFlow(new CaretPos(body, beforeEnter, true), new CaretPos(body, after, false));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: (story) => (story.slot === "body" ? document : story.slot === "cell" ? story.cell.document : null),
      flowOwner: () => ({ document, story: body }),
      afterEdit: () => undefined,
    };
    new History().do(new DeleteCommand(ctx, "backward"));
    expect(document.paragraphs.toArray().some((paragraph) => paragraph.isTable)).toBe(false);
    expect(document.paragraphText().join("")).toBe("ABYZ");
  });
});

function walk(document: Document) {
  const nodes = [];
  let node = document.words.head;
  while (node) {
    nodes.push(node);
    node = node.next;
  }
  return nodes;
}
