import JSZip from "jszip";
import fs from "fs";
import zlib from "node:zlib";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + body.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 4 + body.length);
  return out;
}

function png(width, height, fill) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const edge = x < 3 || y < 3 || x >= width - 3 || y >= height - 3;
      const [r, g, b] = edge ? [255, 255, 255] : fill;
      const at = row + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const pxToEmu = (px) => Math.round(px * 9525);
const contentPx = (11906 - 1134 * 2) / 15;
const imagePx = 132;
const size = pxToEmu(imagePx);
const gap = pxToEmu(8);
const right = pxToEmu(contentPx - imagePx - 12);
const center = pxToEmu((contentPx - imagePx) / 2);

function anchor(id, rel, x, wrap) {
  return `<w:r><w:drawing><wp:anchor behindDoc="0" distT="0" distB="0" distL="${gap}" distR="${gap}"><wp:positionH relativeFrom="column"><wp:posOffset>${x}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${size}" cy="${size}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${wrap}<wp:docPr id="${id}" name="Picture ${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="${rel}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
}

function heading(text) {
  return `<w:p><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
}

function body(id, rel, x, wrap, text) {
  return `<w:p>${anchor(id, rel, x, wrap)}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

const beside = "这段文字会沿着图片让开，排满一侧后再换行，图片下面恢复整行宽度。".repeat(6);
const both = "图在中间时，同一行先排左边，排满后接到右边，两边一起往下走。".repeat(6);
const under = "上下型不在图片两侧排字，这一段会整段挪到图片下沿。";

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}">
  <w:body>
    ${heading("1. 图在左边，文字排在右边")}
    ${body(1, "rId4", 0, '<wp:wrapSquare wrapText="bothSides"/>', beside)}
    ${heading("2. 图在右边，文字只留在左边")}
    ${body(2, "rId5", right, '<wp:wrapSquare wrapText="left"/>', beside)}
    ${heading("3. 图在中间，左右都排字")}
    ${body(3, "rId6", center, '<wp:wrapSquare wrapText="bothSides"/>', both)}
    ${heading("4. 上下型，文字挪到图的下面")}
    ${body(4, "rId7", center, "<wp:wrapTopAndBottom/>", under)}
    <w:p><w:r><w:t>图下面这段是下一段，整行从版心左边排起。</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
  </w:body>
</w:document>`;

const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
);
zip
  .folder("_rels")
  .file(
    ".rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.folder("_rels").file(
  "document.xml.rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/left.png"/>
    <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/right.png"/>
    <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/center.png"/>
    <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/below.png"/>
  </Relationships>`,
);
const media = word.folder("media");
media.file("left.png", png(80, 80, [196, 89, 17]));
media.file("right.png", png(80, 80, [46, 117, 182]));
media.file("center.png", png(80, 80, [84, 130, 53]));
media.file("below.png", png(80, 80, [112, 48, 160]));

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(new URL("../wrap-demo.docx", import.meta.url), buf);
fs.writeFileSync(new URL("../public/wrap-demo.docx", import.meta.url), buf);
console.log("wrote wrap-demo.docx", buf.length);
