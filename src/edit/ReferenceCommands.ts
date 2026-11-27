import { Document } from "../model/document/Document";
import type { FieldKind } from "../model/document/PageLabel";
import { Paragraph } from "../model/block/Paragraph";
import { Block } from "../model/block/Block";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { citationTag, citationText, type CitationSource, type CitationStyle } from "../model/reference/Citation";
import { CaretPos } from "../selection/CaretPos";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import type { StorySource } from "./Find";
import type { MutationPatch } from "./MutationPatch";

const BODY = { slot: "body" } as const;
export interface BookmarkAddition { paragraph: Paragraph; name: string }

export class InsertReferenceField implements EditCommand {
  private patch?: MutationPatch;

  constructor(
    private readonly ctx: EditContext,
    private readonly at: CaretPos,
    private readonly text: string,
    private readonly kind: FieldKind,
    private readonly instruction: string,
    private readonly bookmark?: BookmarkAddition,
  ) {}

  do(): void {
    const document = this.ctx.documentOf(this.at.story);
    if (!document) return;
    if (this.patch) this.ctx.mutator.replay(document, this.patch);
    else this.patch = this.ctx.mutator.insert(document, this.at.story, this.at, this.text, undefined, {
      field: this.kind, fieldInstr: this.instruction, startsField: true,
    });
    if (!this.patch.inserted.length) return;
    if (this.bookmark) this.bookmark.paragraph.bookmarks.push(this.bookmark.name);
    this.finish(this.patch.caret, this.patch.impact);
  }

  undo(): void {
    const document = this.ctx.documentOf(this.at.story);
    if (!document || !this.patch?.inserted.length) return;
    if (this.bookmark) removeBookmark(this.bookmark);
    this.finish(this.at, this.ctx.mutator.invert(document, this.patch));
  }

  private finish(pos: CaretPos, impact: EditImpact): void {
    this.ctx.selection.collapse(pos);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }
}

export class CitationCommand implements EditCommand {
  private readonly previousStyle: CitationStyle;
  private readonly previousSources: CitationSource[];

  constructor(
    private readonly ctx: EditContext,
    private readonly document: Document,
    private readonly stories: StorySource[],
    private readonly style: CitationStyle,
    private readonly sources: CitationSource[],
    private readonly field?: InsertReferenceField,
  ) {
    this.previousStyle = document.citationStyle;
    this.previousSources = document.citationSources;
  }

  do(): void {
    this.apply(this.style, this.sources);
    this.field?.do();
  }

  undo(): void {
    this.field?.undo();
    this.apply(this.previousStyle, this.previousSources);
  }

  private apply(style: CitationStyle, sources: CitationSource[]): void {
    this.document.citationStyle = style;
    this.document.citationSources = sources;
    const results = new Map(sources.map((source) => [source.tag, citationText(source, style, sources)]));
    const impacts: EditImpact[] = [];
    for (const { document, story } of this.stories) {
      const dirty = new Set<Paragraph>();
      for (let node = document.words.head; node; node = node.next) {
        const { block, paragraph } = node.data;
        if (block?.field !== "CITATION" || !paragraph || node.data.isEnterChar()) continue;
        const text = results.get(citationTag(block.fieldInstr ?? "") ?? "");
        if (text === undefined || text === block.text) continue;
        block.text = text;
        node.data.char = text;
        node.data.intChar = text.charCodeAt(0);
        dirty.add(paragraph);
      }
      if (dirty.size) impacts.push(new EditImpact(story, [...dirty]));
    }
    for (const impact of impacts) this.ctx.relayout.apply(impact);
    if (!impacts.length) impacts.push(new EditImpact(BODY, []));
    for (const impact of impacts) this.ctx.afterEdit(impact);
  }
}

/** 生成的正文段落独立构建字流，已有文字和撤销记录仍使用原来的节点。 */
export class InsertReferenceParagraphs implements EditCommand {
  private readonly words: LinkedNode<Word>[] = [];
  private readonly removedWords: LinkedNode<Word>[] = [];
  private readonly before: CaretPos | undefined;

