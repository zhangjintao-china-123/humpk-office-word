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

const items = [
  para(text("审阅示例", { bold: true, size: 32, color: "1F4E79" })),
  para(text("蓝色下划线是插入，红色删除线是删除。黄底是批注，页底是脚注。", { color: "666666", size: 21 }), "160"),
  para(
    `${text("这份说明")}<w:ins w:id="1" w:author="张三" w:date="2024-05-06T00:00:00Z">${text("补充了最新口径")}</w:ins>${text("，原来的")}<w:del w:id="2" w:author="张三" w:date="2024-05-06T00:00:00Z"><w:r><w:delText>旧说法</w:delText></w:r></w:del>${text("不再使用。")}`,
    "200",
  ),
  para(
    `${text("请看")}<w:commentRangeStart w:id="0"/>${text("这段需要核对的数字")}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>${text("，出处见脚注")}<w:r><w:footnoteReference w:id="1"/></w:r>${text("。")}`,
    "160",
  ),
  para(text("选中修订文字后，可以用上方的「接受」或「拒绝」。批注和脚注菜单里可以跳到对应位置。", { color: "666666", size: 21 }), "200"),
];

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}">
  <w:body>
${items.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1701" w:left="1134" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const comments = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="${W}">
  <w:comment w:id="0" w:author="张三" w:date="2024-05-06T00:00:00Z" w:initials="张">
    <w:p><w:r><w:t>这里的数字要和年报第 12 页核对。</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;

const footnotes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${W}">
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
  <w:footnote w:id="1"><w:p><w:r><w:t>数据来自 2024 年年报。</w:t></w:r></w:p></w:footnote>
</w:footnotes>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
      <w:sz w:val="21"/><w:szCs w:val="21"/>
    </w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>审阅示例</dc:title>
  <dc:creator>张三</dc:creator>
</cp:coreProperties>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
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
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.folder("_rels").file(".rels", rootRels);
zip.folder("docProps").file("core.xml", core);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", styles);
word.file("comments.xml", comments);
word.file("footnotes.xml", footnotes);
word.folder("_rels").file("document.xml.rels", docRels);

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.mkdirSync(new URL("../public", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../public/review-demo.docx", import.meta.url), buf);
console.log("wrote public/review-demo.docx", buf.length);
