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
  const spacing = before ? `<w:pPr><w:spacing w:before="${before}" w:after="60"/></w:pPr>` : "";
  return `<w:p>${spacing}${inner}</w:p>`;
}

function shape(preset, fill, line, width, height, content) {
  const box = content
    ? `<wps:txbx><w:txbxContent>${content}</w:txbxContent></wps:txbx><wps:bodyPr lIns="${px(10)}" tIns="${px(8)}" rIns="${px(10)}" bIns="${px(8)}"/>`
    : "<wps:bodyPr/>";
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : "<a:noFill/>";
  return `<w:r><w:drawing><wp:inline><wp:extent cx="${px(width)}" cy="${px(height)}"/>
    <a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:spPr>
      <a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>
      ${fillXml}
      <a:ln w="${px(1.5)}"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>
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
function sub(base, down) {
  return `<m:sSub><m:e>${base}</m:e><m:sub>${down}</m:sub></m:sSub>`;
}
function subsup(base, down, up) {
  return `<m:sSubSup><m:e>${base}</m:e><m:sub>${down}</m:sub><m:sup>${up}</m:sup></m:sSubSup>`;
}
function rad(body) {
  return `<m:rad><m:e>${body}</m:e></m:rad>`;
}
function delim(body, open = "(", close = ")") {
  return `<m:d><m:dPr><m:begChr m:val="${open}"/><m:endChr m:val="${close}"/></m:dPr><m:e>${body}</m:e></m:d>`;
}

function pack(name, body) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:wps="${WPS}" xmlns:m="${M}">
  <w:body>
${body}
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
    <w:sz w:val="22"/><w:szCs w:val="22"/>
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
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }).then((buf) => {
    fs.mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
    fs.writeFileSync(new URL(`../public/${name}`, import.meta.url), buf);
    console.log("wrote public/" + name, buf.length);
  });
}

const gap = text("   ");
const shapeBody = [
  para(text("形状示例", { bold: true, size: 36, color: "1F4E79" })),
  para(text("每一块都是预设形状，颜色来自填充和边线。"), "80"),
  para(text("第一行", { bold: true, color: "1F4E79" }), "180"),
  para(
    [
      shape("rect", "5B9BD5", "1F4E79", 88, 48),
      gap,
      shape("roundRect", "F4B183", "C65911", 88, 48),
      gap,
      shape("ellipse", "A9D08E", "548235", 56, 56),
      gap,
      shape("triangle", "FFD966", "BF8F00", 64, 52),
    ].join(""),
  ),
  para(text("第二行", { bold: true, color: "1F4E79" }), "180"),
  para(
    [
      shape("diamond", "C9A0DC", "7030A0", 56, 56),
      gap,
      shape("rightArrow", "9DC3E6", "2E75B6", 92, 40),
      gap,
      shape("chevron", "F8CBAD", "C65911", 72, 40),
      gap,
      shape("plus", "BDD7EE", "1F4E79", 48, 48),
      gap,
      shape("line", "", "C00000", 120, 20),
    ].join(""),
  ),
  para(text("文本框", { bold: true, color: "1F4E79" }), "240"),
  para(text("框里的字按框宽单独排，不跟外面的正文挤在一行。"), "60"),
  para(shape("roundRect", "FFF2CC", "C45911", 320, 72, para(text("提示：周五前确认口径。"))), "140"),
  para(shape("rect", "DDEBF7", "2E75B6", 320, 72, para(text("矩形框：营收含海外子公司。"))), "80"),
  para(shape("roundRect", "E2EFDA", "548235", 320, 88, `${para(text("两行文本框"))}${para(text("第二行仍然在框内。"))}`), "80"),
].join("\n");

const mathBody = [
  para(text("公式示例", { bold: true, size: 36, color: "1F4E79" })),
  para(text("目前画出分数、上下标、根号和括号。每行左边是说明，右边是公式。"), "80"),
  para(`${text("分数")}${text("    ")}${math(frac(mt("a+1"), mt("b")))}`, "200"),
  para(`${text("嵌套分数")}${text("    ")}${math(frac(mt("1"), frac(mt("a"), mt("b"))))}`, "160"),
  para(`${text("上标")}${text("    ")}${math(sup(mt("x"), mt("2")))}`, "160"),
  para(`${text("下标")}${text("    ")}${math(sub(mt("a"), mt("n")))}`, "140"),
  para(`${text("上下标")}${text("    ")}${math(subsup(mt("x"), mt("1"), mt("2")))}`, "140"),
  para(`${text("根号")}${text("    ")}${math(rad(mt("a+b")))}`, "160"),
  para(`${text("根号套分数")}${text("    ")}${math(rad(frac(mt("x"), mt("y"))))}`, "160"),
  para(`${text("括号")}${text("    ")}${math(delim(`${mt("a+")}${sup(mt("b"), mt("2"))}`))}`, "180"),
  para(`${text("勾股定理")}${text("    ")}${math(`${sup(mt("a"), mt("2"))}${mt("+")}${sup(mt("b"), mt("2"))}${mt("=")}${sup(mt("c"), mt("2"))}`)}`, "180"),
  para(`${text("一句里夹公式：速度 ")}${math(frac(mt("s"), mt("t")))}${text(" ，其中 s 是路程。")}`, "180"),
].join("\n");

await pack("shape-demo.docx", shapeBody);
await pack("math-demo.docx", mathBody);
