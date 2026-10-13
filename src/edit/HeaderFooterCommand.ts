import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import { Document } from "../model/document/Document";
import type { HeaderFooterType } from "../model/document/DocumentKind";
import { Section } from "../model/document/Section";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import { CaretPos } from "../selection/CaretPos";
import { storyKind, storySection, type StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

export type HeaderFooterAction = "page" | "title" | "even";

interface BandSnap {
  sectionIndex: number;
  slot: "header" | "footer";
  type: HeaderFooterType;
  present: boolean;
  paragraphs: Paragraph[];
}

interface Snap {
  sectionCount: number;
  titlePg: boolean[];
  evenAndOdd: boolean;
  bands: BandSnap[];
  focus: StoryRef;
}

export interface HeaderFooterHost extends EditContext {
  bodyDocument(): Document | null;
  reloadBands(): void;
}

export class HeaderFooterCommand implements EditCommand {
  private before: Snap | null = null;
  private after: Snap | null = null;

  constructor(
    private readonly host: HeaderFooterHost,
    private readonly action: HeaderFooterAction,
  ) {}

  do(): void {
    const document = this.host.bodyDocument();
    if (!document) {
      return;
    }
    if (!this.before || !this.after) {
      this.before = capture(document, this.action, this.host);
      applyAction(document, this.action, this.host);
      this.after = capture(document, this.action, this.host);
    } else {
      restore(document, this.after);
    }
    this.finish(this.after?.focus ?? { slot: "body" });
  }

  undo(): void {
    const document = this.host.bodyDocument();
    if (!document || !this.before) {
      return;
    }
    restore(document, this.before);
    this.finish(this.before.focus);
  }

  private finish(focus: StoryRef): void {
    this.host.reloadBands();
    this.host.relayout.layoutStory({ slot: "body" });
    if (focus.slot === "header" || focus.slot === "footer") {
      this.host.relayout.layoutStory(focus);
    }
    const story = this.host.documentOf(focus);
    const word = story?.words.head ?? this.host.documentOf({ slot: "body" })?.words.head;
    const storyRef: StoryRef = story?.words.head ? focus : { slot: "body" };
    if (word) {
      this.host.selection.collapse(new CaretPos(storyRef, word, false));
    }
    this.host.afterEdit(new EditImpact(storyRef, story?.paragraphs.toArray() ?? []));
  }
}

function applyAction(document: Document, action: HeaderFooterAction, host: HeaderFooterHost): void {
  const target = targetOf(host);
  const section = ensureSection(document, target.sectionIndex);
  if (action === "title") {
    section.titlePg = !section.titlePg;
    if (section.titlePg) {
      ensureStory(section, "header", "first");
      ensureStory(section, "footer", "first");
    }
    return;
  }
  if (action === "even") {
    document.evenAndOddHeaders = !document.evenAndOddHeaders;
    if (document.evenAndOddHeaders) {
      ensureStory(section, "header", "even");
      ensureStory(section, "footer", "even");
    }
    return;
  }
  const story = ensureStory(section, target.slot, target.type);
  if (hasPageField(story)) {
    return;
  }
  const fresh = pageNumberParagraph(story.nextParagraphId());
  if (isBlank(story)) {
    story.paragraphs.clear();
    story.addParagraph(fresh);
  } else {
    story.addParagraph(fresh);
  }
  new WordStreamBuilder().buildStoryOnly(story);
}

function targetOf(host: HeaderFooterHost): { sectionIndex: number; slot: "header" | "footer"; type: HeaderFooterType } {
  const caret = host.selection.caret();
  if (caret && (caret.story.slot === "header" || caret.story.slot === "footer")) {
    return { sectionIndex: storySection(caret.story), slot: caret.story.slot, type: storyKind(caret.story) };
  }
  return {
    sectionIndex: caret?.node?.data.paragraph?.sectionIndex ?? 0,
    slot: "footer",
    type: "default",
  };
}

function capture(document: Document, action: HeaderFooterAction, host: HeaderFooterHost): Snap {
  const target = targetOf(host);
  const keys = bandKeys(action, target);
  return {
    sectionCount: document.sections.length,
    titlePg: document.sections.map((section) => section.titlePg),
    evenAndOdd: document.evenAndOddHeaders,
    bands: keys.map((key) => {
      const section = document.sections[key.sectionIndex];
      const story = section ? mapOf(section, key.slot).get(key.type) : undefined;
      return {
        ...key,
        present: !!story,
        paragraphs: story ? story.paragraphs.toArray() : [],
      };
    }),
    focus:
      action === "page"
        ? { slot: target.slot, kind: target.type, sectionIndex: target.sectionIndex }
        : (host.selection.caret()?.story ?? { slot: "body" }),
  };
}

function bandKeys(
  action: HeaderFooterAction,
  target: { sectionIndex: number; slot: "header" | "footer"; type: HeaderFooterType },
): Array<{ sectionIndex: number; slot: "header" | "footer"; type: HeaderFooterType }> {
  if (action === "page") {
    return [target];
  }
  if (action === "title") {
    return [
      { sectionIndex: target.sectionIndex, slot: "header", type: "first" },
      { sectionIndex: target.sectionIndex, slot: "footer", type: "first" },
    ];
  }
  return [
    { sectionIndex: target.sectionIndex, slot: "header", type: "even" },
    { sectionIndex: target.sectionIndex, slot: "footer", type: "even" },
  ];
}

function restore(document: Document, snap: Snap): void {
  document.evenAndOddHeaders = snap.evenAndOdd;
  while (document.sections.length < snap.sectionCount) {
    document.sections.push(new Section());
  }
  snap.titlePg.forEach((titlePg, index) => {
    const section = document.sections[index];
    if (section) {
      section.titlePg = titlePg;
    }
  });
  for (const band of snap.bands) {
    const section = ensureSection(document, band.sectionIndex);
    const map = mapOf(section, band.slot);
    if (!band.present) {
      map.delete(band.type);
      continue;
    }
    const story = map.get(band.type) ?? ensureStory(section, band.slot, band.type);
    story.paragraphs.clear();
    for (const paragraph of band.paragraphs) {
      story.addParagraph(paragraph);
    }
    if (!story.paragraphs.length) {
      const blank = new Paragraph(story.nextParagraphId());
      blank.addBlock(new Block());
      story.addParagraph(blank);
    }
    new WordStreamBuilder().buildStoryOnly(story);
  }
  while (document.sections.length > snap.sectionCount) {
    document.sections.pop();
  }
}

function ensureSection(document: Document, index: number): Section {
  while (document.sections.length <= index) {
    document.sections.push(new Section());
  }
  return document.sections[index];
}

function ensureStory(section: Section, slot: "header" | "footer", type: HeaderFooterType): Document {
  const map = mapOf(section, slot);
  const existing = map.get(type);
  if (existing) {
    return existing;
  }
  const story = new Document();
  story.kind = slot;
  const paragraph = new Paragraph(1);
  paragraph.addBlock(new Block());
  story.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(story);
  map.set(type, story);
  return story;
}

function mapOf(section: Section, slot: "header" | "footer"): Map<HeaderFooterType, Document> {
  return slot === "header" ? section.headers : section.footers;
}

function hasPageField(story: Document): boolean {
  return story.paragraphs.toArray().some((paragraph) => paragraph.blocks.some((block) => block.field === "PAGE"));
}

function isBlank(story: Document): boolean {
  const paragraphs = story.paragraphs.toArray();
  return paragraphs.length <= 1 && paragraphs.every((paragraph) => paragraph.getFullText() === "" && paragraph.blocks.every((block) => !block.field));
}

function pageNumberParagraph(id: number): Paragraph {
  const paragraph = new Paragraph(id);
  paragraph.attrs.textAlign = "center";
  paragraph.addBlock(textBlock("第 "));
  paragraph.addBlock(fieldBlock("PAGE"));
  paragraph.addBlock(textBlock(" 页 / 共 "));
  paragraph.addBlock(fieldBlock("NUMPAGES"));
  paragraph.addBlock(textBlock(" 页"));
  return paragraph;
}

function textBlock(text: string): Block {
  const block = new Block();
  block.text = text;
  return block;
}

function fieldBlock(field: "PAGE" | "NUMPAGES"): Block {
  const block = new Block();
  block.text = "1";
  block.field = field;
  return block;
}
