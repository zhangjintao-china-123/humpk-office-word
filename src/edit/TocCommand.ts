import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import type { Word } from "../model/inline/Word";
import type { LinkedNode } from "../model/list/LinkedList";
import { syncToc } from "../model/toc/Toc";
import { CaretPos } from "../selection/CaretPos";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

interface MarkSnap {
  paragraph: Paragraph;
  names: string[];
}

export class TocCommand implements EditCommand {
  private before: Paragraph[] | null = null;
  private after: Paragraph[] | null = null;
  private beforeMarks: MarkSnap[] | null = null;
  private afterMarks: MarkSnap[] | null = null;
  private caretParagraph: Paragraph | null = null;

  constructor(private readonly ctx: EditContext) {}

  do(): void {
    const document = this.ctx.documentOf({ slot: "body" });
    if (!document) {
      return;
    }
    if (this.after && this.afterMarks) {
      replaceParagraphs(document, this.after);
      applyMarks(this.afterMarks);
    } else {
      this.before = document.paragraphs.toArray();
      this.beforeMarks = snapMarks(this.before);
      this.caretParagraph = this.ctx.selection.caret()?.node?.data.paragraph ?? null;
      const hasToc = this.before.some((item) => item.toc?.role === "start");
      const anchor = hasToc ? null : (this.caretParagraph ?? document.paragraphs.head?.data ?? null);
      syncToc(document, anchor);
      this.after = document.paragraphs.toArray();
      this.afterMarks = snapMarks(this.after);
    }
    this.finish(document, this.tocStart(document) ?? this.caretParagraph);
  }

  undo(): void {
    const document = this.ctx.documentOf({ slot: "body" });
    if (!document || !this.before || !this.beforeMarks) {
      return;
    }
    replaceParagraphs(document, this.before);
    applyMarks(this.beforeMarks);
    this.finish(document, this.caretParagraph);
  }

  private tocStart(document: Document): Paragraph | null {
    return document.paragraphs.toArray().find((item) => item.toc?.role === "start") ?? null;
  }

  private finish(document: Document, focus: Paragraph | null): void {
    new WordStreamBuilder().buildStoryOnly(document);
    this.ctx.relayout.layoutStory({ slot: "body" });
    const word = (focus && firstWord(document, focus)) || document.words.head;
    if (word) {
      this.ctx.selection.collapse(new CaretPos({ slot: "body" }, word, false));
    }
    this.ctx.afterEdit(new EditImpact({ slot: "body" }, document.paragraphs.toArray()));
  }
}

function snapMarks(paragraphs: Paragraph[]): MarkSnap[] {
  return paragraphs.map((paragraph) => ({ paragraph, names: paragraph.bookmarks.slice() }));
}

function applyMarks(marks: MarkSnap[]): void {
  for (const item of marks) {
    item.paragraph.bookmarks = item.names.slice();
  }
}

function replaceParagraphs(document: Document, paragraphs: Paragraph[]): void {
  document.paragraphs.clear();
  for (const paragraph of paragraphs) {
    document.addParagraph(paragraph);
  }
}

function firstWord(document: Document, paragraph: Paragraph): LinkedNode<Word> | null {
  let node = document.words.head;
  while (node) {
    if (node.data.paragraph === paragraph) {
      return node;
    }
    node = node.next;
  }
  return null;
}
