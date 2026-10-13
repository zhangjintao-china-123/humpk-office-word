import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Section } from "../../src/model/document/Section";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

describe("页眉页脚域与分节写回", () => {
  it("复杂 PAGE 和 NUMPAGES 读成可刷新的域", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>
  <w:p>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
    <w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>9</w:t></w:r></w:fldSimple>
  </w:p>
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
</w:body></w:document>`,
      },
    });
    const document = new DocxReader().readPackage(pack);
    const blocks = document.paragraphs.toArray()[0].blocks;
    expect(blocks.map((block) => block.field)).toEqual(["PAGE", "NUMPAGES"]);
    expect(blocks.map((block) => block.text)).toEqual(["1", "9"]);
  });

  it("两节页眉、页码格式、制表位和底边框能写回再读回", async () => {
    const document = new Document();
    const first = new Section();
    first.titlePg = true;
    first.breakType = "oddPage";
    first.headers.set("default", story("甲"));
    const second = new Section();
    second.pageNumFmt = "lowerRoman";
    second.pageNumStart = 1;
    second.headers.set("default", story("乙"));
    document.sections.push(first, second);

    const ended = new Paragraph(1);
    ended.sectionIndex = 0;
    ended.attrs.endsSection = true;
    ended.attrs.sectionBreak = "oddPage";
    ended.attrs.tabs = [{ posPx: 200, val: "center" }];
    ended.attrs.borderBottom = { val: "single", sz: "12", color: "1F4E79" };
    const page = new Block();
    page.text = "1";
    page.field = "PAGE";
    const total = new Block();
    total.text = "1";
    total.field = "NUMPAGES";
    ended.addBlock(page);
    ended.addBlock(total);
    document.addParagraph(ended);

    const next = new Paragraph(2);
    next.sectionIndex = 1;
    const text = new Block();
    text.text = "第二节";
    next.addBlock(text);
    document.addParagraph(next);

    const back = await new DocxReader().read(await new DocxWriter().write(document));
    expect(back.sections).toHaveLength(2);
    expect(back.sections[0].titlePg).toBe(true);
    expect(back.sections[0].breakType).toBe("oddPage");
    expect(back.sections[0].headers.get("default")?.paragraphText()[0]).toBe("甲");
    expect(back.sections[1].pageNumFmt).toBe("lowerRoman");
    expect(back.sections[1].pageNumStart).toBe(1);
    expect(back.sections[1].headers.get("default")?.paragraphText()[0]).toBe("乙");
    const head = back.paragraphs.toArray()[0];
    expect(head.sectionIndex).toBe(0);
    expect(head.sectionBreak).toBe("oddPage");
    expect(head.attrs.tabs?.[0]).toMatchObject({ val: "center", posPx: 200 });
    expect(head.attrs.borderBottom).toMatchObject({ val: "single", sz: "12", color: "1F4E79" });
    expect(head.blocks.map((block) => block.field)).toEqual(["PAGE", "NUMPAGES"]);
    expect(back.paragraphs.toArray()[1].sectionIndex).toBe(1);
  });
});

function story(text: string): Document {
  const document = new Document();
  document.kind = "header";
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  return document;
}
