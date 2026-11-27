import { describe, expect, it } from "vitest";
import type { EditContext } from "../../src/edit/EditContext";
import { DeleteCommand } from "../../src/edit/DeleteCommand";
import { History } from "../../src/edit/History";
import { InputController, type InputHost } from "../../src/edit/InputController";
import { Mutator } from "../../src/edit/Mutator";
import { OutlineCommand } from "../../src/edit/OutlineCommand";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { HitTester } from "../../src/selection/HitTester";
import { Selection } from "../../src/selection/Selection";
import { SelRange } from "../../src/selection/SelRange";
import type { StoryRef } from "../../src/selection/StoryRef";

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

function press(input: InputController, key: string, shift = false): void {
  input.el.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true }));
}

function hostOf(document: Document, selection: Selection): InputHost {
  const ctx: EditContext = {
    mutator: new Mutator(),
    relayout: { apply: () => false } as unknown as Relayout,
    selection,
    documentOf: () => document,
    afterEdit: () => undefined,
  };
  const history = new History();
  return {
    ...ctx,
    history,
    hitTester: new HitTester(),
    hitContext: () => ({ pageSetup: { contentHeight: 400 } as never, origins: [], body: undefined }),
    caretCss: () => null,
    caretWorld: () => null,
    onSelectionChange: () => undefined,
    requestSave: () => undefined,
    copy: () => undefined,
    cut: () => undefined,
    paste: () => undefined,
    deleteContent: (direction) => {
      history.do(new DeleteCommand(ctx, direction));
    },
  };
}

describe("InputController Shift 选区", () => {
  it("Shift+方向键从光标向右扩展，再向左收回", () => {
    const document = doc("abcd");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const input = new InputController(hostOf(document, selection));
    input.attach(globalThis.document.body);
    press(input, "ArrowRight", true);
    press(input, "ArrowRight", true);
    expect(selection.isCollapsed()).toBe(false);
    expect(selection.primaryRange()?.end.node).toBe(document.words.head!.next);
    expect(selection.primaryRange()?.end.after).toBe(true);
    press(input, "ArrowLeft", true);
    press(input, "ArrowLeft", true);
    expect(selection.isCollapsed()).toBe(true);
    input.detach();
  });

  it("已有选区时方向键左/右先折叠到选区两端", () => {
    const document = doc("abcd");
    const selection = new Selection();
    const start = new CaretPos(body, document.words.head, false);
    const end = new CaretPos(body, document.words.head!.next!.next, true);
    selection.setRange(new SelRange(body, start, end));
    const input = new InputController(hostOf(document, selection));
    input.attach(globalThis.document.body);
    press(input, "ArrowLeft");
    expect(selection.isCollapsed()).toBe(true);
    expect(selection.caret()?.equals(start)).toBe(true);
    selection.setRange(new SelRange(body, start, end));
    press(input, "ArrowRight");
    expect(selection.caret()?.equals(end)).toBe(true);
    input.detach();
  });
});

