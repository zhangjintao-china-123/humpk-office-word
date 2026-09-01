import { describe, expect, it, vi } from "vitest";
import { EditorBase } from "../../src/editor/EditorBase";
import { EditorEvents } from "../../src/editor/types/EditorEvents";
import type { IDraw } from "../../src/editor/types/IDraw";
import type { IViewport } from "../../src/editor/types/IViewport";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Section } from "../../src/model/document/Section";
import { Rect } from "../../src/shared/geometry/Rect";

function fakeDraw(): IDraw {
  return {
    clear: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
  };
}

function fakeViewport(): IViewport {
  return {
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    cssToWorld: (x, y) => ({ x, y }),
    worldToCss: (x, y) => ({ x, y }),
  };
}

function docWithText(text: string): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  return document;
}

class ProbeEditor extends EditorBase {
  layoutCount = 0;
  renderCount = 0;

  protected override onLayout(): void {
    this.layoutCount += 1;
  }

  protected override onRender(): void {
    this.renderCount += 1;
  }
}

describe("EditorBase", () => {
  it("load 绑定文档，空 words 只拆当前 Story", () => {
    const editor = new EditorBase({ draw: fakeDraw(), viewport: fakeViewport() });
    const document = docWithText("你好");
    editor.load(document);

    expect(editor.document).toBe(document);
    expect(document.words.length).toBe(3);
    expect(document.words.toArray().map((word) => word.char).join("")).toBe("你好\n");
  });

  it("load 不递归拆页眉，留给对应 Editor", () => {
    const editor = new EditorBase({ draw: fakeDraw(), viewport: fakeViewport() });
    const document = docWithText("正文");
    const header = docWithText("页眉");
    const section = new Section();
    section.headers.set("default", header);
    document.sections.push(section);

    editor.load(document);

    expect(document.words.length).toBeGreaterThan(0);
    expect(header.words.length).toBe(0);
  });

  it("requestLayout 后 flush 只排一次，未 attach 不渲染", () => {
    const editor = new ProbeEditor({ draw: fakeDraw(), viewport: fakeViewport() });
    editor.load(docWithText("a"));
    editor.flush();
    editor.flush();

    expect(editor.layoutCount).toBe(1);
    expect(editor.renderCount).toBe(0);
  });

  it("attach 后再 flush 会走 onRender，随后不再重复", () => {
    const editor = new ProbeEditor({ draw: fakeDraw(), viewport: fakeViewport() });
    const rendered: unknown[] = [];
    editor.on(EditorEvents.render, () => rendered.push(true));
    editor.load(docWithText("a"));
    editor.attach();
    editor.flush();
    editor.flush();

    expect(editor.layoutCount).toBe(1);
    expect(editor.renderCount).toBe(1);
    expect(rendered).toHaveLength(1);
  });

  it("absBox 累加 parent，contains 用绝对坐标", () => {
    const parent = new EditorBase({
      draw: fakeDraw(),
      viewport: fakeViewport(),
      box: new Rect(100, 40, 400, 300),
    });
    const child = new EditorBase({
      draw: fakeDraw(),
      viewport: fakeViewport(),
      box: new Rect(20, 10, 80, 30),
      parent,
    });

    expect(child.absBox()).toEqual(new Rect(120, 50, 80, 30));
    expect(child.contains(120, 50)).toBe(true);
    expect(child.contains(10, 10)).toBe(false);
  });

  it("dispose 后 flush 空操作，document 清空", () => {
    const editor = new ProbeEditor({ draw: fakeDraw(), viewport: fakeViewport() });
    editor.attach();
    editor.load(docWithText("a"));
    editor.flush();
    editor.dispose();
    editor.requestLayout();
    editor.flush();

    expect(editor.document).toBeNull();
    expect(editor.isDisposed).toBe(true);
    expect(editor.layoutCount).toBe(1);
    expect(editor.renderCount).toBe(1);
  });
});
