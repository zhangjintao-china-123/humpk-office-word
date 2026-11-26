import { describe, expect, it } from "vitest";
import { CoverPageCommand } from "../../src/edit/CoverPageCommand";
import type { EditContext } from "../../src/edit/EditContext";
import { History } from "../../src/edit/History";
import { InsertCommand } from "../../src/edit/InsertCommand";
import { blankTable } from "../../src/edit/InsertObjectCommand";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { StoryLayout } from "../../src/layout/StoryLayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { COVER_TEMPLATE_IDS, leadingCover } from "../../src/model/document/CoverPage";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";

const BODY = { slot: "body" } as const;
const constraints = { contentWidth: 602, contentHeight: 930, measurer: new FallbackMeasurer() };

function setup(document = new Document(), tableFirst = false) {
  if (!document.paragraphs.head) {
    const paragraph = new Paragraph(1);
    if (tableFirst) {
      paragraph.isTable = true;
      paragraph.table = blankTable(2, 2);
    } else {
      const block = new Block();
      block.text = "原有正文";
      paragraph.addBlock(block);
    }
    document.addParagraph(paragraph);
  }
  new WordStreamBuilder().build(document);
  const selection = new Selection();
  selection.collapse(new CaretPos(BODY, document.words.head, true));
  const layout = new StoryLayout();
  const ctx: EditContext = {
    selection, mutator: new Mutator(), documentOf: () => document, afterEdit: () => undefined,
    relayout: {
      layoutStory: () => layout.layout(document, constraints),
      apply: () => false,
    } as unknown as Relayout,
  };
  return { document, ctx, history: new History() };
}

describe("插入封面", () => {
  it.each(COVER_TEMPLATE_IDS)("%s 从首页插入，正文从下一页开始，撤销后正文节点保持可用", (template) => {
    const { document, ctx, history } = setup();
    const originalWord = document.words.head!;
    const originalParagraph = document.paragraphs.head!.data;
    history.do(new CoverPageCommand(ctx, template, constraints.contentHeight));
    expect(leadingCover(document)).toHaveLength(5);
    expect(originalParagraph.lines[0].top).toBe(constraints.contentHeight);
    expect(ctx.selection.primaryRange()?.collapsed()).toBe(false);
    expect(originalWord.data.paragraph?.getFullText()).toBe("原有正文");
    expect(ctx.mutator.deleteBackward(document, BODY, new CaretPos(BODY, originalWord)).removed).toHaveLength(0);

    history.undo();
    expect(document.words.head).toBe(originalWord);
    expect(document.paragraphText()).toEqual(["原有正文"]);
    history.redo();
    expect(leadingCover(document)[0].coverTemplate).toBe(template);
    expect(originalParagraph.lines[0].top).toBe(constraints.contentHeight);
  });

  it("标题可直接替换、封面换版保留内容，写回后可单独删除封面", async () => {
    const { document, ctx, history } = setup();
    history.do(new CoverPageCommand(ctx, "clarity", constraints.contentHeight));
    history.do(new InsertCommand(ctx, "阶段报告"));
    history.do(new CoverPageCommand(ctx, "tide", constraints.contentHeight));
    expect(leadingCover(document)[1].getFullText()).toBe("阶段报告");
    history.undo();
    history.undo();
    expect(leadingCover(document)[1].getFullText()).toBe("文档标题");
    history.redo();
    history.redo();

    const read = await new DocxReader().read(await new DocxWriter().write(document));
    expect(read.paragraphText()).toEqual(["文档", "阶段报告", "文档副标题", "作者姓名", "日期", "原有正文"]);
    expect(leadingCover(read)[1].coverTemplate).toBe("tide");
    expect(leadingCover(read)[1].attrs.shading?.fill).toBe("235573");
    const reopened = setup(read);
    reopened.history.do(new CoverPageCommand(reopened.ctx, undefined, constraints.contentHeight));
    expect(read.paragraphText()).toEqual(["原有正文"]);
    reopened.history.undo();
    expect(leadingCover(read)[1].getFullText()).toBe("阶段报告");
  });

  it("正文以表格开头时也从下一页开始", () => {
    const { document, ctx, history } = setup(new Document(), true);
    const table = document.paragraphs.head!.data;
    history.do(new CoverPageCommand(ctx, "folio", constraints.contentHeight));
    expect(table.lines[0].top).toBe(constraints.contentHeight);
    expect(document.paragraphs.tail?.data).toBe(table);
  });
});
