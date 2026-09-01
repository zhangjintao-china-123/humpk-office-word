import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

function readFixture(name: string): string {
  return readFileSync(join(fixtureDir, "../fixtures", name), "utf8");
}

describe("DocxReader 解析 document.xml", () => {
  it("解析段落、Run 样式，并保留 Block 原文", () => {
    const pack = DocxPackage.fromParts({
      texts: { "word/document.xml": readFixture("simple-document.xml") },
    });
    const document = new DocxReader().readPackage(pack);
    const paragraphs = document.paragraphs.toArray();

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0].getFullText()).toBe("你好 Word");
    expect(paragraphs[0].attrs.textAlign).toBe("center");
    expect(paragraphs[0].blocks[0].style.bold).toBe(true);
    expect(paragraphs[0].blocks[0].style.color).toBe("#FF0000");
    expect(paragraphs[0].blocks[0].style.fontSizeHalfPoint).toBe(28);
    expect(paragraphs[1].getFullText()).toBe("第二段");
    expect(paragraphs[2].getFullText()).toBe("");
  });

  it("拆字后链表拼回全文，且不清空 Block", () => {
    const pack = DocxPackage.fromParts({
      texts: { "word/document.xml": readFixture("simple-document.xml") },
    });
    const document = new DocxReader().readPackage(pack);
    const builder = new WordStreamBuilder();
    builder.build(document);

    expect(builder.joinText(document)).toBe("你好 Word\n第二段\n\n");
    expect(document.paragraphs.toArray()[0].blocks[0].text).toBe("你好");
    expect(document.words.toArray().filter((word) => word.char === "\n")).toHaveLength(3);
  });

  it("解析表格单元格中的嵌套段落", () => {
    const pack = DocxPackage.fromParts({
      texts: { "word/document.xml": readFixture("table-document.xml") },
    });
    const document = new DocxReader().readPackage(pack);
    const tableParagraph = document.paragraphs.toArray()[0];

    expect(tableParagraph.isTable).toBe(true);
    expect(tableParagraph.table?.columns).toHaveLength(2);
    expect(tableParagraph.table?.columns[0].width).toBe(96);
    expect(tableParagraph.table?.rows[0].cells[0].document.kind).toBe("cell");
    expect(tableParagraph.table?.rows[0].cells[0].document.paragraphText()).toEqual(["A1"]);
    expect(tableParagraph.table?.rows[0].cells[1].document.paragraphText()).toEqual(["B1"]);
  });

  it("解析表级 tblBorders 与单元格对角线", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblPr>
        <w:tblBorders>
          <w:top w:val="single" w:sz="24" w:color="000000"/>
          <w:left w:val="single" w:sz="24" w:color="000000"/>
          <w:bottom w:val="single" w:sz="24" w:color="000000"/>
          <w:right w:val="single" w:sz="24" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:color="FF0000"/>
          <w:insideV w:val="single" w:sz="4" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="1440"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcBorders>
              <w:tl2br w:val="single" w:sz="8" w:color="00B0F0"/>
            </w:tcBorders>
          </w:tcPr>
          <w:p><w:r><w:t>A</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`,
      },
    });
    const table = new DocxReader().readPackage(pack).paragraphs.toArray()[0].table;
    expect(table?.borders?.top?.size).toBe("24");
    expect(table?.borders?.insideH?.color).toBe("#FF0000");
    expect(table?.borders?.insideV?.color).toBe("#000000");
    expect(table?.rows[0].cells[0].borders?.tl2br?.color).toBe("#00B0F0");
  });

  it("页眉页脚复用同一套 StoryParser，页眉里的表格单元格也能再嵌套解析", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": readFixture("header-document.xml"),
        "word/_rels/document.xml.rels": readFixture("document.xml.rels"),
        "word/header1.xml": readFixture("header1.xml"),
        "word/footer1.xml": readFixture("footer1.xml"),
      },
    });
    const document = new DocxReader().readPackage(pack);
    const header = document.header();
    const footer = document.footer();

    expect(document.paragraphText()).toEqual(["正文"]);
    expect(header?.kind).toBe("header");
    expect(header?.partName).toBe("word/header1.xml");
    expect(header?.paragraphText()[0]).toBe("页眉标题");
    expect(header?.paragraphs.toArray()[1].isTable).toBe(true);
    expect(header?.paragraphs.toArray()[1].table?.rows[0].cells[0].document.kind).toBe("cell");
    expect(header?.paragraphs.toArray()[1].table?.rows[0].cells[0].document.paragraphText()).toEqual(["页眉格"]);
    expect(footer?.kind).toBe("footer");
    expect(footer?.paragraphText()).toEqual(["第 1 页"]);

    const builder = new WordStreamBuilder();
    builder.build(document);
    expect(builder.joinText(header!)).toBe("页眉标题\n");
    expect(builder.joinText(header!.paragraphs.toArray()[1].table!.rows[0].cells[0].document)).toBe("页眉格\n");
    expect(builder.joinText(footer!)).toBe("第 1 页\n");
  });

  it("解析行内图片尺寸和 data URL", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": readFixture("drawing-document.xml"),
        "word/_rels/document.xml.rels": readFixture("drawing-document.xml.rels"),
      },
      media: {
        "word/media/image1.png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    });
    const document = new DocxReader().readPackage(pack);
    const drawing = document.paragraphs.toArray()[0].blocks[0].drawing;
    expect(drawing?.position).toBe("inline");
    expect(drawing?.width).toBe(96);
    expect(drawing?.height).toBe(48);
    expect(drawing?.url?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("解析锚定图片的位置和上下型绕排", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": readFixture("anchor-document.xml"),
        "word/_rels/document.xml.rels": readFixture("drawing-document.xml.rels"),
      },
      media: {
        "word/media/image1.png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    });
    const document = new DocxReader().readPackage(pack);
    const paragraph = document.paragraphs.toArray()[0];
    const drawing = paragraph.blocks.find((block) => block.drawing)?.drawing;
    expect(paragraph.hasAnchor).toBe(true);
    expect(drawing?.position).toBe("anchor");
    expect(drawing?.anchorSet?.wrapType).toBe("nowrap");
    expect(drawing?.anchorSet?.leftFrom).toBe("page");
    expect(drawing?.anchorSet?.topFrom).toBe("paragraph");
    expect(drawing?.width).toBe(96);
    expect(drawing?.anchorSet?.left).toBeCloseTo(151.16, 1);
  });

  it("解析紧密绕排多边形和相对字符定位", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": readFixture("tight-anchor-document.xml"),
        "word/_rels/document.xml.rels": readFixture("drawing-document.xml.rels"),
      },
      media: {
        "word/media/image1.png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    });
    const document = new DocxReader().readPackage(pack);
    const drawing = document.paragraphs.toArray()[0].blocks.find((block) => block.drawing)?.drawing;
    expect(drawing?.anchorSet?.wrapType).toBe("tight");
    expect(drawing?.anchorSet?.leftFrom).toBe("character");
    expect(drawing?.anchorSet?.topFrom).toBe("character");
    expect(drawing?.anchorSet?.polygon).toHaveLength(3);
    expect(drawing?.anchorSet?.polygon?.[1].x).toBeCloseTo(96, 0);
    expect(drawing?.anchorSet?.polygon?.[1].y).toBeCloseTo(48, 0);
  });

  it("解析节属性：页边距与行网格", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>正文</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="720" w:footer="851"/>
      <w:titlePg/>
      <w:docGrid w:type="lines" w:linePitch="312"/>
    </w:sectPr>
  </w:body>
</w:document>`,
      },
    });
    const section = new DocxReader().readPackage(pack).lastSection();
    expect(section?.pageWidthPx).toBeCloseTo(11906 / 15, 5);
    expect(section?.leftMarginPx).toBeCloseTo(1800 / 15, 5);
    expect(section?.rightMarginPx).toBeCloseTo(1800 / 15, 5);
    expect(section?.linePitchPx).toBeCloseTo(312 / 15, 5);
    expect(section?.docGridType).toBe("lines");
    expect(section?.headerFromEdgePx).toBeCloseTo(720 / 15, 5);
    expect(section?.footerFromEdgePx).toBeCloseTo(851 / 15, 5);
    expect(section?.titlePg).toBe(true);
  });

  it("解析 settings.xml 的奇偶页眉，缺 even 时补空白", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": readFixture("header-document.xml"),
        "word/_rels/document.xml.rels": readFixture("document.xml.rels"),
        "word/header1.xml": readFixture("header1.xml"),
        "word/footer1.xml": readFixture("footer1.xml"),
        "word/settings.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:evenAndOddHeaders/>
</w:settings>`,
      },
    });
    const document = new DocxReader().readPackage(pack);
    expect(document.evenAndOddHeaders).toBe(true);
    expect(document.header("even")?.kind).toBe("header");
    expect(document.header("even")?.paragraphText()).toEqual([""]);
    expect(document.header("default")?.paragraphText()[0]).toBe("页眉标题");
  });

  it("解析 settings.xml 的表格网格兼容项", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": readFixture("simple-document.xml"),
        "word/settings.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:compat>
    <w:adjustLineHeightInTable/>
  </w:compat>
</w:settings>`,
      },
    });
    expect(new DocxReader().readPackage(pack).adjustLineHeightInTable).toBe(true);
  });
});