describe("InputController 表格 Tab 切换", () => {
  function tableHost(table: Table, selection: Selection): InputHost {
    const hostDoc = new Document();
    const tablePara = new Paragraph(1);
    tablePara.isTable = true;
    tablePara.table = table;
    hostDoc.addParagraph(tablePara);
    new WordStreamBuilder().buildStoryOnly(hostDoc);

    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: {
        apply: () => false,
        findCellHost: (target: TableCell) => {
          for (const row of table.rows) {
            if (row.cells.includes(target)) {
              return { table, paragraph: tablePara, parent: body };
            }
          }
          return undefined;
        },
      } as unknown as Relayout,
      selection,
      documentOf: (story) => (story.slot === "cell" ? story.cell.document : hostDoc),
      afterEdit: () => undefined,
    };
    const history = new History();
    return {
      ...ctx,
      history,
      hitTester: new HitTester(),
      hitContext: () => ({ pageSetup: { contentHeight: 400 } as never, origins: [], body: undefined }),
      caretCss: () => null,
      caretWorld: () => null,
      onSelectionChange: () => undefined,
      requestSave: () => undefined,
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteContent: (direction) => {
        history.do(new DeleteCommand(ctx, direction));
      },
    };
  }

  function makeCell(text: string, row: number, col: number): TableCell {
    const cell = new TableCell(doc(text));
    cell.rowIndex = row;
    cell.colIndex = col;
    return cell;
  }

  it("Tab 切到下一个单元格并选中文本，Shift+Tab 切回上一个，末格 Tab 自动加行且可撤销", () => {
    const table = new Table();
    table.columns = [new TableColumn(), new TableColumn()];
    const c00 = makeCell("A", 0, 0);
    const c01 = makeCell("BB", 0, 1);
    const c10 = makeCell("", 1, 0);
    const c11 = makeCell("D", 1, 1);
    const r0 = new TableRow();
    r0.cells = [c00, c01];
    const r1 = new TableRow();
    r1.cells = [c10, c11];
    table.rows = [r0, r1];

    const selection = new Selection();
    selection.collapse(new CaretPos({ slot: "cell", cell: c00 }, c00.document.words.head, false));
    const host = tableHost(table, selection);
    const input = new InputController(host);
    input.attach(globalThis.document.body);

    // 0,0 -> 0,1（有文字时选中内容）
    press(input, "Tab");
    expect(selection.primaryRange()?.story).toEqual({ slot: "cell", cell: c01 });
    expect(selection.isCollapsed()).toBe(false);

    // 0,1 -> 1,0（空格只折叠光标）
    press(input, "Tab");
    expect(selection.caret()?.story).toEqual({ slot: "cell", cell: c10 });
    expect(selection.isCollapsed()).toBe(true);

    // Shift+Tab 回到 0,1
    press(input, "Tab", true);
    expect(selection.primaryRange()?.story).toEqual({ slot: "cell", cell: c01 });

    // 到最后一格 1,1 再按 Tab 自动插入新行并跳到新行首格
    selection.collapse(new CaretPos({ slot: "cell", cell: c11 }, c11.document.words.head, false));
    press(input, "Tab");
    expect(table.rows).toHaveLength(3);
    expect(selection.caret()?.story).toEqual({ slot: "cell", cell: table.rows[2].cells[0] });

    // 撤销恢复为 2 行，光标回到 1,1
    host.history.undo();
    expect(table.rows).toHaveLength(2);
    expect(selection.caret()?.story).toEqual({ slot: "cell", cell: c11 });

    // 首页第一格按 Shift+Tab 不跳出表格
    selection.collapse(new CaretPos({ slot: "cell", cell: c00 }, c00.document.words.head, false));
    press(input, "Tab", true);
    expect(selection.caret()?.story).toEqual({ slot: "cell", cell: c00 });

    input.detach();
  });
});

describe("InputController 项目符号按键行为", () => {
  it("段首按 Backspace 取消项目符号而不合并前段，Tab/Shift+Tab 升降级，空段回车退出项目符号", () => {
    const document = new Document();
    const p1 = new Paragraph(1);
    const b1 = new Block();
    b1.text = "第一段";
    p1.addBlock(b1);
    const p2 = new Paragraph(2);
    const b2 = new Block();
    b2.text = "第二段";
    p2.addBlock(b2);
    document.addParagraph(p1);
    document.addParagraph(p2);
    new WordStreamBuilder().buildStoryOnly(document);

    const selection = new Selection();
    const p2Head = (() => {
      let node = document.words.head;
      while (node && node.data.paragraph !== p2) {
        node = node.next;
      }
      return node!;
    })();
    selection.collapse(new CaretPos(body, p2Head, false));
    const host = hostOf(document, selection);
    const input = new InputController(host);
    input.attach(globalThis.document.body);

    host.history.do(new OutlineCommand(host, { type: "bullet", symbol: "●" }));
    expect(p2.attrs.titleSerial?.label).toBe("● ");

    // Tab 降一级，Shift+Tab 升一级
    press(input, "Tab");
    expect(p2.attrs.ilvl).toBe("1");
    expect(p2.attrs.titleSerial?.label).toBe("○ ");
    press(input, "Tab", true);
    expect(p2.attrs.ilvl).toBe("0");
    expect(p2.attrs.titleSerial?.label).toBe("● ");

    // 段首 Backspace 取消项目符号，两段依然独立
    press(input, "Backspace");
    expect(p2.attrs.numId).toBeUndefined();
    expect(document.paragraphs.toArray()).toHaveLength(2);
    expect(p2.getFullText()).toBe("第二段");

    // 撤销恢复项目符号
    host.history.undo();
    expect(p2.attrs.titleSerial?.label).toBe("● ");

    input.detach();
  });
});
