import { describe, expect, it } from "vitest";
import { Drawing } from "../../src/model/inline/Drawing";
import { Document } from "../../src/model/document/Document";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Block } from "../../src/model/block/Block";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { bytesToBase64, resolveImage } from "../../src/io/docx/reader/drawing/RasterImage";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const V = "urn:schemas-microsoft-com:vml";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const ASVG = "http://schemas.microsoft.com/office/drawing/2016/SVG/main";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("图片格式", () => {
  it("SVG 和浏览器原生格式直接作为图片地址", () => {
    const svg = bytesToBase64(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"));
    const resolved = resolveImage("svg", svg);
    expect(resolved.display).toBe(`data:image/svg+xml;base64,${svg}`);
    expect(resolved.source).toBe(resolved.display);
  });

  it("EMF 里的位图抽出来显示，写回仍用原来的 EMF", () => {
    const emf = emfWithRedSquare();
    const resolved = resolveImage("emf", emf);
    expect(resolved.source).toBe(`data:image/emf;base64,${emf}`);
    expect(resolved.display?.startsWith("data:image/bmp;base64,")).toBe(true);
    expect(bmpSize(resolved.display!)).toEqual({ width: 2, height: 2 });
    expect(bmpPixel(resolved.display!, 0, 1)).toEqual([0, 0, 255]);
  });

  it("未压缩 TIFF 转成可显示的位图", () => {
    const tiff = tiffRedPixel();
    const resolved = resolveImage("tiff", tiff);
    expect(resolved.source).toContain("image/tiff");
    expect(bmpSize(resolved.display!)).toEqual({ width: 1, height: 1 });
    expect(bmpPixel(resolved.display!, 0, 0)).toEqual([0, 0, 255]);
  });

  it("VML imagedata 和 Choice 里的绘图都能读到", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:v="${V}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:mc="${MC}" xmlns:asvg="${ASVG}">
  <w:body>
    <w:p>
      <w:r>
        <w:pict>
          <v:shape style="width:72pt;height:36pt">
            <v:imagedata r:id="rId4"/>
          </v:shape>
        </w:pict>
      </w:r>
    </w:p>
    <w:p>
      <mc:AlternateContent>
        <mc:Choice Requires="wps">
          <w:r>
            <w:drawing>
              <wp:inline>
                <wp:extent cx="952500" cy="952500"/>
                <a:graphic><a:graphicData><a:blip r:embed="rId5"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip r:embed="rId6"/></a:ext></a:extLst></a:blip></a:graphicData></a:graphic>
              </wp:inline>
            </w:drawing>
          </w:r>
        </mc:Choice>
        <mc:Fallback><w:r><w:t>旧图</w:t></w:r></mc:Fallback>
      </mc:AlternateContent>
    </w:p>
  </w:body>
</w:document>`,
        "word/_rels/document.xml.rels": `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.svg"/>
</Relationships>`,
      },
      media: {
        "word/media/image1.png": PNG,
        "word/media/image1.svg": bytesToBase64(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")),
      },
    });
    const document = new DocxReader().readPackage(pack);
    const pict = document.paragraphs.toArray()[0].blocks[0].drawing;
    expect(pict?.width).toBeCloseTo(96, 3);
    expect(pict?.height).toBeCloseTo(48, 3);
    expect(pict?.url?.startsWith("data:image/png;base64,")).toBe(true);
    const svg = document.paragraphs.toArray()[1].blocks[0].drawing;
    expect(svg?.url?.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(svg?.sourceUrl?.startsWith("data:image/png;base64,")).toBe(true);
    expect(document.paragraphs.toArray()[1].getFullText()).toBe("");
  });

  it("写回优先保存原始 EMF，而不是抽出来的位图", async () => {
    const document = new Document();
    const paragraph = new Paragraph(1);
    const block = new Block();
    const drawing = new Drawing();
    drawing.width = 20;
    drawing.height = 10;
    drawing.url = "data:image/bmp;base64,Qk0=";
    drawing.sourceUrl = "data:image/emf;base64,AAAA";
    block.drawing = drawing;
    paragraph.addBlock(block);
    document.addParagraph(paragraph);
    const pack = await DocxPackage.open(await new DocxWriter().write(document));
    expect(pack.has("word/media/image1.emf")).toBe(true);
    expect(pack.xml("[Content_Types].xml")).toContain('Extension="emf"');
    expect(pack.xml("[Content_Types].xml")).toContain("image/x-emf");
  });
});

function emfWithRedSquare(): string {
  const dib = new Uint8Array(56);
  const view = new DataView(dib.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, 2, true);
  view.setInt32(8, 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 24, true);
  for (const at of [40, 43, 48, 51]) {
    dib[at + 2] = 255;
  }
  const record = new Uint8Array(136);
  const rec = new DataView(record.buffer);
  rec.setUint32(0, 81, true);
  rec.setUint32(4, 136, true);
  rec.setUint32(48, 80, true);
  rec.setUint32(52, 40, true);
  rec.setUint32(56, 120, true);
  rec.setUint32(60, 16, true);
  record.set(dib, 80);
  const file = new Uint8Array(88 + 136 + 8);
  const head = new DataView(file.buffer);
  head.setUint32(0, 1, true);
  head.setUint32(4, 88, true);
  file.set(record, 88);
  head.setUint32(88 + 136, 14, true);
  head.setUint32(88 + 136 + 4, 8, true);
  return bytesToBase64(file);
}

function tiffRedPixel(): string {
  const file = new Uint8Array(125);
  const view = new DataView(file.buffer);
  file[0] = 0x49;
  file[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 9, true);
  const tags: Array<[number, number, number, number]> = [
    [256, 4, 1, 1],
    [257, 4, 1, 1],
    [258, 3, 1, 8],
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, 122],
    [277, 3, 1, 3],
    [278, 3, 1, 1],
    [279, 4, 1, 3],
  ];
  tags.forEach((tag, index) => {
    const at = 10 + index * 12;
    view.setUint16(at, tag[0], true);
    view.setUint16(at + 2, tag[1], true);
    view.setUint32(at + 4, tag[2], true);
    if (tag[1] === 3) {
      view.setUint16(at + 8, tag[3], true);
    } else {
      view.setUint32(at + 8, tag[3], true);
    }
  });
  file[122] = 255;
  return bytesToBase64(file);
}

function bmpBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bmpSize(dataUrl: string): { width: number; height: number } {
  const bytes = bmpBytes(dataUrl);
  const view = new DataView(bytes.buffer);
  return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
}

function bmpPixel(dataUrl: string, x: number, yFromTop: number): number[] {
  const bytes = bmpBytes(dataUrl);
  const view = new DataView(bytes.buffer);
  const width = view.getInt32(18, true);
  const height = Math.abs(view.getInt32(22, true));
  const offset = view.getUint32(10, true);
  const row = Math.floor((width * 24 + 31) / 32) * 4;
  const y = height - 1 - yFromTop;
  const at = offset + y * row + x * 3;
  return [bytes[at], bytes[at + 1], bytes[at + 2]];
}
