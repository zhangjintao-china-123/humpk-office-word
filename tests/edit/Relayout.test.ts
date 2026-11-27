import { describe, expect, it, vi } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { Paginator } from "../../src/layout/page/Paginator";
import { CaretPos } from "../../src/selection/CaretPos";
import type { StoryRef } from "../../src/selection/StoryRef";
import { Mutator } from "../../src/edit/Mutator";
import { Relayout, type RelayoutHost } from "../../src/edit/Relayout";
import { PageSetup } from "../../src/render/page/PageSetup";
import type { Line } from "../../src/model/line/Line";

function paragraph(text: string, id: number): Paragraph {
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

function constraints(width = 200, pageHeight = 400) {
  return {
    contentWidth: width,
    contentHeight: pageHeight,
    measurer: new FallbackMeasurer(),
    paginate: true as const,
  };
}

function geometry(lines: Line[]) {
  return lines.map((line) => [
    line.paragraph?.id, line.type, line.top, line.height, line.beforeHeight, line.afterHeight,
    line.tableRowFrom, line.tableRowTo, line.tableClipTop,
    Array.from({ length: line.length }, (_, index) => {
      const word = line.getWord(index);
      return [word?.char, word?.left, word?.kernedWidth];
    }),
  ]);
}

describe("StoryLayout.reflow", () => {
  it("反复分页能还原页首段前距和跨段合并的间距", () => {
    const document = doc(...Array.from({ length: 18 }, () => "这是一段普通测试文字"));
    document.paragraphs.each(({ data }, index) => {
      data.attrs = {
        before: index % 3 === 1 ? "250" : "120",
        after: index % 3 === 2 ? "430" : "80",
        keepNext: index % 4 === 1 ? "1" : undefined,
      };
    });
    const layout = new StoryLayout();
    const settings = constraints(115, 83);
    const initial = geometry(layout.layout(document, settings));
    const reflowed = layout.reflow(document, settings, []);
    expect(geometry(reflowed)).toEqual(initial);
    expect(geometry(layout.reflow(document, settings, [], reflowed))).toEqual(initial);
  });

  it.each([false, true])("普通文本取得相同的完整排版结果，复用旧分页与行对象（行尾 %s）", (append) => {
    const document = doc("上一段", "居中的标题 12", "下一段");
    const paragraph = document.paragraphs.head!.next!.data;
    paragraph.attrs = { textAlign: "center", before: "240", after: "220" };
    const settings = constraints(260, 120);
    const engine = new StoryLayout();
    const previous = new StoryLayout().layout(document, settings);
    const before = geometry(previous);
    const line = paragraph.lines[0];
    const body: StoryRef = { slot: "body" };
    const mutator = new Mutator();
    const paginate = vi.spyOn(Paginator.prototype, "paginate");
    try {
      const node = append ? line.getLastNode() : line.getNode(2);
      const patch = mutator.insert(document, body, new CaretPos(body, node, false), "中A");
      const reflow = (impact = patch.impact) => engine.reflow(document, settings, impact.dirty, previous, impact.textAnchor);
      expect(reflow()).toBe(previous);
      expect(paragraph.lines[0]).toBe(line);
      const edited = geometry(previous);
      expect(edited).not.toEqual(before);
      expect(reflow(mutator.invert(document, patch))).toBe(previous);
      expect(geometry(previous)).toEqual(before);
      expect(reflow(mutator.replay(document, patch))).toBe(previous);
      expect(geometry(previous)).toEqual(edited);
      expect(paginate).not.toHaveBeenCalled();
      expect(geometry(new StoryLayout().layout(document, settings))).toEqual(edited);
    } finally {
      paginate.mockRestore();
    }
  });

  it.each(["wrap", "height"] as const)("输入改变 %s 时重新分页并匹配完整排版", (change) => {
    const document = doc("上一段", "正在输入", "下一段");
    const paragraph = document.paragraphs.head!.next!.data;
    const settings = constraints(92, 90);
    const engine = new StoryLayout();
    const previous = engine.layout(document, settings);
    const initial = geometry(previous);
    const mutator = new Mutator();
    const body: StoryRef = { slot: "body" };
    const end = new CaretPos(body, paragraph.lines.at(-1)!.getLastNode(), false);
    const patch = change === "wrap"
      ? mutator.insert(document, body, end, "字".repeat(34))
      : mutator.insert(document, body, end, "字", { fontSizePx: 26 });
    const reflowed = engine.reflow(document, settings, patch.impact.dirty, previous, patch.impact.textAnchor);
    expect(reflowed).not.toBe(previous);
    const edited = geometry(reflowed);
    const undo = mutator.invert(document, patch);
    const undone = engine.reflow(document, settings, undo.dirty, reflowed, undo.textAnchor);
    expect(geometry(undone)).toEqual(initial);
    const redo = mutator.replay(document, patch);
    expect(geometry(engine.reflow(document, settings, redo.dirty, undone, redo.textAnchor))).toEqual(edited);
    expect(geometry(new StoryLayout().layout(document, settings))).toEqual(edited);
  });

  it("改第二段时第一段 Line 仍是原对象，后续 top 跟着加高", () => {
    const document = doc("第一段", "第二段");
    const engine = new StoryLayout();
    const firstLayout = engine.layout(document, constraints());
    const firstLine = document.paragraphs.head!.data.lines[0];
    const lastTop = firstLayout.at(-1)!.top;

    const body: StoryRef = { slot: "body" };
    const second = document.paragraphs.head!.next!.data;
    let node = document.words.head;
    while (node && node.data.paragraph !== second) {
      node = node.next;
    }
    const patch = new Mutator().insert(document, body, new CaretPos(body, node, false), "\n");
    const next = engine.reflow(document, constraints(), patch.impact.dirty);

    expect(document.paragraphs.head!.data.lines[0]).toBe(firstLine);
    expect(next.at(-1)!.top).toBeGreaterThan(lastTop);
  });

  it("连续插入汉字后按页宽折行，不超出 contentWidth", () => {
    const document = doc("测");
    const engine = new StoryLayout();
    const width = 40;
    engine.layout(document, constraints(width));
    const body: StoryRef = { slot: "body" };
    const enter = document.words.tail;
    const mutator = new Mutator();
    let pos = new CaretPos(body, enter, false);
    for (const char of "试测试测试测试测试测试") {
      const patch = mutator.insert(document, body, pos, char);
      engine.reflow(document, constraints(width), patch.impact.dirty);
      pos = patch.caret;
    }
    const lines = document.paragraphs.head!.data.lines.filter((line) => line.type === "");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      let node = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        if (!node) {
          break;
        }
        const word = node.data;
        if (!word.isEnterChar()) {
          expect(word.left + word.kernedWidth).toBeLessThanOrEqual(width + 0.5);
        }
        node = node.next;
      }
    }
  });
});

