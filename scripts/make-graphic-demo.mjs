import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";

const px = (value) => Math.round(value * 9525);

function text(value, opts = {}) {
  const bold = opts.bold ? "<w:b/>" : "";
  const size = opts.size ? `<w:sz w:val="${opts.size}"/>` : "";
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  const props = bold || size || color ? `<w:rPr>${bold}${size}${color}</w:rPr>` : "";
  return `<w:r>${props}<w:t xml:space="preserve">${value}</w:t></w:r>`;
}

function para(inner, before) {
  const spacing = before ? `<w:pPr><w:spacing w:before="${before}" w:after="40"/></w:pPr>` : "";
  return `<w:p>${spacing}${inner}</w:p>`;
}

function shape(preset, fill, line, width, height, content) {
  const box = content
    ? `<wps:txbx><w:txbxContent>${content}</w:txbxContent></wps:txbx><wps:bodyPr lIns="${px(8)}" tIns="${px(6)}" rIns="${px(8)}" bIns="${px(6)}"/>`
    : "<wps:bodyPr/>";
  return `<w:r><w:drawing><wp:inline><wp:extent cx="${px(width)}" cy="${px(height)}"/>
    <a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:spPr>
      <a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>
      <a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>
      <a:ln w="${px(1.25)}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>
    </wps:spPr>${box}</wps:wsp></a:graphicData></a:graphic>
  </wp:inline></w:drawing></w:r>`;
}

function math(inner) {
  return `<m:oMath>${inner}</m:oMath>`;
}
function mt(value) {
  return `<m:r><m:t>${value}</m:t></m:r>`;
}
function frac(num, den) {
  return `<m:f><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`;
}
function sup(base, up) {
  return `<m:sSup><m:e>${base}</m:e><m:sup>${up}</m:sup></m:sSup>`;
}
function subsup(base, down, up) {
  return `<m:sSubSup><m:e>${base}</m:e><m:sub>${down}</m:sub><m:sup>${up}</m:sup></m:sSubSup>`;
}
function rad(body) {
  return `<m:rad><m:e>${body}</m:e></m:rad>`;
}
function delim(body) {
  return `<m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e>${body}</m:e></m:d>`;
}

const shapes = [
  shape("rect", "5B9BD5", "1F4E79", 72, 36),
  text(" "),
  shape("roundRect", "F4B183", "C65911", 72, 36),
  text(" "),
  shape("ellipse", "A9D08E", "548235", 40, 40),
  text(" "),
  shape("triangle", "FFD966", "BF8F00", 44, 36),
  text(" "),
  shape("diamond", "C9A0DC", "7030A0", 40, 40),
  text(" "),
  shape("rightArrow", "9DC3E6", "2E75B6", 68, 32),
  text(" "),
  shape("chevron", "F8CBAD", "C65911", 48, 32),
  text(" "),
  shape("plus", "BDD7EE", "1F4E79", 36, 36),
].join("");

const box = shape(
  "roundRect",
  "FFF2CC",
  "C45911",
  280,
  68,
  `${para(text("文本框里的说明"))}${para(text("第二行仍然横排"))}`,
);

const items = [
  para(text("形状、文本框与公式", { bold: true, size: 32, color: "1F4E79" })),
  para(text("预设形状按填充和边线画出。文本框里的文字单独排版。公式先支持分数、上下标、根号和括号。", { color: "666666", size: 21 }), "120"),
  para(text("形状", { bold: true, color: "1F4E79" }), "200"),
  para(shapes),
  para(text("文本框", { bold: true, color: "1F4E79" }), "200"),
  para(box),
  para(text("公式", { bold: true, color: "1F4E79" }), "220"),
  para(`${text("分数  ")}${math(frac(mt("a+1"), mt("b")))}`),
  para(`${text("上下标  ")}${math(subsup(mt("x"), mt("1"), mt("2")))}`),
  para(`${text("根号  ")}${math(rad(mt("a+b")))}`),
  para(`${text("括号  ")}${math(delim(`${mt("a")}${sup(mt("b"), mt("2"))}`))}`),
  para(`${text("勾股定理  ")}${math(`${sup(mt("a"), mt("2"))}${mt("+")}${sup(mt("b"), mt("2"))}${mt("=")}${sup(mt("c"), mt("2"))}`)}`, "80"),
];

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:wps="${WPS}" xmlns:m="${M}">
  <w:body>
${items.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
    <w:sz w:val="21"/><w:szCs w:val="21"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.folder("_rels").file(".rels", rootRels);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", styles);
word.folder("_rels").file("document.xml.rels", docRels);
const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.mkdirSync(new URL("../public", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../public/graphic-demo.docx", import.meta.url), buf);
console.log("wrote public/graphic-demo.docx", buf.length);
