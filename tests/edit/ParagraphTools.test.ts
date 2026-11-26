import { describe, expect, it } from "vitest";
import { AsianLayoutCommand, inspectAsianLayout } from "../../src/edit/AsianLayoutCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import { ParagraphBorderCommand, inspectParagraphBorders } from "../../src/edit/ParagraphBorderCommand";
import type { Relayout } from "../../src/edit/Relayout";
import { ShadingCommand, paragraphShadingHex } from "../../src/edit/ShadingCommand";
import { SortCommand, inspectSortTarget } from "../../src/edit/SortCommand";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import { SelRange } from "../../src/selection/SelRange";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

function buildParagraphs(lines: string[], bold = false): Document {
  const document = new Document();
  lines.forEach((line, index) => {
    const p = new Paragraph(index + 1);
    const b = new Block();
    b.text = line;
    if (bold) {
      b.style = { bold: true, color: "#1F4E79" };
    }
    p.addBlock(b);
    document.addParagraph(p);
  });
  new WordStreamBuilder().build(document);
  return document;
}

function makeCtx(document: Document, selection: Selection, mutator = new Mutator()): EditContext {
  return {
    mutator,
    relayout: { apply: () => false, findCellHost: () => null } as unknown as Relayout,
    selection,
    documentOf: () => document,
    afterEdit: () => undefined,
  };
}

describe("AsianLayoutCommand", () => {
  it("支持双行合一/调整宽度/合并字符/纵横混排，保留样式，支持移除和 undo/redo", () => {
    const document = buildParagraphs(["中文版式AB"], true);
    const selection = new Selection();
    const nodes: NonNullable<typeof document.words.head>[] = [];
    let cur = document.words.head;
    while (cur) {
      nodes.push(cur);
      cur = cur.next;
    }
    // 选中 "中文版式"
    selection.setRange(new SelRange(body, new CaretPos(body, nodes[0], false), new CaretPos(body, nodes[3], true)));
    const mutator = new Mutator();
    const ctx = makeCtx(document, selection, mutator);
    const history = new History();

    expect(inspectAsianLayout(ctx).text).toBe("中文版式");
    expect(inspectAsianLayout(ctx).active).toBe(false);

    history.do(
      new AsianLayoutCommand(ctx, {
        type: "apply",
        text: "中文版式",
        spec: { kind: "twoInOne", brackets: "round" },
      }),
    );

    const headWord = document.words.head!.data;
    expect(headWord.char).toBe("中文版式");
    expect(headWord.block?.asianLayout).toEqual({ kind: "twoInOne", brackets: "round" });
    expect(headWord.block?.style.bold).toBe(true);
    expect(inspectAsianLayout(ctx).active).toBe(true);

    // 之后继续输入普通字符不继承中文版式
    const typed = mutator.insert(document, body, selection.caret()!, "X");
    expect(typed.caret.node?.data.block?.asianLayout).toBeUndefined();

    // 选中带中文版式的节点并清除
    selection.setRange(
      new SelRange(body, new CaretPos(body, document.words.head, false), new CaretPos(body, document.words.head, true)),
    );
    history.do(new AsianLayoutCommand(ctx, { type: "remove" }));
    expect(document.words.head!.data.block?.asianLayout).toBeUndefined();
    expect(document.paragraphs.head!.data.getFullText()).toBe("中文版式XAB");

    history.undo();
    expect(document.words.head!.data.block?.asianLayout).toEqual({ kind: "twoInOne", brackets: "round" });
  });
});

