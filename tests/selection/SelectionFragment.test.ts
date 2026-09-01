import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelRange } from "../../src/selection/SelRange";
import { Selection } from "../../src/selection/Selection";
import { SelectionFragment } from "../../src/selection/SelectionFragment";
import type { StoryRef } from "../../src/selection/StoryRef";

const body: StoryRef = { slot: "body" };
const fragment = new SelectionFragment();

function styledDoc(): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  paragraph.attrs = { textAlign: "center" };
  const bold = new Block();
  bold.text = "加粗";
  bold.style = { bold: true, color: "#C00000", fontSizePx: 21 };
  const plain = new Block();
  plain.text = "普通";
  paragraph.addBlock(bold);
  paragraph.addBlock(plain);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

describe("SelectionFragment", () => {
  it("按 run 切开并带上字符样式", () => {
    const document = styledDoc();
    const selection = new Selection();
    const start = new CaretPos(body, document.words.head, false);
    const end = new CaretPos(body, document.words.tail, false);
    selection.setRange(new SelRange(body, start, end));
    const payload = fragment.extract(selection);
    expect(payload.text).toBe("加粗普通");
    expect(payload.paragraphs).toHaveLength(1);
    expect(payload.paragraphs[0].attrs.textAlign).toBe("center");
    expect(payload.paragraphs[0].runs).toEqual([
      { text: "加粗", style: { bold: true, color: "#C00000", fontSizePx: 21 } },
      { text: "普通", style: {} },
    ]);
  });
});
