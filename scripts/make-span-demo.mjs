import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function story(tag, inner) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<${tag} xmlns:w="${W}" xmlns:r="${R}">${inner}</${tag}>`;
}

function para(text, pPr = "") {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

const lines = Array.from({ length: 72 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  return para(`第 ${n} 行    这一格跨过页脚，下一页应接着出现`);
});

const cell = (body, fill) =>
  `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/><w:shd w:val="clear" w:fill="${fill}"/></w:tcPr>${body}</w:tc>`;

const table = `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="12" w:space="0" w:color="C65911"/>
      <w:left w:val="single" w:sz="12" w:space="0" w:color="C65911"/>
      <w:bottom w:val="single" w:sz="12" w:space="0" w:color="C65911"/>
      <w:right w:val="single" w:sz="12" w:space="0" w:color="C65911"/>
      <w:insideH w:val="single" w:sz="8" w:space="0" w:color="C65911"/>
      <w:insideV w:val="single" w:sz="8" w:space="0" w:color="C65911"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid><w:gridCol w:w="6200"/><w:gridCol w:w="2800"/></w:tblGrid>
  <w:tr>
    ${cell(lines.join(""), "FFF2CC")}
    ${cell(
      [
        para("右侧格子和左边是同一行。"),
        para("这一行比一页更高，所以会跨页。"),
        para("页脚那一条应保持空白，格子从下一页正文继续。"),
      ].join(""),
      "D6EAF8",
    )}
  </w:tr>
</w:tbl>`;

const documentXml = story(
  "w:document",
  `<w:body>
    ${para("下面这一行表格比一页更高。格子应画到正文底边就停，页脚单独留出来。")}
    ${table}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:footerReference w:type="default" r:id="rId3"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/>
    </w:sectPr>
  </w:body>`,
);

const header = story(
  "w:hdr",
  `<w:p><w:pPr><w:jc w:val="center"/><w:shd w:val="clear" w:fill="1F4E79"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr><w:t>页眉</w:t></w:r></w:p>`,
);
const footer = story(
  "w:ftr",
  `<w:p><w:pPr><w:jc w:val="center"/><w:shd w:val="clear" w:fill="1F4E79"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">页脚  第 </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr><w:t> 页</w:t></w:r></w:p>`,
);

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.folder("_rels").file(".rels", rootRels);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", styles);
word.file("header1.xml", header);
word.file("footer1.xml", footer);
word.folder("_rels").file("document.xml.rels", docRels);

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.mkdirSync(new URL("../public", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../public/table-span-demo.docx", import.meta.url), buf);
console.log("wrote public/table-span-demo.docx", buf.length);
