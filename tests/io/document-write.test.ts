import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { Section } from "../../src/model/document/Section";
import { Drawing } from "../../src/model/inline/Drawing";
import { resolveFontFamily } from "../../src/model/style/RunStyle";
import { Table, TableCell, TableColumn, TableRow } from "../../src/model/table/Table";
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

  it("表格的文字、列宽、合并和边框能写回再读回", async () => {
    const document = new Document();
    const lead = new Paragraph(1);
    const leadRun = new Block();
    leadRun.text = "表前";
    lead.addBlock(leadRun);
    document.addParagraph(lead);

    const table = new Table();
    table.columns = [100, 80].map((width) => {
      const column = new TableColumn();
      column.width = width;
      return column;
    });
    table.borders = {
      top: { type: "single", size: "12", color: "#1F4E79" },
      insideH: { type: "single", size: "4", color: "#FF0000" },
    };
    const merged = cell("合并", 0, 0);
    merged.rowSpan = 2;
    const right = cell("右", 0, 1);
    const below = cell("下", 1, 1);
    below.borders = { tl2br: { type: "single", size: "8", color: "#00B0F0" } };
    table.rows = [row(merged, right), row(below)];

    const holder = new Paragraph(2);
    holder.isTable = true;
    holder.table = table;
    document.addParagraph(holder);

    const data = await new DocxWriter().write(document);
    const back = await new DocxReader().read(data);
    const paragraphs = back.paragraphs.toArray();
    expect(paragraphs[0].getFullText()).toBe("表前");
    const read = paragraphs[1].table;
    expect(read?.columns.map((column) => column.width)).toEqual([100, 80]);
    expect(read?.borders?.top?.size).toBe("12");
    expect(read?.borders?.top?.color).toBe("#1F4E79");
    expect(read?.borders?.insideH?.color).toBe("#FF0000");
    expect(read?.rows).toHaveLength(2);
    expect(read?.rows[0].cells.map((item) => item.document.paragraphText()[0])).toEqual(["合并", "右"]);
    expect(read?.rows[0].cells[0].rowSpan).toBe(2);
    expect(read?.rows[1].cells.map((item) => item.document.paragraphText()[0])).toEqual(["下"]);
    expect(read?.rows[1].cells[0].borders?.tl2br?.color).toBe("#00B0F0");
  });

  it("分页符、页码域、图片、页眉和节属性能写回再读回", async () => {
    const document = new Document();
    document.evenAndOddHeaders = true;
    document.numbering.setLevel("1", "0", { start: 1, numFmt: "decimal", lvlText: "%1.", lvlJc: "left" });
    document.styles.add({
      styleId: "Heading1",
      type: "paragraph",
      basedOn: "Normal",
      runStyle: { bold: true },
    });

    const section = new Section();
    section.pageWidthPx = 800;
    section.pageHeightPx = 1000;
    section.leftMarginPx = 72;
    section.titlePg = true;
    section.linePitchPx = 20;
    section.docGridType = "lines";
    const header = new Document();
    const headerParagraph = new Paragraph(1);
    const headerRun = new Block();
    headerRun.text = "页眉";
    headerRun.field = "PAGE";
    headerParagraph.addBlock(headerRun);
    header.addParagraph(headerParagraph);
    section.headers.set("default", header);
    document.sections.push(section);

    const page = new Paragraph(1);
    const breakRun = new Block();
    breakRun.charType = "page";
    page.addBlock(breakRun);
    document.addParagraph(page);

    const pictured = new Paragraph(2);
    const image = new Block();
    const drawing = new Drawing();
    drawing.width = 96;
    drawing.height = 48;
    drawing.url = `data:image/png;base64,${PNG}`;
    image.drawing = drawing;
    pictured.addBlock(image);
    const anchor = new Block();
    const floating = new Drawing();
    floating.position = "anchor";
    floating.width = 40;
    floating.height = 20;
    floating.url = `data:image/png;base64,${PNG}`;
    floating.anchorSet = { wrapType: "nowrap", leftFrom: "page", topFrom: "paragraph", left: 10, top: 4 };
    anchor.drawing = floating;
    pictured.addBlock(anchor);
    document.addParagraph(pictured);

    const titled = new Paragraph(3);
    titled.attrs = { styleId: "Heading1", numId: "1", ilvl: "0", line: "360", lineRule: "auto", textAlign: "center" };
    const title = new Block();
    title.text = "标题";
    titled.addBlock(title);
    document.addParagraph(titled);

    const shaded = new TableCell(new Document());
    shaded.document.addParagraph(textParagraph("底纹"));
    shaded.fill = "#FFEB9C";
    shaded.rowIndex = 0;
    shaded.colIndex = 0;
    const table = new Table();
    const column = new TableColumn();
    column.width = 120;
    table.columns = [column];
    table.rows = [row(shaded)];
    const holder = new Paragraph(4);
    holder.isTable = true;
    holder.table = table;
    document.addParagraph(holder);

    const back = await new DocxReader().read(await new DocxWriter().write(document));
    expect(back.evenAndOddHeaders).toBe(true);
    expect(back.paragraphs.toArray()[0].blocks[0].charType).toBe("page");
    const drawings = back.paragraphs.toArray()[1].blocks.map((block) => block.drawing);
    expect(drawings[0]?.position).toBe("inline");
    expect(drawings[0]?.width).toBe(96);
    expect(drawings[0]?.url?.startsWith("data:image/png;base64,")).toBe(true);
    expect(drawings[1]?.position).toBe("anchor");
    expect(drawings[1]?.anchorSet?.wrapType).toBe("nowrap");
    expect(drawings[1]?.anchorSet?.leftFrom).toBe("page");
    expect(drawings[1]?.anchorSet?.left).toBeCloseTo(10, 0);
    const heading = back.paragraphs.toArray()[2];
    expect(heading.attrs.styleId).toBe("Heading1");
    expect(heading.attrs.numId).toBe("1");
    expect(heading.attrs.textAlign).toBe("center");
    expect(heading.attrs.line).toBe("360");
    expect(heading.blocks[0].style.bold).toBe(true);
    expect(back.numbering.getLevel("1", "0")?.lvlText).toBe("%1.");
    expect(back.header()?.paragraphText()[0]).toBe("页眉");
    expect(back.header()?.paragraphs.toArray()[0].blocks[0].field).toBe("PAGE");
    const readSection = back.lastSection();
    expect(readSection?.pageWidthPx).toBe(800);
    expect(readSection?.pageHeightPx).toBe(1000);
    expect(readSection?.leftMarginPx).toBe(72);
    expect(readSection?.titlePg).toBe(true);
    expect(readSection?.docGridType).toBe("lines");
    expect(readSection?.linePitchPx).toBe(20);
    expect(back.paragraphs.toArray()[3].table?.rows[0].cells[0].fill).toBe("#FFEB9C");
  });
});

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function textParagraph(value: string): Paragraph {
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = value;
  paragraph.addBlock(block);
  return paragraph;
}

function cell(text: string, rowIndex: number, colIndex: number): TableCell {
  const inner = new Document();
  inner.addParagraph(textParagraph(text));
  const item = new TableCell(inner);
  item.rowIndex = rowIndex;
  item.colIndex = colIndex;
  return item;
}

function row(...cells: TableCell[]): TableRow {
  const item = new TableRow();
  item.cells = cells;
  return item;
}
