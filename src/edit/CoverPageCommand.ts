import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import { COVER_PLACEHOLDERS, COVER_TITLE_INDEX, coverTemplate, leadingCover, type CoverLineStyle, type CoverTemplateId } from "../model/document/CoverPage";
import { Document } from "../model/document/Document";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import type { Word } from "../model/inline/Word";
import type { LinkedNode } from "../model/list/LinkedList";
import type { RunStyle } from "../model/style/RunStyle";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
import { ptToPx, pxToTwip } from "../shared/units";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

const BODY: StoryRef = { slot: "body" };

interface CoverPrefix {
  paragraphs: Paragraph[];
  words: LinkedNode<Word>[];
}

export class CoverPageCommand implements EditCommand {
  private before?: CoverPrefix;
  private after?: CoverPrefix;
  private originalCaret?: CaretPos;
  private originalPending?: RunStyle;

  constructor(
    private readonly ctx: EditContext,
    private readonly templateId: CoverTemplateId | undefined,
    private readonly pageHeight: number,
  ) {}

  do(): void {
    const document = this.ctx.documentOf(BODY);
    if (!document) {
      return;
    }
    if (!this.before || !this.after) {
      const paragraphs = leadingCover(document);
      this.before = { paragraphs, words: prefixWords(document, new Set(paragraphs)) };
      this.after = makePrefix(document, paragraphs, this.templateId, this.pageHeight);
      this.originalCaret = this.ctx.selection.caret();
      this.originalPending = this.ctx.pendingRunStyle?.();
    }
    swapPrefix(document, this.before, this.after);
    this.ctx.setPendingRunStyle?.(undefined);
    this.selectTitle(document);
    this.finish(document);
  }

  undo(): void {
    const document = this.ctx.documentOf(BODY);
    if (!document || !this.before || !this.after) {
      return;
    }
    swapPrefix(document, this.after, this.before);
    this.ctx.setPendingRunStyle?.(this.originalPending);
    this.ctx.selection.collapse(this.originalCaret ?? new CaretPos(BODY, document.words.head));
    this.finish(document);
  }

  private selectTitle(document: Document): void {
    const title = this.templateId ? this.after?.paragraphs[COVER_TITLE_INDEX] : undefined;
    const words = this.after?.words.filter((node) => node.data.paragraph === title && node.data.kind === "text" && !node.data.isEnterChar());
    const start = words?.[0];
    const end = words?.at(-1);
    if (start && end) {
      this.ctx.selection.setRange(new SelRange(BODY, new CaretPos(BODY, start), new CaretPos(BODY, end, true)));
    } else {
      this.ctx.selection.collapse(new CaretPos(BODY, document.words.head));
    }
  }

  private finish(document: Document): void {
    this.ctx.relayout.layoutStory(BODY);
    this.ctx.afterEdit(new EditImpact(BODY, document.paragraphs.toArray()));
  }
}

function makePrefix(document: Document, previous: Paragraph[], templateId: CoverTemplateId | undefined, pageHeight: number): CoverPrefix {
  let nextId = document.nextParagraphId();
  const staging = new Document();
  if (templateId) {
    const template = coverTemplate(templateId);
    const scale = Math.min(1, Math.max(0, (pageHeight - 165) / 540));
    const [title, subtitle, author, date] = COVER_PLACEHOLDERS;
    const placeholders = [template.label, document.props.title || title, subtitle, document.props.creator || author, date];
    const count = previous.length || template.lines.length;
    for (let index = 0; index < count; index += 1) {
      const original = previous[index];
      const line = template.lines[index] ?? template.lines[template.lines.length - 1];
      const paragraph = original
        ? Object.assign(new Paragraph(original.id), original, { node: null, lines: [], changed: true })
        : new Paragraph(nextId++);
      paragraph.coverTemplate = templateId;
      if (!paragraph.isTable) {
        dressParagraph(paragraph, line, scale, template.serif ?? false, placeholders[index] ?? "");
      }
      staging.addParagraph(paragraph);
    }
  }
  if (previous.length === document.paragraphs.length) {
    const body = new Paragraph(nextId);
    body.addBlock(new Block());
    staging.addParagraph(body);
  }
  new WordStreamBuilder().buildStoryOnly(staging);
  const words: LinkedNode<Word>[] = [];
  staging.words.each((node) => { words.push(node); });
  return { paragraphs: staging.paragraphs.toArray(), words };
}

function dressParagraph(paragraph: Paragraph, line: CoverLineStyle, scale: number, serif: boolean, placeholder: string): void {
  const fontSize = line.size >= 30 ? Math.max(22, Math.round(line.size * Math.max(0.7, scale))) : line.size;
  const run: RunStyle = {
    fontSizePx: ptToPx(fontSize), fontSizeHalfPoint: fontSize * 2,
    wAscii: serif ? "Georgia" : "Arial", wHAnsi: serif ? "Georgia" : "Arial", wEastAsia: serif ? "宋体" : "等线",
    bold: line.bold ?? false, color: line.color ?? "#26384B",
  };
  paragraph.attrs = {
    textAlign: line.align ?? "left", line: "300", lineRule: "auto", snapToGrid: "0", keepLines: "1",
    before: String(pxToTwip((line.before ?? 0) * scale)), after: String(pxToTwip((line.after ?? 0) * scale)),
    leftTwip: pxToTwip(line.inset ?? 0),
  };
  if (line.fill) {
    paragraph.attrs.shading = { val: "clear", fill: line.fill.slice(1) };
  }
  if (line.rule) {
    const border = { val: "single", color: line.rule.color.slice(1), sz: String(line.rule.weight * 6), space: "4" };
    const key = line.rule.side === "top" ? "borderTop" : line.rule.side === "left" ? "borderLeft" : "borderBottom";
    paragraph.attrs[key] = border;
  }
  paragraph.inheritedRunStyle = run;
  if (paragraph.blocks.length) {
    paragraph.blocks = paragraph.blocks.map((block) => Object.assign(new Block(), block, { style: run }));
  } else {
    const block = new Block();
    block.text = placeholder;
    block.style = run;
    paragraph.addBlock(block);
  }
}

function prefixWords(document: Document, paragraphs: Set<Paragraph>): LinkedNode<Word>[] {
  const words: LinkedNode<Word>[] = [];
  for (let node = document.words.head; node?.data.paragraph && paragraphs.has(node.data.paragraph); node = node.next) {
    words.push(node);
  }
  return words;
}

function swapPrefix(document: Document, from: CoverPrefix, to: CoverPrefix): void {
  from.words = prefixWords(document, new Set(from.paragraphs));
  for (const node of from.words) {
    document.words.removeNode(node);
  }
  for (const paragraph of from.paragraphs) {
    document.removeParagraph(paragraph);
  }
  const first = document.paragraphs.head?.data;
  for (const paragraph of to.paragraphs) {
    if (first) {
      document.insertParagraphBefore(first, paragraph);
    } else {
      document.addParagraph(paragraph);
    }
  }
  const firstWord = document.words.head;
  for (const node of to.words) {
    if (firstWord) {
      document.words.insertNodeBefore(firstWord, node);
    } else {
      document.words.appendNode(node);
    }
  }
}
