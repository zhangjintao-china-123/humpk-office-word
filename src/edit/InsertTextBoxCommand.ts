import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import { Document } from "../model/document/Document";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import type { TextBoxDirection } from "../model/graphic/Shape";
import { Drawing } from "../model/inline/Drawing";
import { Word } from "../model/inline/Word";
import { LinkedNode } from "../model/list/LinkedList";
import { mergeRunStyle } from "../model/style/RunStyle";
import type { RunStyle } from "../model/style/RunStyle";
import { CaretPos } from "../selection/CaretPos";
import type { Rect } from "../shared/geometry/Rect";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

const BODY = { slot: "body" } as const;

/** 文本框是段落的浮动对象，正文的字节点无需重建。 */
export class InsertTextBoxCommand implements EditCommand {
  private readonly block = new Block();
  private anchor?: Paragraph;
  private createdMark?: LinkedNode<Word>;
  private originalCaret?: CaretPos;
  private originalPending?: RunStyle;

  constructor(
    private readonly ctx: EditContext,
    private readonly direction: TextBoxDirection,
    private readonly bounds: Rect,
    private readonly target: Paragraph | null,
  ) {}

  do(): void {
    const document = this.ctx.documentOf(BODY);
    if (!document) {
      return;
    }
    if (!this.anchor) {
      this.originalCaret = this.ctx.selection.caret();
      this.originalPending = this.ctx.pendingRunStyle?.();
      this.anchor = this.target ?? new Paragraph(document.nextParagraphId());
      if (!this.target) {
        const mark = new Word();
        mark.char = "\n";
        mark.intChar = 10;
        mark.paragraph = this.anchor;
        mark.block = new Block();
        this.anchor.addBlock(mark.block);
        this.createdMark = new LinkedNode(mark);
      }
      this.block.drawing = this.makeDrawing(document, this.anchor);
    }
    if (this.createdMark) {
      const paragraph = document.paragraphs.head?.data;
      const word = document.words.head;
      if (paragraph) {
        document.insertParagraphBefore(paragraph, this.anchor);
      } else {
        document.addParagraph(this.anchor);
      }
      if (word) {
        document.words.insertNodeBefore(word, this.createdMark);
      } else {
        document.words.appendNode(this.createdMark);
      }
    }
    this.anchor.addBlock(this.block);
    const text = this.block.drawing?.shape?.text;
    const story = { slot: "textbox", block: this.block } as const;
    this.ctx.setPendingRunStyle?.(undefined);
    this.ctx.selection.collapse(new CaretPos(story, text?.words.head ?? null));
    this.finish(this.anchor);
  }

  undo(): void {
    const document = this.ctx.documentOf(BODY);
    if (!this.anchor || !document) {
      return;
    }
    this.anchor.blocks = this.anchor.blocks.filter((block) => block !== this.block);
    if (this.createdMark) {
      document.words.removeNode(this.createdMark);
      document.removeParagraph(this.anchor);
    }
    this.ctx.setPendingRunStyle?.(this.originalPending);
    this.ctx.selection.collapse(this.originalCaret ?? new CaretPos(BODY, document.words.head));
    this.finish(this.anchor);
  }

  private makeDrawing(document: Document, anchor: Paragraph): Drawing {
    const story = new Document();
    story.kind = "textbox";
    story.styles = document.styles;
    story.numbering = document.numbering;
    const paragraph = new Paragraph(1);
    const styleId = story.styles.defaultParagraphStyleId;
    const style = styleId ? story.styles.getResolved(styleId).runStyle : undefined;
    paragraph.inheritedRunStyle = mergeRunStyle(story.styles.docDefaultRun, style);
    const block = new Block();
    block.style = paragraph.inheritedRunStyle;
    paragraph.addBlock(block);
    story.addParagraph(paragraph);
    new WordStreamBuilder().buildStoryOnly(story);

    const drawing = new Drawing();
    drawing.width = this.bounds.width;
    drawing.height = this.bounds.height;
    drawing.position = "anchor";
    drawing.lockAspect = false;
    drawing.anchorSet = {
      leftFrom: "column", left: this.bounds.x,
      topFrom: "paragraph", top: this.bounds.y - (anchor.lines[0]?.top ?? 0),
      wrapType: "none",
    };
    drawing.shape = {
      preset: "rect", fill: "#FFFFFF", line: "#41566C", lineWidth: 1,
      text: story, textDirection: this.direction, insets: { left: 8, top: 6, right: 8, bottom: 6 },
    };
    return drawing;
  }

  private finish(anchor: Paragraph): void {
    const impact = new EditImpact(BODY, [anchor]);
    if (this.createdMark) {
      this.ctx.relayout.layoutStory(BODY);
    } else {
      this.ctx.relayout.apply(impact);
    }
    this.ctx.afterEdit(impact);
  }
}
