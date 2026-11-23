import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import type { PageLabel } from "../../src/model/document/PageLabel";
import { buildFieldView } from "../../src/model/field/FieldDisplay";
import { Line } from "../../src/model/line/Line";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

describe("正文超链接和目录以外的域", () => {
  it("外部链接和书签链接能读出来，并带上链接外观", () => {
    const document = read(`
      <w:p>
        <w:hyperlink r:id="rId2"><w:r><w:t>官网</w:t></w:r></w:hyperlink>
      </w:p>
      <w:p>
        <w:bookmarkStart w:id="1" w:name="结论"/>
        <w:r><w:t>结论在这</w:t></w:r>
        <w:bookmarkEnd w:id="1"/>
      </w:p>
      <w:p>
        <w:hyperlink w:anchor="结论"><w:r><w:rPr><w:color w:val="C00000"/></w:rPr><w:t>见结论</w:t></w:r></w:hyperlink>
      </w:p>`);
    const paragraphs = document.paragraphs.toArray();
    expect(paragraphs[0].blocks[0].link).toEqual({ url: "https://example.com/a" });
    expect(paragraphs[0].blocks[0].style.color).toBe("#0563C1");
    expect(paragraphs[0].blocks[0].style.underline).toBe("single");
    expect(paragraphs[1].bookmarks).toEqual(["结论"]);
    expect(paragraphs[2].blocks[0].link).toEqual({ anchor: "结论" });
    expect(paragraphs[2].blocks[0].style.color).toBe("#C00000");
  });

  it("HYPERLINK 域和 DATE、QUOTE 域能写回再读回", async () => {
    const document = read(`
      <w:p>
        <w:fldSimple w:instr=" HYPERLINK &quot;https://example.com/b&quot; ">
          <w:r><w:t>外链</w:t></w:r>
        </w:fldSimple>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText xml:space="preserve"> DATE \\@ &quot;yyyy-MM-dd&quot; </w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="separate"/></w:r>
        <w:r><w:t>2020-01-02</w:t></w:r>
        <w:r><w:fldChar w:fldCharType="end"/></w:r>
        <w:fldSimple w:instr=" QUOTE &quot;原样&quot; "><w:r><w:t>原样</w:t></w:r></w:fldSimple>
      </w:p>`);
    const blocks = document.paragraphs.toArray()[0].blocks;
    expect(blocks[0].link?.url).toBe("https://example.com/b");
    expect(blocks[0].field).toBeUndefined();
    expect(blocks[1].field).toBe("DATE");
    expect(blocks[1].fieldInstr).toContain("yyyy-MM-dd");
    expect(blocks[2].field).toBe("OTHER");
    expect(blocks[2].text).toBe("原样");

    document.fileName = "报告.docx";
    const pack = await DocxPackage.open(await new DocxWriter().write(document));
    const rels = pack.xml("word/_rels/document.xml.rels") ?? "";
    expect(rels).toContain('TargetMode="External"');
    expect(rels).toContain("https://example.com/b");
    const back = new DocxReader().readPackage(pack);
    const again = back.paragraphs.toArray()[0].blocks;
    expect(again[0].link?.url).toBe("https://example.com/b");
    expect(again[1].field).toBe("DATE");
    expect(again[1].text).toBe("2020-01-02");
    expect(again[2].field).toBe("OTHER");
    expect(again[2].text).toBe("原样");
    expect(back.fileName).toBeUndefined();
  });

  it("作者、日期、页码引用和序号按文档内容刷新", () => {
    const document = new Document();
    document.props = { title: "年度报告", creator: "张三", created: new Date("2024-05-06T00:00:00Z") };
    document.fileName = "报告.docx";
    document.styles.add({ styleId: "Heading1", name: "heading 1" });
    const heading = paragraph("第一章", 1);
    heading.attrs.styleId = "Heading1";
    heading.bookmarks = ["ch1"];
    const body = new Paragraph(2);
    body.addBlock(fieldBlock("AUTHOR", "AUTHOR", "某人"));
    body.addBlock(fieldBlock("TITLE", "TITLE", ""));
    body.addBlock(fieldBlock("FILENAME", "FILENAME", ""));
    body.addBlock(fieldBlock("DATE", 'DATE \\@ "yyyy-MM-dd"', "2000-01-01"));
    body.addBlock(fieldBlock("CREATEDATE", "CREATEDATE", ""));
    body.addBlock(fieldBlock("REF", "REF ch1", ""));
    body.addBlock(fieldBlock("PAGEREF", "PAGEREF ch1", "9"));
    body.addBlock(fieldBlock("STYLEREF", 'STYLEREF "heading 1"', ""));
    body.addBlock(fieldBlock("SEQ", "SEQ 图", "0"));
    body.addBlock(fieldBlock("SEQ", "SEQ 图", "0"));
    document.addParagraph(heading);
    document.addParagraph(body);
    const line = new Line();
    line.paragraph = heading;
    line.top = 1200;
    const label: PageLabel = {
      sectionIndex: 0,
      pageInSection: 2,
      pageNumber: 2,
      sectionPages: 3,
      totalPages: 4,
      fmt: "decimal",
    };
    const view = buildFieldView(document, [line], [label, label], 1000, new Date("2026-11-20T09:00:00"));
    const shown = body.blocks.map((block) => view.text.get(block));
    expect(shown).toEqual(["张三", "年度报告", "报告.docx", "2026-11-20", "2024-05-06", "第一章", "2", "第一章", "1", "2"]);
  });
});

function read(body: string): Document {
  const pack = DocxPackage.fromParts({
    texts: {
      "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}</w:body></w:document>`,
      "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL}">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/a" TargetMode="External"/>
</Relationships>`,
      "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>核心标题</dc:title>
  <dc:creator>李四</dc:creator>
</cp:coreProperties>`,
    },
  });
  return new DocxReader().readPackage(pack);
}

function paragraph(text: string, id: number): Paragraph {
  const item = new Paragraph(id);
  const block = new Block();
  block.text = text;
  item.addBlock(block);
  return item;
}

function fieldBlock(field: Block["field"], instr: string, text: string): Block {
  const block = new Block();
  block.field = field;
  block.fieldInstr = instr;
  block.text = text;
  return block;
}
