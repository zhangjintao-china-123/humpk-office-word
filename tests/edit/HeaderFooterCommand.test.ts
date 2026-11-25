import { describe, expect, it } from "vitest";
import { HeaderFooterCommand, type HeaderFooterHost } from "../../src/edit/HeaderFooterCommand";
import { Mutator } from "../../src/edit/Mutator";
import type { Relayout } from "../../src/edit/Relayout";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { Selection } from "../../src/selection/Selection";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };

function hostOf(document: Document, selection: Selection): HeaderFooterHost {
  return {
    mutator: new Mutator(),
    relayout: { apply: () => false, layoutStory: () => undefined } as unknown as Relayout,
    selection,
    documentOf: (story) => {
      if (story.slot === "header") {
        return document.sections[story.sectionIndex ?? 0]?.headers.get(story.kind ?? "default") ?? null;
      }
      if (story.slot === "footer") {
        return document.sections[story.sectionIndex ?? 0]?.footers.get(story.kind ?? "default") ?? null;
      }
      return document;
    },
    afterEdit: () => undefined,
    bodyDocument: () => document,
    reloadBands: () => undefined,
  };
}

function doc(): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  paragraph.addBlock(new Block());
  paragraph.blocks[0]!.text = "a";
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

describe("HeaderFooterCommand", () => {
  it("插入页眉后光标进页眉，撤销后页眉消失", () => {
    const document = doc();
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.head, false));
    const host = hostOf(document, selection);
    const command = new HeaderFooterCommand(host, "header");
    command.do();
    expect(document.sections[0]?.headers.get("default")).toBeTruthy();
    expect(selection.caret()?.story.slot).toBe("header");
    command.undo();
    expect(document.sections[0]?.headers.get("default")).toBeUndefined();
    expect(selection.caret()?.story.slot).toBe("body");
  });
});
