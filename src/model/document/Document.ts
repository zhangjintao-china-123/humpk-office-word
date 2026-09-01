import { LinkedList } from "../list/LinkedList";
import { Paragraph } from "../block/Paragraph";
import { Word } from "../inline/Word";
import { StyleSheet } from "../style/StyleSheet";
import { Numbering } from "../style/Numbering";
import type { DocumentKind, HeaderFooterType } from "./DocumentKind";
import type { PlacedAnchor } from "../inline/PlacedAnchor";
import { Section } from "./Section";

export class Document {
  kind: DocumentKind = "body";
  partName?: string;
  paragraphs = new LinkedList<Paragraph>();
  words = new LinkedList<Word>();
  styles = new StyleSheet();
  numbering = new Numbering();
  sections: Section[] = [];
  anchors: PlacedAnchor[] = [];
  adjustLineHeightInTable = false;
  evenAndOddHeaders = false;

  addParagraph(paragraph: Paragraph): void {
    paragraph.node = this.paragraphs.append(paragraph);
  }

  insertParagraphAfter(after: Paragraph, paragraph: Paragraph): void {
    if (!after.node) {
      this.addParagraph(paragraph);
      return;
    }
    paragraph.node = this.paragraphs.insertAfter(after.node, paragraph);
  }

  insertParagraphBefore(before: Paragraph, paragraph: Paragraph): void {
    if (!before.node) {
      this.addParagraph(paragraph);
      return;
    }
    paragraph.node = this.paragraphs.insertBefore(before.node, paragraph);
  }

  removeParagraph(paragraph: Paragraph): void {
    if (!paragraph.node) {
      return;
    }
    this.paragraphs.removeNode(paragraph.node);
    paragraph.node = null;
  }

  nextParagraphId(): number {
    let max = 0;
    this.paragraphs.each((node) => {
      max = Math.max(max, node.data.id);
    });
    return max + 1;
  }

  paragraphText(): string[] {
    return this.paragraphs.toArray().map((paragraph) => paragraph.getFullText());
  }

  lastSection(): Section | undefined {
    return this.sections.at(-1);
  }

  header(type: HeaderFooterType = "default"): Document | undefined {
    return this.lastSection()?.headers.get(type);
  }

  footer(type: HeaderFooterType = "default"): Document | undefined {
    return this.lastSection()?.footers.get(type);
  }
}
