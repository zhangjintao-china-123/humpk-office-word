import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function tocEntry(level, anchor, text) {
  const style = level === 1 ? "TOC1" : "TOC2";
  return `<w:p>
    <w:pPr><w:pStyle w:val="${style}"/></w:pPr>
    <w:hyperlink w:anchor="${anchor}">
      <w:r><w:rPr><w:color w:val="0563C1"/></w:rPr><w:t>${text}</w:t></w:r>
      <w:r><w:tab/></w:r>
      <w:r><w:t>1</w:t></w:r>
    </w:hyperlink>
  </w:p>`;
}

function heading(level, anchor, text) {
  const style = level === 1 ? "Heading1" : "Heading2";
  const size = level === 1 ? "32" : "28";
  return `<w:p>
    <w:bookmarkStart w:id="${anchor.slice(4)}" w:name="${anchor}"/>
    <w:pPr><w:pStyle w:val="${style}"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>
    <w:r><w:rPr><w:b/><w:sz w:val="${size}"/><w:color w:val="1F4E79"/></w:rPr><w:t>${text}</w:t></w:r>
    <w:bookmarkEnd w:id="${anchor.slice(4)}"/>
  </w:p>`;
}

function body(text) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

const page = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

const tocStart = `<w:p>
  <w:pPr><w:jc w:val="center"/></w:pPr>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
  <w:r><w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="1F4E79"/></w:rPr><w:t>目录</w:t></w:r>
</w:p>`;

const tocEnd = `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;

const items = [
  tocStart,
  tocEntry(1, "_Toc1", "第一章 总则"),
  tocEntry(2, "_Toc2", "第一节 目的"),
  tocEntry(2, "_Toc3", "第二节 范围"),
  tocEntry(1, "_Toc4", "第二章 管理要求"),
  tocEntry(2, "_Toc5", "第一节 职责"),
  tocEntry(1, "_Toc6", "第三章 附则"),
  tocEntry(2, "_Toc7", "第一节 生效"),
  tocEnd,
  page,
  heading(1, "_Toc1", "第一章 总则"),
  body("本章说明编制目的和适用范围。目录里这一条的页码应为 2。"),
  heading(2, "_Toc2", "第一节 目的"),
  body("统一文档结构，方便按标题查阅。"),
  heading(2, "_Toc3", "第二节 范围"),
  body("适用于正文里带大纲级别的标题。"),
  page,
  heading(1, "_Toc4", "第二章 管理要求"),
  body("本章从第 3 页开始。点击目录中的蓝色标题，会跳到这里。"),
  heading(2, "_Toc5", "第一节 职责"),
  body("目录按大纲级别收集标题，排版完成后填写右侧页码。"),
  page,
  heading(1, "_Toc6", "第三章 附则"),
  body("本章在第 4 页。二级标题比一级标题多缩进一截。"),
  heading(2, "_Toc7", "第一节 生效"),
  body("自发布之日起生效。"),
];

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
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
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/></w:style>
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
fs.writeFileSync(new URL("../toc-demo.docx", import.meta.url), buf);
fs.writeFileSync(new URL("../public/toc-demo.docx", import.meta.url), buf);
console.log("wrote toc-demo.docx", buf.length);
