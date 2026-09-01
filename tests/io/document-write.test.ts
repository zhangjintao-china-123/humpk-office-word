import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { resolveFontFamily } from "../../src/model/style/RunStyle";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";

function styledDoc(): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  paragraph.attrs.textAlign = "center";
  const run = new Block();
  run.text = "你好 Word";
  run.style = {
    bold: true,
    color: "#FF0000",
    fontFamily: "黑体",
    wAscii: "黑体",
    wEastAsia: "黑体",
    wHAnsi: "黑体",
    fontSizeHalfPoint: 28,
    backgroundColor: "#FFFF00",
  };
  paragraph.addBlock(run);
  document.addParagraph(paragraph);
  const empty = new Paragraph(2);
  empty.addBlock(new Block());
  document.addParagraph(empty);
  return document;
}

describe("DocxWriter", () => {
  it("写出最小包的 5 个部件", async () => {
    const data = await new DocxWriter().write(new Document());
    const pack = await DocxPackage.open(data);
    expect(pack.has("[Content_Types].xml")).toBe(true);
    expect(pack.has("_rels/.rels")).toBe(true);
    expect(pack.has("word/document.xml")).toBe(true);
    expect(pack.has("word/_rels/document.xml.rels")).toBe(true);
    expect(pack.has("word/styles.xml")).toBe(true);
  });

  it("空文档回读后至少有一段", async () => {
    const data = await new DocxWriter().write(new Document());
    const document = await new DocxReader().read(data);
    expect(document.paragraphs.toArray().length).toBeGreaterThanOrEqual(1);
    expect(document.paragraphText()[0]).toBe("");
  });

  it("文本与样式 write 后再被 DocxReader 读回", async () => {
    const data = await new DocxWriter().write(styledDoc());
    const document = await new DocxReader().read(data);
    const paragraphs = document.paragraphs.toArray();
    expect(paragraphs[0].getFullText()).toBe("你好 Word");
    expect(paragraphs[0].attrs.textAlign).toBe("center");
    const style = paragraphs[0].blocks[0].style;
    expect(style.bold).toBe(true);
    expect(style.color).toBe("#FF0000");
    expect(style.fontSizeHalfPoint).toBe(28);
    expect(style.backgroundColor).toBe("#FFFF00");
    expect(resolveFontFamily(style, 0x4f60)).toBe("黑体");
    expect(paragraphs[1].getFullText()).toBe("");
  });
});
