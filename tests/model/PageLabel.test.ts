import { describe, expect, it } from "vitest";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { assignSections, fieldKind, fieldValues, labelPages } from "../../src/model/document/PageLabel";
import { Section } from "../../src/model/document/Section";
import { Line } from "../../src/model/line/Line";

describe("页码与分节", () => {
  it("区分当前页字段和书签交叉引用页码", () => {
    expect(fieldKind(" PAGE ")).toBe("PAGE");
    expect(fieldKind("NUMPAGES")).toBe("NUMPAGES");
    expect(fieldKind(" SECTIONPAGES ")).toBe("SECTIONPAGES");
    expect(fieldKind(" PAGEREF _Toc1 \\h ")).toBe("PAGEREF");
  });

  it("带 sectPr 的段落留在本节，后面的段落进入下一节", () => {
    const document = new Document();
    document.sections.push(new Section(), new Section());
    const ended = new Paragraph(1);
    ended.attrs.endsSection = true;
    ended.attrs.sectionBreak = "oddPage";
    const next = new Paragraph(2);
    document.addParagraph(ended);
    document.addParagraph(next);
    assignSections(document);
    expect(ended.sectionIndex).toBe(0);
    expect(ended.sectionBreak).toBe("oddPage");
    expect(next.sectionIndex).toBe(1);
    expect(next.sectionBreak).toBeUndefined();
  });

  it("第二节可以重排页码，总页数仍是全文页数", () => {
    const first = new Section();
    const second = new Section();
    second.pageNumStart = 1;
    second.pageNumFmt = "lowerRoman";
    const lines = [0, 100, 200].map((top, index) => {
      const line = new Line();
      line.top = top;
      const paragraph = new Paragraph(index + 1);
      paragraph.sectionIndex = index < 2 ? 0 : 1;
      line.paragraph = paragraph;
      return line;
    });
    const labels = labelPages(lines, 100, 3, [first, second]);
    expect(labels.map((label) => label.pageNumber)).toEqual([1, 2, 1]);
    expect(labels[0].sectionPages).toBe(2);
    expect(labels[2].sectionPages).toBe(1);
    expect(labels[2].pageInSection).toBe(1);
    expect(fieldValues(labels[2])).toEqual({ PAGE: "i", NUMPAGES: "3", SECTIONPAGES: "1" });
    expect(fieldValues(labels[1]).NUMPAGES).toBe("3");
  });
});
