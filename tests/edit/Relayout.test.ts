import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { CaretPos } from "../../src/selection/CaretPos";
import type { StoryRef } from "../../src/selection/StoryRef";
import { Mutator } from "../../src/edit/Mutator";
import { Relayout, type RelayoutHost } from "../../src/edit/Relayout";
import { PageSetup } from "../../src/render/page/PageSetup";

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

describe("StoryLayout.reflow", () => {
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
