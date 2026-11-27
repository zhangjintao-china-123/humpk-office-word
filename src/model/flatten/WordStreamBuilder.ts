import { Document } from "../document/Document";
import { Word } from "../inline/Word";
import type { Block } from "../block/Block";
import type { Paragraph } from "../block/Paragraph";
import type { LinkedNode } from "../list/LinkedList";
import { isReferenceField } from "../document/PageLabel";

export function paragraphStartWord(anchor: LinkedNode<Word>): LinkedNode<Word> {
  let first = anchor;
  while (first.pre && first.pre.data.paragraph === anchor.data.paragraph) {
    first = first.pre;
  }
  return first;
}

/** 把段落/Block 拆成按字双向链表。不修改 Block 原文。 */
export class WordStreamBuilder {
  build(document: Document): void {
    this.buildStoryOnly(document);
    for (const section of document.sections) {
      for (const header of section.headers.values()) {
        this.build(header);
      }
      for (const footer of section.footers.values()) {
        this.build(footer);
      }
    }
    document.paragraphs.each((node) => {
      const table = node.data.table;
      if (!table) {
        return;
      }
      for (const row of table.rows) {
        for (const cell of row.cells) {
          this.build(cell.document);
        }
      }
    });
  }

  /** 只拆当前 Story，不递归页眉/单元格。 */
  buildStoryOnly(document: Document): void {
    document.words.clear();
    document.paragraphs.each((node) => {
      this.appendParagraph(document, node.data);
    });
    this.buildShapeStories(document);
  }

  appendParagraph(document: Document, paragraph: Paragraph): void {
    if (paragraph.isTable) {
      if (!paragraph.hasAnchor && paragraph.table) {
        const word = new Word();
        word.kind = "table";
        word.table = paragraph.table;
        word.paragraph = paragraph;
        document.words.append(word);
      }
      return;
    }

    let lastBlock: Block | undefined;
    for (const block of paragraph.blocks) {
      if (block.drawing?.position === "anchor") {
        lastBlock = block;
        continue;
      }
      if (block.isDrawing && block.drawing) {
        const word = new Word();
        word.kind = "drawing";
        word.drawing = block.drawing;
        word.block = block;
        word.paragraph = paragraph;
        document.words.append(word);
      } else if (block.charType === "page") {
        const word = new Word();
        word.kind = "page";
        word.block = block;
        word.paragraph = paragraph;
        document.words.append(word);
      } else if ((block.enclosed || block.asianLayout || block.field === "FORMULA" || isReferenceField(block.field)
        || block.commentRef || block.footnoteId || block.endnoteId) && block.text) {
        const word = new Word();
        word.char = block.text;
        word.intChar = block.text.codePointAt(0) ?? block.text.charCodeAt(0);
        word.block = block;
        word.paragraph = paragraph;
        document.words.append(word);
      } else {
        for (const char of block.text) {
          document.words.append(this.createTextWord(char, block, paragraph));
        }
      }
      lastBlock = block;
    }

    const enter = new Word();
    enter.char = "\n";
    enter.intChar = "\n".charCodeAt(0);
    enter.block = lastBlock ?? null;
    enter.paragraph = paragraph;
    document.words.append(enter);
  }

  private buildShapeStories(document: Document): void {
    const visit = (story: Document): void => {
      story.paragraphs.each((node) => {
        for (const block of node.data.blocks) {
          const inner = block.drawing?.shape?.text;
          if (inner && inner.words.length === 0) {
            this.buildStoryOnly(inner);
          }
        }
        const table = node.data.table;
        if (!table) {
          return;
        }
        for (const row of table.rows) {
          for (const cell of row.cells) {
            visit(cell.document);
          }
        }
      });
    };
    visit(document);
  }

  private createTextWord(char: string, block: Block, paragraph: Paragraph): Word {
    const word = new Word();
    word.char = char;
    word.intChar = char.charCodeAt(0);
    word.block = block;
    word.paragraph = paragraph;
    return word;
  }

  joinText(document: Document): string {
    let text = "";
    document.words.each((node) => {
      const word = node.data;
      if (word.kind === "text") {
        text += word.char;
      }
    });
    return text;
  }
}