describe("Relayout 单元格冒泡", () => {
  it("内容变矮但未低于最小行高时正文 table 段不标脏", () => {
    const inner = new Document();
    inner.kind = "cell";
    inner.addParagraph(paragraph("格", 1));
    const table = new Table();
    const col = new TableColumn();
    col.width = 80;
    table.columns.push(col);
    const row = new TableRow();
    const cell = new TableCell(inner);
    row.cells.push(cell);
    table.rows.push(row);

    const bodyDoc = new Document();
    const tablePara = new Paragraph(1);
    tablePara.isTable = true;
    tablePara.table = table;
    bodyDoc.addParagraph(tablePara);
    new WordStreamBuilder().buildStoryOnly(bodyDoc);
    new StoryLayout().layout(bodyDoc, constraints(200, 400));
    tablePara.changed = false;
    const rowHeight = table.rowHeights[0];

    const body: StoryRef = { slot: "body" };
    const cellStory: StoryRef = { slot: "cell", cell };
    const host: RelayoutHost = {
      pageSetup: new PageSetup({ width: 400, height: 400, leftMargin: 40, rightMargin: 40, headerHeight: 20, footerHeight: 20 }),
      documentOf(story) {
        if (story.slot === "cell") {
          return story.cell.document;
        }
        return bodyDoc;
      },
      editorOf() {
        return undefined;
      },
      stories() {
        return [{ story: body, document: bodyDoc }];
      },
      afterBodyLayout() {},
    };

    const first = inner.words.head;
    const impact = new Mutator().insert(inner, cellStory, new CaretPos(cellStory, first, false), "x").impact;
    const relayout = new Relayout(host);
    const bubbled = relayout.apply(impact);
    expect(bubbled).toBe(false);
    expect(tablePara.changed).toBe(false);
    expect(table.rowHeights[0]).toBe(rowHeight);
  });
});
