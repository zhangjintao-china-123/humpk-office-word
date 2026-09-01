import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelRange } from "../../src/selection/SelRange";
import { Selection } from "../../src/selection/Selection";
import { SelectionText } from "../../src/selection/SelectionText";
import type { StoryRef } from "../../src/selection/StoryRef";
import { Clipboard } from "../../src/edit/Clipboard";
import { ClipboardPayload } from "../../src/edit/ClipboardPayload";
import type { EditContext } from "../../src/edit/EditContext";
import { DeleteCommand } from "../../src/edit/DeleteCommand";
import { History } from "../../src/edit/History";
import { InsertCommand } from "../../src/edit/InsertCommand";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { SelectionFragment } from "../../src/selection/SelectionFragment";

const body: StoryRef = { slot: "body" };
const selectionText = new SelectionText();

function doc(value: string): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = value;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function join(document: Document): string {
  return new WordStreamBuilder().joinText(document);
}

function makeCell(value: string, row = 0, col = 0): TableCell {
  const cell = new TableCell(doc(value));
  cell.rowIndex = row;
  cell.colIndex = col;
  return cell;
}

function selectCell(cell: TableCell): Selection {
  const story: StoryRef = { slot: "cell", cell };
  const pos = new CaretPos(story, cell.document.words.head, false);
  const selection = new Selection();
  selection.setRange(new SelRange(story, pos, pos, "cell"));
  return selection;
}

function memoryClipboard(): Clipboard {
  return new Clipboard({
    writeText: async () => undefined,
    readText: async () => {
      throw new Error("memory");
    },
  });
}

function context(selection: Selection, resolve: (story: StoryRef) => Document | null): EditContext {
  return {
    mutator: new Mutator(),
    relayout: { apply: () => false } as unknown as Relayout,
    selection,
    documentOf: resolve,
    afterEdit: () => undefined,
  };
}

describe("Clipboard", () => {
  it("写入失败时仍可读内存副本", async () => {
    const clipboard = new Clipboard({
      writeText: async () => {
        throw new Error("denied");
      },
      readText: async () => {
        throw new Error("denied");
      },
    });
    await clipboard.writeText("hello");
    expect(await clipboard.readText()).toBe("hello");
  });

  it("系统读成功则覆盖内存", async () => {
    const clipboard = new Clipboard({
      writeText: async () => undefined,
      readText: async () => "from-system",
    });
    await clipboard.writeText("local");
    expect(await clipboard.readText()).toBe("from-system");
  });
});