  constructor(
    private readonly ctx: EditContext,
    private readonly document: Document,
    private readonly after: Paragraph | null,
    private readonly paragraphs: Paragraph[],
    private readonly bookmarks: BookmarkAddition[] = [],
    private readonly removed: Paragraph[] = [],
  ) {
    this.before = ctx.selection.caret();
    const local = new Document();
    for (const paragraph of paragraphs) local.addParagraph(paragraph);
    new WordStreamBuilder().buildStoryOnly(local);
    local.words.each((node) => { this.words.push(node); });
    const old = new Set(removed);
    if (old.size) document.words.each((node) => {
      if (node.data.paragraph && old.has(node.data.paragraph)) this.removedWords.push(node);
    });
  }

  do(): void {
    this.detach(this.removed, this.removedWords);
    this.attach(this.paragraphs, this.words);
    for (const bookmark of this.bookmarks) bookmark.paragraph.bookmarks.push(bookmark.name);
    const first = this.words[0];
    this.finish(first ? new CaretPos(BODY, first) : undefined);
  }

  undo(): void {
    this.detach(this.paragraphs, this.words);
    this.attach(this.removed, this.removedWords);
    for (const bookmark of this.bookmarks) removeBookmark(bookmark);
    this.finish(this.before);
  }

  private attach(paragraphs: Paragraph[], words: LinkedNode<Word>[]): void {
    if (!paragraphs.length) return;
    let paragraphAnchor = this.after;
    let wordAnchor: LinkedNode<Word> | null = null;
    for (let node = this.document.words.head; this.after && node; node = node.next) {
      if (node.data.paragraph === this.after) wordAnchor = node;
      else if (wordAnchor) break;
    }
    for (const paragraph of paragraphs) {
      if (paragraphAnchor) this.document.insertParagraphAfter(paragraphAnchor, paragraph);
      else if (this.document.paragraphs.head) this.document.insertParagraphBefore(this.document.paragraphs.head.data, paragraph);
      else this.document.addParagraph(paragraph);
      paragraphAnchor = paragraph;
    }
    for (const word of words) {
      if (wordAnchor) this.document.words.insertNodeAfter(wordAnchor, word);
      else if (this.document.words.head) this.document.words.insertNodeBefore(this.document.words.head, word);
      else this.document.words.appendNode(word);
      wordAnchor = word;
    }
  }

  private detach(paragraphs: Paragraph[], words: LinkedNode<Word>[]): void {
    for (const word of words) this.document.words.removeNode(word);
    for (const paragraph of paragraphs) this.document.removeParagraph(paragraph);
  }

  private finish(caret?: CaretPos): void {
    if (caret) this.ctx.selection.collapse(caret);
    this.ctx.relayout.layoutStory(BODY);
    this.ctx.afterEdit(new EditImpact(BODY, this.document.paragraphs.toArray(), "split"));
  }
}

export class OutlineLevelCommand implements EditCommand {
  private readonly original: (number | undefined)[];

  constructor(
    private readonly ctx: EditContext,
    private readonly paragraphs: Paragraph[],
    private readonly level: number,
  ) {
    this.original = paragraphs.map((paragraph) => paragraph.attrs.outlineLevel);
  }

  do(): void {
    this.apply(this.paragraphs.map(() => this.level));
  }

  undo(): void {
    this.apply(this.original);
  }

  private apply(levels: (number | undefined)[]): void {
    this.paragraphs.forEach((paragraph, index) => {
      paragraph.attrs = { ...paragraph.attrs, outlineLevel: levels[index] };
    });
    const impact = new EditImpact(BODY, this.paragraphs);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }
}

export function referenceBlock(text: string, field?: FieldKind, instruction?: string): Block {
  return Object.assign(new Block(), { text, field, fieldInstr: instruction, startsField: !!field });
}

function removeBookmark({ paragraph, name }: BookmarkAddition): void {
  paragraph.bookmarks = paragraph.bookmarks.filter((bookmark) => bookmark !== name);
}
