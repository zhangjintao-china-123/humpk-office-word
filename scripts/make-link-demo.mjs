import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function text(value, opts = {}) {
  const bold = opts.bold ? "<w:b/>" : "";
  const size = opts.size ? `<w:sz w:val="${opts.size}"/>` : "";
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  const props = bold || size || color ? `<w:rPr>${bold}${size}${color}</w:rPr>` : "";
  return `<w:r>${props}<w:t xml:space="preserve">${value}</w:t></w:r>`;
}

function para(inner, spacing) {
  const pPr = spacing ? `<w:pPr><w:spacing w:before="${spacing}" w:after="40"/></w:pPr>` : "";
  return `<w:p>${pPr}${inner}</w:p>`;
}

function heading(value, bookmark) {
  const start = bookmark ? `<w:bookmarkStart w:id="2" w:name="${bookmark}"/>` : "";
  const end = bookmark ? `<w:bookmarkEnd w:id="2"/>` : "";
  return `<w:p>${start}<w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="200" w:after="80"/></w:pPr>${text(value, { bold: true, size: 32, color: "1F4E79" })}${end}</w:p>`;
}

function ext(id, value, color) {
  return `<w:hyperlink r:id="${id}">${text(value, color ? { color } : {})}</w:hyperlink>`;
}

function anchor(name, value) {
  return `<w:hyperlink w:anchor="${name}">${text(value)}</w:hyperlink>`;
}

function field(instr, result, color = "C45911") {
  return `<w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    ${text(result, { bold: true, color })}
    <w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

const items = [
  heading("链接与域"),
  para(text("蓝色带下划线的可以点。外部链接打开网页，书签链接跳到后文。橙色粗字是域算出来的结果。", { color: "666666", size: 21 })),
  para(text("1. 外部链接", { bold: true, color: "1F4E79" }), "200"),
  para(`${text("默认外观：")}${ext("rId2", "示例网站")}`),
  para(`${text("自带红色：")}${ext("rId3", "文档说明", "C00000")}`),
  para(`${text("域形式：")}${field('HYPERLINK "https://example.com/field"', "域里的链接", "0563C1")}`),
  para(text("2. 文档内书签", { bold: true, color: "1F4E79" }), "200"),
  para(`${text("点这里：")}${anchor("结论", "跳到第二页的结论")}`),
  para(text("3. 文档属性", { bold: true, color: "1F4E79" }), "200"),
  para(`${text("作者：")}${field("AUTHOR", "某人")}`),
  para(`${text("标题：")}${field("TITLE", "无")}`),
  para(`${text("文件名：")}${field("FILENAME", "无")}`),
  para(`${text("今天：")}${field(`DATE \\@ "yyyy'年'M'月'd'日'"`, "日期")}`),
  para(`${text("创建于：")}${field(`CREATEDATE \\@ "yyyy'年'M'月'd'日'"`, "日期")}`),
  para(text("4. 引用和序号", { bold: true, color: "1F4E79" }), "200"),
  para(`${text("书签文字：")}${field("REF 结论", "未刷新")}`),
  para(`${text("书签页码：")}${field("PAGEREF 结论", "9")}`),
  para(`${text("最近标题：")}${field('STYLEREF "heading 1"', "无")}`),
  para(`${text("图 ")}${field("SEQ 图", "0")}${text("    图 ")}${field("SEQ 图", "0")}`),
  para(`${text("未知域：")}${field('QUOTE "原样保留"', "原样保留")}`),
  para(`${text("本页 ")}${field("PAGE", "1")}${text(" / 共 ")}${field("NUMPAGES", "1")}${text(" 页")}`),
  `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
  heading("结论", "结论"),
  para(text("这一页是书签「结论」所在的位置。上面的页码引用应显示 2。")),
  para(`${text("第二页页码：")}${field("PAGE", "1")}`),
];

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}">
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
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
      <w:sz w:val="21"/><w:szCs w:val="21"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:snapToGrid w:val="0"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
  </w:style>
</w:styles>`;

const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>链接与域示例</dc:title>
  <dc:creator>张三</dc:creator>
  <dcterms:created>2024-05-06T00:00:00Z</dcterms:created>
</cp:coreProperties>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/docs" TargetMode="External"/>
</Relationships>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.folder("_rels").file(".rels", rootRels);
zip.folder("docProps").file("core.xml", core);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", styles);
word.folder("_rels").file("document.xml.rels", docRels);

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.mkdirSync(new URL("../public", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../public/link-demo.docx", import.meta.url), buf);
console.log("wrote public/link-demo.docx", buf.length);
