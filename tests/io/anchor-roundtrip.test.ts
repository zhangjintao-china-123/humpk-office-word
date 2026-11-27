import { describe, expect, it } from "vitest";
import { applyPicturePlace, applyPictureSize, applyPictureWrap } from "../../src/edit/PictureTransform";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";

const reader = new DocxReader();

function read(body: string) {
  return reader.readPackage(DocxPackage.fromParts({ texts: {
    "word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:body>${body}</w:body></w:document>`,
  } }));
}

function drawingXml(wrap: string) {
  return `<w:p><w:r><w:drawing><wp:anchor distL="19050" relativeHeight="42" allowOverlap="0" layoutInCell="0">
    <wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH>
    <wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>
    <wp:extent cx="952500" cy="476250"/><wp:effectExtent l="9525" t="0" r="19050" b="0"/>
    ${wrap}<a:graphic><a:graphicData><wps:wsp><wps:spPr><a:prstGeom prst="triangle"/></wps:spPr><wps:bodyPr/></wps:wsp>
    </a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
}

describe("锚定与环绕 DOCX 回写", () => {
  it("读取相对轮廓和绕排间距，改变模式、位置与尺寸后保留轮廓比例和层级", async () => {
    const document = read(drawingXml(`<wp:wrapTight wrapText="bothSides" distL="95250">
      <wp:wrapPolygon><wp:start x="10800" y="0"/><wp:lineTo x="21600" y="21600"/><wp:lineTo x="0" y="21600"/></wp:wrapPolygon>
    </wp:wrapTight>`));
    const drawing = document.paragraphs.head!.data.blocks[0].drawing!;
    expect(drawing.anchorSet).toMatchObject({
      distLeft: 10, zIndex: 42, polygon: [{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
    });
    applyPicturePlace(drawing, "middle-center");
    applyPictureWrap(drawing, "through");
    applyPictureSize(drawing, 200, 100, false);
    const pack = await DocxPackage.open(await new DocxWriter().write(document));
    const xml = pack.xml("word/document.xml");
    expect(xml).toContain('<wp:lineTo x="21600" y="21600"/>');
    const reopened = reader.readPackage(pack).paragraphs.head!.data.blocks[0].drawing!;
    expect(reopened.anchorSet).toMatchObject({
      wrapType: "through", zIndex: 42, distLeft: 10, leftAlign: "center", topAlign: "center",
      allowOverlap: false, layoutInCell: false, effectExtent: { left: 1, right: 2 },
      polygon: [{ x: 100, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }],
    });
  });

  it("新选紧密环绕时为形状生成有效轮廓", async () => {
    const document = read(drawingXml('<wp:wrapSquare wrapText="bothSides"/>'));
    const drawing = document.paragraphs.head!.data.blocks[0].drawing!;
    applyPictureWrap(drawing, "tight");
    const pack = await DocxPackage.open(await new DocxWriter().write(document));
    expect(pack.xml("word/document.xml")).toContain('<wp:wrapPolygon><wp:start x="10800" y="0"/>');
    expect(reader.readPackage(pack).paragraphs.head!.data.blocks[0].drawing?.anchorSet?.polygon).toHaveLength(3);
  });

  it("浮动表格保存后仍保留锚点基准、对齐、文字间距和单元格内容", async () => {
    const document = read(`<w:tbl><w:tblPr><w:tblpPr w:horzAnchor="margin" w:vertAnchor="page"
      w:tblpXSpec="center" w:tblpY="600" w:leftFromText="180" w:bottomFromText="45"/>
      <w:tblOverlap w:val="never"/></w:tblPr><w:tblGrid><w:gridCol w:w="1200"/></w:tblGrid>
      <w:tr><w:tc><w:p><w:r><w:t>表身</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`);
    const original = document.paragraphs.head!.data.table!;
    expect(original.anchorSet).toMatchObject({
      leftFrom: "margin", leftAlign: "center", topFrom: "page", top: 40, distLeft: 12, distBottom: 3, allowOverlap: false,
    });
    const reopened = await reader.read(await new DocxWriter().write(document));
    const paragraph = reopened.paragraphs.head!.data;
    expect(paragraph.hasAnchor).toBe(true);
    expect(paragraph.table?.anchorSet).toEqual(original.anchorSet);
    expect(paragraph.table?.rows[0].cells[0].document.paragraphText()).toEqual(["表身"]);
  });
});
