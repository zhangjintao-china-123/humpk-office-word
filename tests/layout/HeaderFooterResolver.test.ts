import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Section } from "../../src/model/document/Section";
import { HeaderFooterResolver } from "../../src/layout/page/HeaderFooterResolver";

function story(text: string, kind: "header" | "footer" = "header"): Document {
  const document = new Document();
  document.kind = kind;
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  return document;
}

describe("HeaderFooterResolver", () => {
  it("默认一律 default；titlePg 首页用 first；evenAndOdd 偶数页用 even", () => {
    const section = new Section();
    expect(HeaderFooterResolver.typeForPage(section, 1, false)).toBe("default");
    expect(HeaderFooterResolver.typeForPage(section, 2, false)).toBe("default");

    section.titlePg = true;
    expect(HeaderFooterResolver.typeForPage(section, 1, false)).toBe("first");
    expect(HeaderFooterResolver.typeForPage(section, 2, false)).toBe("default");
    expect(HeaderFooterResolver.typeForPage(section, 2, true)).toBe("even");
    expect(HeaderFooterResolver.typeForPage(section, 3, true)).toBe("default");
  });

  it("缺 first/even 时继承上一节或补空白，不用 default 顶替", () => {
    const document = new Document();
    document.evenAndOddHeaders = true;

    const first = new Section();
    first.titlePg = true;
    first.headers.set("default", story("默认眉"));
    document.sections.push(first);

    const second = new Section();
    second.titlePg = true;
    document.sections.push(second);

    HeaderFooterResolver.inherit(document);

    expect(second.headers.get("default")?.paragraphText()).toEqual(["默认眉"]);
    expect(first.headers.get("first")?.paragraphText()).toEqual([""]);
    expect(second.headers.get("first")).toBe(first.headers.get("first"));
    expect(first.headers.get("even")?.paragraphText()).toEqual([""]);
    expect(second.headers.get("even")).toBe(first.headers.get("even"));
    expect(first.headers.get("first")).not.toBe(first.headers.get("default"));
  });
});
