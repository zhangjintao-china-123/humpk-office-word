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
  private beforeWords: LinkedNode<Word>[] = [];
  private afterWords: LinkedNode<Word>[] = [];
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
      replaceWords(document, this.afterWords);
    } else {
      this.before = document.paragraphs.toArray();
      this.beforeMarks = snapMarks(this.before);
      this.beforeWords = wordsOf(document);
      this.caretParagraph = this.ctx.selection.caret()?.node?.data.paragraph ?? null;
      const hasToc = this.before.some((item) => item.toc?.role === "start");
      const anchor = hasToc ? null : this.caretParagraph && this.before.includes(this.caretParagraph)
        ? this.caretParagraph : document.paragraphs.head?.data ?? null;
      syncToc(document, anchor);
      this.after = document.paragraphs.toArray();
      this.afterMarks = snapMarks(this.after);
      this.rebuildWords(document);
      this.afterWords = wordsOf(document);
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
    replaceWords(document, this.beforeWords);
    this.finish(document, this.caretParagraph);
  }

  private tocStart(document: Document): Paragraph | null {
    return document.paragraphs.toArray().find((item) => item.toc?.role === "start") ?? null;
  }

  private finish(document: Document, focus: Paragraph | null): void {
    this.ctx.relayout.layoutStory({ slot: "body" });
    const word = (focus && firstWord(document, focus)) || document.words.head;
    if (word) {
      this.ctx.selection.collapse(new CaretPos({ slot: "body" }, word, false));
    }
    this.ctx.afterEdit(new EditImpact({ slot: "body" }, document.paragraphs.toArray()));
  }

  private rebuildWords(document: Document): void {
    const saved = new Map<Paragraph, LinkedNode<Word>[]>();
    for (const word of this.beforeWords) {
      const paragraph = word.data.paragraph;
      if (!paragraph) continue;
      const words = saved.get(paragraph) ?? [];
      words.push(word);
      saved.set(paragraph, words);
    }
    const builder = new WordStreamBuilder();
    document.words.clear();
    document.paragraphs.each(({ data }) => {
      const words = saved.get(data);
      if (words) for (const word of words) document.words.appendNode(word);
      else builder.appendParagraph(document, data);
    });
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
  document.paragraphs.each(({ data }) => { data.node = null; });
  document.paragraphs.clear();
  for (const paragraph of paragraphs) {
    document.addParagraph(paragraph);
  }
}

function wordsOf(document: Document): LinkedNode<Word>[] {
  const words: LinkedNode<Word>[] = [];
  document.words.each((node) => { words.push(node); });
  return words;
}

function replaceWords(document: Document, words: LinkedNode<Word>[]): void {
  document.words.clear();
  for (const word of words) document.words.appendNode(word);
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
