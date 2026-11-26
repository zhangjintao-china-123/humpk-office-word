import { describe, expect, it } from "vitest";
import { FormatCommand } from "../../src/edit/FormatCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import type { RunStyle } from "../../src/model/style/RunStyle";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import { SelRange } from "../../src/selection/SelRange";
import type { StoryRef } from "../../src/selection/StoryRef";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";

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

describe("FormatCommand", () => {
  it("字符样式只影响所选文字，拆分 run 后按原顺序保存和回读", async () => {
    const document = doc("abcde");
    const selection = new Selection();
    const c = document.words.head!.next!.next!;
    selection.setRange(new SelRange(body, new CaretPos(body, c, false), new CaretPos(body, c, true)));
    const ctx: EditContext = {
      mutator: new Mutator(), selection,
      relayout: { apply: () => false } as unknown as Relayout,
      documentOf: () => document, afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "style", value: "intenseReference" }));
    expect(document.paragraphs.head!.data.blocks.map((block) => block.text)).toEqual(["ab", "c", "de"]);
    expect(c.data.block!.style).toMatchObject({ characterStyleId: "IntenseReference", smallCaps: true, bold: true });
    history.undo();
    expect(c.data.block!.style.characterStyleId).toBeUndefined();
    expect(document.paragraphText()).toEqual(["abcde"]);
    history.redo();

    const opened = await new DocxReader().read(await new DocxWriter().write(document));
    const paragraph = opened.paragraphs.head!.data;
    expect(paragraph.getFullText()).toBe("abcde");
    expect(paragraph.blocks.find((block) => block.text === "c")?.style).toMatchObject({
      characterStyleId: "IntenseReference", smallCaps: true,
    });
  });

  it("空段套用标题后，输入继承字号和级别，撤销和重做恢复段落格式", () => {
    const document = doc("");
    const selection = new Selection();
    const mark = document.words.head!;
    selection.collapse(new CaretPos(body, mark, false));
    const ctx: EditContext = {
      mutator: new Mutator(), selection,
      relayout: { apply: () => false } as unknown as Relayout,
      documentOf: () => document, afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "style", value: "heading2" }));
    expect(mark.data.getStyle()?.fontSizeHalfPoint).toBe(32);
    expect(mark.data.paragraph!.attrs).toMatchObject({ styleId: "Heading2", outlineLevel: 2 });
    history.undo();
    expect(mark.data.getStyle()?.fontSizeHalfPoint).toBeUndefined();
    expect(mark.data.paragraph!.attrs.outlineLevel).toBeUndefined();
    history.redo();
    const inserted = ctx.mutator.insert(document, body, selection.caret()!, "a");
    expect(inserted.caret.node?.data.getStyle()?.fontSizeHalfPoint).toBe(32);
  });

  it("清除局部字符格式时保留段落样式，选中整段则恢复正文", () => {
    const document = doc("ab");
    const selection = new Selection();
    const a = document.words.head!;
    const b = a.next!;
    const range = (end: typeof a): SelRange => new SelRange(body, new CaretPos(body, a, false), new CaretPos(body, end, true));
    const ctx: EditContext = {
      mutator: new Mutator(), selection,
      relayout: { apply: () => false } as unknown as Relayout,
      documentOf: () => document, afterEdit: () => undefined,
    };
    const history = new History();
    selection.setRange(range(b));
    history.do(new FormatCommand(ctx, { type: "style", value: "intenseQuote" }));
    history.do(new FormatCommand(ctx, { type: "fontSizePt", value: 30 }));
    selection.setRange(range(a));
    history.do(new FormatCommand(ctx, { type: "clear" }));
    expect(a.data.getStyle()?.fontSizeHalfPoint).toBeUndefined();
    expect(b.data.getStyle()?.fontSizeHalfPoint).toBe(60);
    expect(a.data.paragraph!.attrs.borderTop?.val).toBe("single");

    selection.setRange(range(b));
    history.do(new FormatCommand(ctx, { type: "clear" }));
    expect(a.data.paragraph!.attrs.styleId).toBe("Normal");
    expect(a.data.paragraph!.attrs.borderTop).toBeUndefined();
    expect(b.data.getStyle()?.fontSizeHalfPoint).toBe(24);
    history.undo();
    expect(a.data.paragraph!.attrs.styleId).toBe("IntenseQuote");
    expect(b.data.getStyle()?.fontSizeHalfPoint).toBe(60);
  });
  it("选中文字加粗，undo 后恢复", () => {
    const document = doc("ab");
    const selection = new Selection();
    const a = document.words.head!;
    const b = a.next!;
    selection.setRange(new SelRange(body, new CaretPos(body, a, false), new CaretPos(body, b, true)));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "bold" }));
    expect(a.data.getStyle()?.bold).toBe(true);
    expect(b.data.getStyle()?.bold).toBe(true);
    history.undo();
    expect(a.data.getStyle()?.bold).toBeFalsy();
  });

  it("折叠光标加粗写入 pending，随后插入的字带粗体", () => {
    const document = doc("a");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, true));
    let pending: RunStyle | undefined;
    const mutator = new Mutator();
    const ctx: EditContext = {
      mutator,
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
      pendingRunStyle: () => pending,
      setPendingRunStyle: (style) => {
        pending = style;
      },
    };
    new FormatCommand(ctx, { type: "bold" }).do();
    expect(pending?.bold).toBe(true);
    expect(document.words.head!.data.getStyle()?.bold).toBe(true);
    const patch = mutator.insert(document, body, selection.caret()!, "x", pending);
    expect(patch.caret.node?.data.getStyle()?.bold).toBe(true);
  });

  it("字体颜色可设主题色，自动则清掉颜色", () => {
    const document = doc("a");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "color", value: "#C00000" }));
    expect(document.words.head!.data.getStyle()?.color).toBe("#C00000");
    history.do(new FormatCommand(ctx, { type: "color", value: "auto" }));
    expect(document.words.head!.data.getStyle()?.color).toBeUndefined();
  });

  it("段落对齐写到 attrs", () => {
    const document = doc("a");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    new FormatCommand(ctx, { type: "align", value: "center" }).do();
    expect(document.paragraphs.head!.data.attrs.textAlign).toBe("center");
  });

  it("首行两字、1.5 倍行距和段前 6 磅写到段落属性", () => {
    const document = doc("a");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "indent", value: "first2" }));
    history.do(new FormatCommand(ctx, { type: "lineSpacing", value: "1.5" }));
    history.do(new FormatCommand(ctx, { type: "paraGap", value: "before6" }));
    const attrs = document.paragraphs.head!.data.attrs;
    expect(attrs.firstLineChars).toBe(200);
    expect(attrs.line).toBe("360");
    expect(attrs.lineRule).toBe("auto");
    expect(attrs.before).toBe("120");
    history.undo();
    expect(document.paragraphs.head!.data.attrs.before).toBeUndefined();
    expect(document.paragraphs.head!.data.attrs.line).toBe("360");
  });

  it("增加缩进每次左移两字，减少缩进可以撤回到 0", () => {
    const document = doc("a");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "indentStep", value: 1 }));
    expect(document.paragraphs.head!.data.attrs.leftChars).toBe(200);
    history.do(new FormatCommand(ctx, { type: "indentStep", value: 1 }));
    expect(document.paragraphs.head!.data.attrs.leftChars).toBe(400);
    history.do(new FormatCommand(ctx, { type: "indentStep", value: -1 }));
    expect(document.paragraphs.head!.data.attrs.leftChars).toBe(200);
    history.do(new FormatCommand(ctx, { type: "indentStep", value: -1 }));
    expect(document.paragraphs.head!.data.attrs.leftChars).toBeUndefined();
    history.undo();
    expect(document.paragraphs.head!.data.attrs.leftChars).toBe(200);
  });

  it("上标可以来回切换，标题样式改整段字号", () => {
    const document = doc("ab");
    const selection = new Selection();
    const head = document.words.head!;
    selection.collapse(new CaretPos(body, head, false));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "superscript" }));
    expect(head.data.getStyle()?.vertAlign).toBe("superscript");
    history.do(new FormatCommand(ctx, { type: "superscript" }));
    expect(head.data.getStyle()?.vertAlign).toBe("baseline");
    history.do(new FormatCommand(ctx, { type: "style", value: "heading1" }));
    expect(document.paragraphs.head!.data.attrs.styleId).toBe("Heading1");
    expect(document.paragraphs.head!.data.attrs.outlineLevel).toBe(1);
    expect(head.data.getStyle()?.bold).toBe(true);
    expect(head.data.getStyle()?.fontSizeHalfPoint).toBe(36);
    expect(document.styles.get("Heading1")?.name).toBe("heading 1");
  });

  it("字符底纹切换会在无高亮时写入与清除浅灰背景色，并支持撤销重做", () => {
    const document = doc("ab");
    const selection = new Selection();
    const a = document.words.head!;
    const b = a.next!;
    selection.setRange(new SelRange(body, new CaretPos(body, a, false), new CaretPos(body, b, true)));
    const ctx: EditContext = {
      mutator: new Mutator(),
      relayout: { apply: () => false } as unknown as Relayout,
      selection,
      documentOf: () => document,
      afterEdit: () => undefined,
    };
    const history = new History();
    history.do(new FormatCommand(ctx, { type: "shading" }));
    expect(a.data.getStyle()?.backgroundColor).toBe("#D9D9D9");
    expect(b.data.getStyle()?.backgroundColor).toBe("#D9D9D9");
    expect(a.data.getStyle()?.highlight).toBeUndefined();

    history.do(new FormatCommand(ctx, { type: "shading" }));
    expect(a.data.getStyle()?.backgroundColor).toBeUndefined();

    history.undo();
    expect(a.data.getStyle()?.backgroundColor).toBe("#D9D9D9");
    history.redo();
    expect(a.data.getStyle()?.backgroundColor).toBeUndefined();
  });
});
