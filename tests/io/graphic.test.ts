import { describe, expect, it } from "vitest";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";
import { FallbackMeasurer } from "../../src/layout/measure/FallbackMeasurer";
import { Document } from "../../src/model/document/Document";
import { layoutMath } from "../../src/model/math/MathLayout";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";

describe("形状、文本框和公式", () => {
  it("读出预设形状的填充和线，写回后再读", async () => {
    const document = read(`<w:p>${shape("ellipse", "70AD47", "1F4E79", 548640, 548640)}</w:p>`);
    const drawing = document.paragraphs.toArray()[0].blocks[0].drawing;
    expect(drawing?.shape?.preset).toBe("ellipse");
    expect(drawing?.shape?.fill).toBe("#70AD47");
    expect(drawing?.shape?.line).toBe("#1F4E79");
    expect(drawing?.width).toBeGreaterThan(40);
    const again = await roundtrip(document);
    const written = again.paragraphs.toArray()[0].blocks[0].drawing?.shape;
    expect(written?.preset).toBe("ellipse");
    expect(written?.fill).toBe("#70AD47");
    expect(written?.line).toBe("#1F4E79");
  });

  it("读出文本框里的段落", async () => {
    const inner = "<w:p><w:r><w:t>框内说明</w:t></w:r></w:p><w:p><w:r><w:t>第二行</w:t></w:r></w:p>";
    const document = read(`<w:p>${shape("roundRect", "FFF2CC", "C45911", 1600200, 548640, inner)}</w:p>`);
    const text = document.paragraphs.toArray()[0].blocks[0].drawing?.shape?.text;
    expect(text?.kind).toBe("textbox");
    expect(text?.paragraphs.toArray().map((paragraph) => paragraph.blocks.map((block) => block.text).join(""))).toEqual(["框内说明", "第二行"]);
    const again = await roundtrip(document);
    const saved = again.paragraphs.toArray()[0].blocks[0].drawing?.shape?.text;
    expect(saved?.paragraphs.toArray().map((paragraph) => paragraph.blocks.map((block) => block.text).join(""))).toEqual(["框内说明", "第二行"]);
  });

  it("读出分数、上下标、根号和括号，并按原文写回", async () => {
    const document = read(`<w:p>
      <m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath>
      <m:oMath><m:sSubSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>1</m:t></m:r></m:sub><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSubSup></m:oMath>
      <m:oMath><m:rad><m:e><m:r><m:t>a+b</m:t></m:r></m:e></m:rad></m:oMath>
      <m:oMath><m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e><m:r><m:t>n</m:t></m:r></m:e></m:d></m:oMath>
    </w:p>`);
    const kinds = document.paragraphs.toArray()[0].blocks.map((block) => (block.math?.type === "row" ? block.math.items[0]?.type : block.math?.type));
    expect(kinds).toEqual(["frac", "subsup", "rad", "delim"]);
    const frac = layoutMath(document.paragraphs.toArray()[0].blocks[0].math!, new FallbackMeasurer(), { fontSizePx: 16 });
    const run = layoutMath({ type: "text", text: "a" }, new FallbackMeasurer(), { fontSizePx: 16 });
    expect(frac.height).toBeGreaterThan(run.height);
    expect(frac.glyphs.some((glyph) => glyph.kind === "line")).toBe(true);
    const pack = await DocxPackage.open(await new DocxWriter().write(document));
    const xml = pack.xml("word/document.xml") ?? "";
    expect(xml).toContain("m:f");
    expect(xml).toContain("m:rad");
    const again = new DocxReader().readPackage(pack);
    const againKinds = again.paragraphs.toArray()[0].blocks.map((block) => (block.math?.type === "row" ? block.math.items[0]?.type : undefined));
    expect(againKinds).toEqual(["frac", "subsup", "rad", "delim"]);
  });
});

function shape(preset: string, fill: string, line: string, cx: number, cy: number, text = ""): string {
  const box = text ? `<wps:txbx><w:txbxContent>${text}</w:txbxContent></wps:txbx><wps:bodyPr lIns="45720" tIns="45720" rIns="45720" bIns="45720"/>` : "<wps:bodyPr/>";
  return `<w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:spPr><a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln></wps:spPr>${box}</wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function read(body: string): Document {
  const pack = DocxPackage.fromParts({
    texts: {
      "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:wps="${WPS}" xmlns:m="${M}"><w:body>${body}</w:body></w:document>`,
    },
  });
  return new DocxReader().readPackage(pack);
}

async function roundtrip(document: Document): Promise<Document> {
  return new DocxReader().readPackage(await DocxPackage.open(await new DocxWriter().write(document)));
}
