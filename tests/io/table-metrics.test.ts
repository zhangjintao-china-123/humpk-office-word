import { describe, expect, it } from "vitest";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
import { twipToPx } from "../../src/shared/units";

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="2500" w:type="pct"/>
        <w:jc w:val="center"/>
        <w:tblInd w:w="720" w:type="dxa"/>
        <w:tblCellMar>
          <w:top w:w="0" w:type="dxa"/>
          <w:left w:w="200" w:type="dxa"/>
          <w:bottom w:w="0" w:type="dxa"/>
          <w:right w:w="200" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="1440"/>
        <w:gridCol w:w="1440"/>
      </w:tblGrid>
      <w:tr>
        <w:trPr>
          <w:trHeight w:val="600" w:hRule="exact"/>
          <w:tblHeader/>
        </w:trPr>
        <w:tc>
          <w:tcPr>
            <w:vAlign w:val="center"/>
            <w:tcW w:w="2500" w:type="pct"/>
          </w:tcPr>
          <w:p><w:r><w:t>标题</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcMar>
              <w:top w:w="120" w:type="dxa"/>
              <w:left w:w="0" w:type="dxa"/>
              <w:bottom w:w="120" w:type="dxa"/>
              <w:right w:w="0" w:type="dxa"/>
            </w:tcMar>
          </w:tcPr>
          <w:p><w:r><w:t>右</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

describe("表格版式读写", () => {
  it("读入表宽、对齐、边距、行高、垂直对齐和标题行", () => {
    const pack = DocxPackage.fromParts({ texts: { "word/document.xml": xml } });
    const table = new DocxReader().readPackage(pack).paragraphs.toArray()[0].table;
    expect(table?.width).toEqual({ type: "pct", value: 50 });
    expect(table?.align).toBe("center");
    expect(table?.indent).toEqual({ type: "dxa", value: twipToPx(720) });
    expect(table?.cellMargin?.left).toBe(twipToPx(200));
    expect(table?.rows[0].header).toBe(true);
    expect(table?.rows[0].heightRule).toBe("exact");
    expect(table?.rows[0].height).toBe(twipToPx(600));
    expect(table?.rows[0].cells[0].vAlign).toBe("center");
    expect(table?.rows[0].cells[0].width).toEqual({ type: "pct", value: 50 });
    expect(table?.rows[0].cells[1].margin?.top).toBe(twipToPx(120));
  });

  it("写回后再读回这些属性", async () => {
    const table = new Table();
    const column = new TableColumn();
    column.width = 120;
    table.columns = [column];
    table.width = { type: "pct", value: 100 };
    table.align = "right";
    table.indent = { type: "dxa", value: 12 };
    table.cellMargin = { top: 0, right: 8, bottom: 0, left: 8 };
    const row = new TableRow();
    row.header = true;
    row.heightRule = "atLeast";
    row.height = 36;
    const cell = new TableCell(new Document());
    cell.vAlign = "bottom";
    cell.margin = { top: 4, right: 0, bottom: 4, left: 0 };
    const paragraph = new Paragraph(1);
    cell.document.addParagraph(paragraph);
    row.cells = [cell];
    table.rows = [row];
    const document = new Document();
    const holder = new Paragraph(1);
    holder.isTable = true;
    holder.table = table;
    document.addParagraph(holder);

    const back = await new DocxReader().read(await new DocxWriter().write(document));
    const read = back.paragraphs.toArray()[0].table;
    expect(read?.width).toEqual({ type: "pct", value: 100 });
    expect(read?.align).toBe("right");
    expect(read?.indent?.value).toBe(12);
    expect(read?.cellMargin?.left).toBe(8);
    expect(read?.rows[0].header).toBe(true);
    expect(read?.rows[0].heightRule).toBe("atLeast");
    expect(read?.rows[0].height).toBe(36);
    expect(read?.rows[0].cells[0].vAlign).toBe("bottom");
    expect(read?.rows[0].cells[0].margin?.top).toBe(4);
  });

  it("继承 styles.xml 中的表格样式边框与边距并在保存后保留", async () => {
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="table" w:default="1" w:styleId="a1">
    <w:name w:val="Normal Table"/>
    <w:tblPr>
      <w:tblCellMar>
        <w:top w:w="0" w:type="dxa"/>
        <w:left w:w="108" w:type="dxa"/>
        <w:bottom w:w="0" w:type="dxa"/>
        <w:right w:w="108" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  </w:style>
  <w:style w:type="table" w:styleId="ae">
    <w:name w:val="Table Grid"/>
    <w:basedOn w:val="a1"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>
</w:styles>`;
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="ae"/>
        <w:tblW w:w="0" w:type="auto"/>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="1440"/><w:gridCol w:w="1440"/></w:tblGrid>
      <w:tr>
        <w:tc><w:p><w:r><w:t>甲</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>乙</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;
    const pack = DocxPackage.fromParts({
      texts: { "word/document.xml": docXml, "word/styles.xml": stylesXml },
    });
    const doc = new DocxReader().readPackage(pack);
    const table = doc.paragraphs.toArray()[0].table;
    expect(table?.styleId).toBe("ae");
    expect(table?.borders?.top).toEqual({ type: "single", size: "4", color: "#000000" });
    expect(table?.borders?.insideH).toEqual({ type: "single", size: "4", color: "#000000" });
    expect(table?.borders?.insideV).toEqual({ type: "single", size: "4", color: "#000000" });
    expect(table?.cellMargin?.left).toBe(twipToPx(108));

    const written = await new DocxWriter().write(doc);
    const savedPack = await DocxPackage.open(written);
    expect(savedPack.xml("word/document.xml")).toContain('<w:tblStyle w:val="ae"/>');
    expect(savedPack.xml("word/document.xml")).toContain("<w:tblBorders>");
    expect(savedPack.xml("word/styles.xml")).toContain('<w:style w:type="table" w:default="1" w:styleId="a1">');
    expect(savedPack.xml("word/styles.xml")).toContain("<w:tblBorders>");

    const back = await new DocxReader().read(written);
    const roundtripTable = back.paragraphs.toArray()[0].table;
    expect(roundtripTable?.styleId).toBe("ae");
    expect(roundtripTable?.borders?.top).toEqual({ type: "single", size: "4", color: "#000000" });
    expect(roundtripTable?.borders?.insideH).toEqual({ type: "single", size: "4", color: "#000000" });
    expect(roundtripTable?.borders?.insideV).toEqual({ type: "single", size: "4", color: "#000000" });
    expect(roundtripTable?.cellMargin?.left).toBe(twipToPx(108));
  });
});