describe("SortCommand", () => {
  it("支持段落拼音/数字/日期排序及有标题行、支持撤销重做", () => {
    const document = buildParagraphs(["标题", "30", "5", "12"]);
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const ctx = makeCtx(document, selection);
    const history = new History();

    expect(inspectSortTarget(ctx).count).toBe(4);
    history.do(new SortCommand(ctx, { order: "asc", kind: "number", hasHeader: true }));
    expect(document.paragraphText()).toEqual(["标题", "5", "12", "30"]);

    history.do(new SortCommand(ctx, { order: "desc", kind: "number", hasHeader: true }));
    expect(document.paragraphText()).toEqual(["标题", "30", "12", "5"]);

    history.undo();
    expect(document.paragraphText()).toEqual(["标题", "5", "12", "30"]);

    history.undo();
    expect(document.paragraphText()).toEqual(["标题", "30", "5", "12"]);

    history.redo();
    expect(document.paragraphText()).toEqual(["标题", "5", "12", "30"]);
  });

  it("支持表格行按指定列排序并撤销重做", () => {
    const document = new Document();
    const hostP = new Paragraph(1);
    hostP.isTable = true;
    const table = new Table();
    table.columns = [new TableColumn(), new TableColumn()];
    const makeRow = (rIdx: number, name: string, date: string) => {
      const row = new TableRow();
      const c0 = new TableCell(buildParagraphs([name]));
      c0.rowIndex = rIdx;
      c0.colIndex = 0;
      const c1 = new TableCell(buildParagraphs([date]));
      c1.rowIndex = rIdx;
      c1.colIndex = 1;
      row.cells = [c0, c1];
      return row;
    };
    table.rows = [
      makeRow(0, "名称", "日期"),
      makeRow(1, "乙", "2026-05-01"),
      makeRow(2, "甲", "2026-01-15"),
    ];
    hostP.table = table;
    document.addParagraph(hostP);
    new WordStreamBuilder().build(document);

    const selection = new Selection();
    const ctx = makeCtx(document, selection);
    const history = new History();

    history.do(
      new SortCommand(
        ctx,
        { order: "asc", kind: "date", hasHeader: true, columnIndex: 1 },
        { table, story: body, paragraph: hostP, colIndex: 1 },
      ),
    );
    expect(table.rows.map((r) => r.cells[0].document.paragraphText()[0])).toEqual(["名称", "甲", "乙"]);
    expect(table.rows[1].cells[0].rowIndex).toBe(1);

    history.undo();
    expect(table.rows.map((r) => r.cells[0].document.paragraphText()[0])).toEqual(["名称", "乙", "甲"]);
  });
});

describe("ShadingCommand & ParagraphBorderCommand", () => {
  it("支持段落底纹与表格单元格底纹设置/清除及 undo/redo", () => {
    const document = buildParagraphs(["第一段", "第二段"]);
    const paras = document.paragraphs.toArray();
    const selection = new Selection();
    const ctx = makeCtx(document, selection);
    const history = new History();

    history.do(new ShadingCommand(ctx, { kind: "paragraphs", paragraphs: paras, story: body }, "#E7E6E6"));
    expect(paragraphShadingHex(paras[0].attrs.shading)).toBe("#E7E6E6");
    expect(paragraphShadingHex(paras[1].attrs.shading)).toBe("#E7E6E6");

    history.do(new ShadingCommand(ctx, { kind: "paragraphs", paragraphs: paras, story: body }, "none"));
    expect(paragraphShadingHex(paras[0].attrs.shading)).toBe("none");

    history.undo();
    expect(paragraphShadingHex(paras[0].attrs.shading)).toBe("#E7E6E6");

    const cell = new TableCell(new Document());
    history.do(new ShadingCommand(ctx, { kind: "cells", cells: [cell], story: body }, "#FFC000"));
    expect(cell.fill).toBe("#FFC000");
    history.undo();
    expect(cell.fill).toBeUndefined();
  });

  it("支持段落边框 all/outside/top 开关/none 清除及 undo/redo", () => {
    const document = buildParagraphs(["第一段", "第二段"]);
    const paras = document.paragraphs.toArray();
    const selection = new Selection();
    const ctx = makeCtx(document, selection);
    const history = new History();
    const pen = { type: "single", size: "12", color: "#000000" };

    history.do(new ParagraphBorderCommand(ctx, body, paras, "all", pen));
    expect(inspectParagraphBorders(paras).all).toBe(true);
    expect(paras[0].attrs.borderTop?.sz).toBe("12");
    expect(paras[0].attrs.borderBetween?.sz).toBe("12");
    expect(paras[1].attrs.borderBottom?.sz).toBe("12");

    // 再次点击上框线同笔型会切换关闭上框线
    history.do(new ParagraphBorderCommand(ctx, body, paras, "top", pen));
    expect(paras[0].attrs.borderTop).toBeUndefined();
    expect(inspectParagraphBorders(paras).top).toBe(false);

    history.undo();
    expect(inspectParagraphBorders(paras).top).toBe(true);

    history.do(new ParagraphBorderCommand(ctx, body, paras, "none", pen));
    expect(inspectParagraphBorders(paras).outside).toBe(false);
    expect(paras[0].attrs.borderBetween).toBeUndefined();
  });
});
