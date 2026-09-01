import { describe, expect, it } from "vitest";
import { BodyEditor } from "../../src/editor/BodyEditor";
import type { IDraw } from "../../src/editor/types/IDraw";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Viewport } from "../../src/render/canvas/Viewport";
import { PageSetup } from "../../src/render/page/PageSetup";

function docWithParagraphs(...texts: string[]): Document {
  const document = new Document();
  texts.forEach((text, index) => {
    const paragraph = new Paragraph(index + 1);
    const block = new Block();
    block.text = text;
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
  });
  return document;
}

function fakeDraw(): IDraw {
  return {
    clear() {},
    save() {},
    restore() {},
    translate() {},
  };
}

function createEditor(pageHeight = 200) {
  const pageSetup = new PageSetup({
    width: 400,
    height: pageHeight,
    leftMargin: 40,
    rightMargin: 40,
    headerHeight: 20,
    footerHeight: 20,
    pageGap: 10,
  });
  const editor = new BodyEditor({
    draw: fakeDraw(),
    viewport: new Viewport(),
    pageSetup,
  });
  return editor;
}

describe("StoryEditor 排版", () => {
  it("一段一行（短文本）", () => {
    const editor = createEditor();
    editor.attach().load(docWithParagraphs("你好", "世界")).flush();
    expect(editor.lines.length).toBeGreaterThanOrEqual(2);
    expect(editor.lines[0].paragraph?.getFullText()).toBe("你好");
  });

  it("长文本会按宽度拆成多行", () => {
    const editor = createEditor();
    const long = "测试".repeat(80);
    editor.attach().load(docWithParagraphs(long)).flush();
    expect(editor.lines.length).toBeGreaterThan(1);
  });

  it("内容超过一页时 pageCount > 1", () => {
    const editor = createEditor(80);
    const texts = Array.from({ length: 20 }, (_, i) => `第${i}段内容`);
    editor.attach().load(docWithParagraphs(...texts)).flush();
    expect(editor.pageCount()).toBeGreaterThan(1);
  });
});