describe("剪贴板动作", () => {
  it("剪切文本后 undo 还原", async () => {
    const document = doc("abcd");
    const selection = new Selection();
    const start = new CaretPos(body, document.words.head, false);
    const end = new CaretPos(body, document.words.head!.next!.next, true);
    selection.setRange(new SelRange(body, start, end));
    const ctx = context(selection, () => document);
    const history = new History();
    const clipboard = memoryClipboard();
    await clipboard.writeText(selectionText.extract(selection));
    history.do(new DeleteCommand(ctx, "backward"));
    expect(join(document)).toBe("d\n");
    expect(await clipboard.readText()).toBe("abc");
    history.undo();
    expect(join(document)).toBe("abcd\n");
  });

  it("粘贴替换选中文本；空剪贴板不插入", async () => {
    const document = doc("ab");
    const selection = new Selection();
    const start = new CaretPos(body, document.words.head, false);
    const end = new CaretPos(body, document.words.head, true);
    selection.setRange(new SelRange(body, start, end));
    const ctx = context(selection, () => document);
    const history = new History();
    const clipboard = memoryClipboard();
    expect(await clipboard.readText()).toBe("");
    const empty = await clipboard.readText();
    if (empty) {
      history.do(new InsertCommand(ctx, empty));
    }
    expect(join(document)).toBe("ab\n");
    await clipboard.writeText("XY");
    history.do(new InsertCommand(ctx, await clipboard.readText()));
    expect(join(document)).toBe("XYb\n");
  });

  it("整格删除清空内容并保留空段，undo 还原", () => {
    const cell = makeCell("hello");
    const selection = selectCell(cell);
    const ctx = context(selection, (story) => (story.slot === "cell" ? story.cell.document : null));
    const history = new History();
    history.do(new DeleteCommand(ctx, "backward"));
    expect(join(cell.document)).toBe("\n");
    expect(cell.document.paragraphs.length).toBe(1);
    history.undo();
    expect(join(cell.document)).toBe("hello\n");
  });

  it("粘贴保留加粗与颜色", async () => {
    const source = doc("ab");
    source.words.head!.data.block!.style = { bold: true, color: "#C00000" };
    source.words.head!.next!.data.block = source.words.head!.data.block;
    const selection = new Selection();
    selection.setRange(
      new SelRange(body, new CaretPos(body, source.words.head, false), new CaretPos(body, source.words.head!.next, true)),
    );
    const clipboard = memoryClipboard();
    await clipboard.write(new SelectionFragment().extract(selection));

    const target = doc("x");
    const dest = new Selection();
    dest.collapse(new CaretPos(body, target.words.head, true));
    const ctx = context(dest, () => target);
    new History().do(new InsertCommand(ctx, await clipboard.read()));
    const inserted = target.words.head!.next!;
    expect(join(target)).toBe("xab\n");
    expect(inserted.data.getStyle()?.bold).toBe(true);
    expect(inserted.data.getStyle()?.color).toBe("#C00000");
    expect(inserted.next!.data.getStyle()?.bold).toBe(true);
  });

  it("多段粘贴带上后段对齐", async () => {
    const payload = new ClipboardPayload("上\n下", [
      { attrs: {}, runs: [{ text: "上", style: { bold: true } }] },
      { attrs: { textAlign: "center" }, runs: [{ text: "下", style: { italic: true } }] },
    ]);
    const document = doc("x");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, true));
    const ctx = context(selection, () => document);
    new History().do(new InsertCommand(ctx, payload));
    expect(join(document)).toBe("x上\n下\n");
    expect(document.paragraphs.head!.next!.data.attrs.textAlign).toBe("center");
    let node = document.words.head;
    while (node && node.data.char !== "下") {
      node = node.next;
    }
    expect(node?.data.getStyle()?.italic).toBe(true);
  });

  it("复制单元格后粘贴为表格而不是 TSV 文本", async () => {
    const source = new Table();
    const widths = [80, 80];
    source.columns = widths.map((width) => {
      const column = new TableColumn();
      column.width = width;
      return column;
    });
    const labels = [
      ["A1", "B1"],
      ["A2", "B2"],
    ];
    const cells: TableCell[] = [];
    labels.forEach((rowLabels, rowIndex) => {
      const row = new TableRow();
      rowLabels.forEach((label, colIndex) => {
        const cell = makeCell(label, rowIndex, colIndex);
        row.cells.push(cell);
        cells.push(cell);
      });
      source.rows.push(row);
    });
    const selection = new Selection();
    for (const cell of cells) {
      const story: StoryRef = { slot: "cell", cell };
      const pos = new CaretPos(story, cell.document.words.head, false);
      selection.addRange(new SelRange(story, pos, pos, "cell"));
    }
    const payload = new SelectionFragment().extract(selection, source);
    expect(payload.table?.rows).toHaveLength(2);
    expect(payload.text).toBe("A1\tB1\nA2\tB2");

    const document = doc("x");
    const dest = new Selection();
    dest.collapse(new CaretPos(body, document.words.head, true));
    const ctx = context(dest, () => document);
    const history = new History();
    history.do(new InsertCommand(ctx, payload));
    const paras = document.paragraphs.toArray();
    const tablePara = paras.find((paragraph) => paragraph.isTable);
    expect(tablePara?.table?.rows).toHaveLength(2);
    expect(tablePara?.table?.rows[0].cells[0].document.paragraphText()).toEqual(["A1"]);
    expect(tablePara?.table?.rows[1].cells[1].document.paragraphText()).toEqual(["B2"]);
    expect(join(document).includes("A1\tB1")).toBe(false);
    history.undo();
    expect(document.paragraphs.toArray().some((paragraph) => paragraph.isTable)).toBe(false);
    expect(join(document)).toBe("x\n");
  });

  it("整格粘贴替换格内容", async () => {
    const cell = makeCell("old");
    const selection = selectCell(cell);
    const ctx = context(selection, (story) => (story.slot === "cell" ? story.cell.document : null));
    const history = new History();
    history.do(new InsertCommand(ctx, "new"));
    expect(join(cell.document)).toBe("new\n");
    history.undo();
    expect(join(cell.document)).toBe("old\n");
  });
});
