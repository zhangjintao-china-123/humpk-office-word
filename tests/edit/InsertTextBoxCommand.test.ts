import { describe, expect, it } from "vitest";
import { InsertTextBoxCommand } from "../../src/edit/InsertTextBoxCommand";
import { History } from "../../src/edit/History";
import { InsertCommand } from "../../src/edit/InsertCommand";
import { Mutator } from "../../src/edit/Mutator";
import type { EditContext } from "../../src/edit/EditContext";
import type { Relayout } from "../../src/edit/Relayout";
import type { StoryEditor } from "../../src/editor/StoryEditor";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { PageSetup } from "../../src/render/page/PageSetup";
import { CaretPos } from "../../src/selection/CaretPos";
import { HitTester } from "../../src/selection/HitTester";
import { Selection } from "../../src/selection/Selection";
import { Rect } from "../../src/shared/geometry/Rect";

function fixture(withBody = true) {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const body = new Block();
  body.text = "原有正文";
  paragraph.addBlock(body);
  if (withBody) {
    document.addParagraph(paragraph);
  }
  new WordStreamBuilder().build(document);
  const pageSetup = new PageSetup();
  const layout = new StoryLayout();
  const constraints = { contentWidth: pageSetup.contentWidth, contentHeight: pageSetup.contentHeight, measurer: new FallbackMeasurer() };
  const editor = { slot: "body", document, lines: layout.layout(document, constraints) } as unknown as StoryEditor;
  const relayout = () => { editor.lines = layout.layout(document, constraints); };
  const selection = new Selection();
  selection.collapse(new CaretPos({ slot: "body" }, document.words.head));
  const ctx: EditContext = {
    selection, mutator: new Mutator(),
    documentOf: (story) => story.slot === "textbox" ? story.block.drawing?.shape?.text ?? null : document,
    relayout: { apply: relayout, layoutStory: relayout } as unknown as Relayout,
    afterEdit: () => undefined,
  };
  return { ctx, document, paragraph, history: new History(), hitContext: { body: editor, pageSetup, origins: [{ x: 0, y: 0 }] } };
}

describe("插入文本框", () => {
  it("按绘制位置插入横排对象，正文节点和撤销重做保持一致", () => {
    const { ctx, document, paragraph, history } = fixture();
    const original = document.words.head;
    history.do(new InsertTextBoxCommand(ctx, "horizontal", new Rect(110, 72, 170, 76), paragraph));
    expect(document.words.head).toBe(original);
    expect(document.paragraphText()).toEqual(["原有正文"]);
    expect(document.anchors[0]).toMatchObject({ x: 110, y: 72, width: 170, height: 76 });
    expect(ctx.selection.caret()?.story.slot).toBe("textbox");
    history.do(new InsertCommand(ctx, "说明"));
    const story = document.anchors[0].drawing.shape!.text!;
    expect(story.paragraphText()).toEqual(["说明"]);

    history.undo();
    history.undo();
    expect(document.anchors).toHaveLength(0);
    expect(ctx.selection.caret()?.node).toBe(original);
    history.redo();
    history.redo();
    expect(document.anchors[0].drawing.shape!.text).toBe(story);
    expect(story.paragraphText()).toEqual(["说明"]);
  });

  it("竖排的点击和光标使用同一坐标，DOCX 回读保留方向和文字格式", async () => {
    const { ctx, document, paragraph, history, hitContext } = fixture();
    const bounds = new Rect(120, 70, 90, 160);
    history.do(new InsertTextBoxCommand(ctx, "vertical", bounds, paragraph));
    ctx.pendingRunStyle = () => ({ bold: true });
    history.do(new InsertCommand(ctx, "纵排测试"));
    const hit = new HitTester();
    const end = ctx.selection.caret()!;
    const caret = hit.caretBox(end, hitContext);
    expect(caret?.width).toBeGreaterThan(5);
    expect(caret?.height).toBe(1);
    const picked = hit.hit(caret!.x + caret!.width! / 2, caret!.y - 4, hitContext);
    expect(picked?.story.slot).toBe("textbox");
    expect(picked?.node?.data.char).toBe("试");

    const reopened = await new DocxReader().read(await new DocxWriter().write(document));
    const drawing = reopened.paragraphs.head!.data.blocks.find((block) => block.drawing)?.drawing;
    expect(drawing?.position).toBe("anchor");
    expect(drawing?.shape?.textDirection).toBe("vertical");
    expect(drawing?.shape?.text?.paragraphText()).toEqual(["纵排测试"]);
    expect(drawing?.shape?.text?.paragraphs.head?.data.blocks[0].style.bold).toBe(true);
  });

  it("没有正文段落时可插入，重做只恢复一个文本框", () => {
    const { ctx, document, history } = fixture(false);
    history.do(new InsertTextBoxCommand(ctx, "horizontal", new Rect(20, 30, 100, 60), null));
    expect(document.anchors).toHaveLength(1);
    history.undo();
    expect(document.paragraphs.length).toBe(0);
    history.redo();
    expect(document.anchors).toHaveLength(1);
  });
});
