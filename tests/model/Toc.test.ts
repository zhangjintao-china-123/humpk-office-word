import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Line } from "../../src/model/line/Line";
import { assignTocPages, outlineLevelOf, syncToc } from "../../src/model/toc/Toc";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";

function heading(document: Document, level: number, text: string): Paragraph {
  const paragraph = new Paragraph(document.nextParagraphId());
  paragraph.attrs.outlineLevel = level;
  const block = new Block();
  block.text = text;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  return paragraph;
}

describe("目录", () => {
  it("按大纲级别生成条目，页码跟标题所在页", () => {
    const document = new Document();
    const first = heading(document, 1, "总则");
    heading(document, 2, "范围");
    const later = heading(document, 1, "管理要求");
    syncToc(document, first);

    const items = document.paragraphs.toArray();
    expect(items.map((item) => item.toc?.role)).toEqual(["start", "entry", "entry", "entry", "end", undefined, undefined, undefined]);
    expect(items[1].getFullText()).toBe("总则");
    expect(items[1].toc?.level).toBe(1);
    expect(items[2].getFullText()).toBe("范围");
    expect(items[2].attrs.leftChars).toBe(200);
    expect(items[3].getFullText()).toBe("管理要求");
    expect(items[0].getFullText()).toBe("目录");
    expect(first.bookmarks[0]).toMatch(/^_Toc/);

    const line = new Line();
    line.top = 900;
    later.lines = [line];
    assignTocPages(document, 800);
    expect(items[3].toc?.page).toBe(2);
    expect(items[3].toc?.targetId).toBe(later.id);
  });

  it("写出后再读回，条目连到标题，不把页码写进标题", async () => {
    const document = new Document();
    document.styles.add({ styleId: "Heading1", name: "heading 1", type: "paragraph" });
    const chapter = new Paragraph(document.nextParagraphId());
    chapter.attrs.styleId = "Heading1";
    chapter.attrs.outlineLevel = 1;
    const block = new Block();
    block.text = "第一章";
    chapter.addBlock(block);
    document.addParagraph(chapter);
    syncToc(document, chapter);
    const entry = document.paragraphs.toArray().find((item) => item.toc?.role === "entry");
    if (entry?.toc) {
      entry.toc.page = 4;
    }

    const read = await new DocxReader().read(await new DocxWriter().write(document));
    const items = read.paragraphs.toArray();
    const linked = items.find((item) => item.bookmarks.some((name) => name.startsWith("_Toc")));
    expect(items[0].toc?.role).toBe("start");
    expect(items[0].getFullText()).toBe("目录");
    expect(items[1].toc?.role).toBe("entry");
    expect(items[1].getFullText()).toBe("第一章");
    expect(items[1].toc?.targetId).toBe(linked?.id);
    expect(items[1].blocks.every((run) => run.field == null)).toBe(true);
    expect(linked?.attrs.outlineLevel).toBe(1);
    expect(linked?.getFullText()).toBe("第一章");
  });

  it("读入已有目录时识别标题级别，PAGEREF 不当成当前页码", () => {
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
</w:styles>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>目录</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="TOC1"/></w:pPr>
      <w:hyperlink w:anchor="_Toc10">
        <w:r><w:t>总则</w:t></w:r>
        <w:r><w:tab/></w:r>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText> PAGEREF _Toc10 \\h </w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="separate"/></w:r>
        <w:r><w:t>9</w:t></w:r>
        <w:r><w:fldChar w:fldCharType="end"/></w:r>
      </w:hyperlink>
    </w:p>
    <w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
    <w:p>
      <w:bookmarkStart w:id="10" w:name="_Toc10"/>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>总则</w:t></w:r>
      <w:bookmarkEnd w:id="10"/>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>范围</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;
    const document = new DocxReader().readPackage(DocxPackage.fromParts({ texts: { "word/styles.xml": styles, "word/document.xml": documentXml } }));
    const items = document.paragraphs.toArray();
    expect(items[0].toc?.role).toBe("start");
    expect(items[0].toc?.maxLevel).toBe(3);
    expect(items[1].toc?.role).toBe("entry");
    expect(items[1].getFullText()).toBe("总则");
    expect(items[1].blocks.every((run) => run.field == null)).toBe(true);
    expect(items[1].toc?.targetId).toBe(items[3].id);
    expect(items[2].toc?.role).toBe("end");
    expect(outlineLevelOf(items[3], document.styles)).toBe(1);
    expect(items[4].attrs.outlineLevel).toBe(2);
  });
});
