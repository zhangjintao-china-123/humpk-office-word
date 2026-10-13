import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function story(tag, inner) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<${tag} xmlns:w="${W}">${inner}</${tag}>`;
}

function textPara(text, align, extra = "") {
  const jc = align ? `<w:jc w:val="${align}"/>` : "";
  const pPr = jc || extra ? `<w:pPr>${jc}${extra}</w:pPr>` : "";
  return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function simplePage(label) {
  return `<w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:t xml:space="preserve">${label}</w:t></w:r>
    <w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>
    <w:r><w:t xml:space="preserve"> 页 / 共 </w:t></w:r>
    <w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>9</w:t></w:r></w:fldSimple>
    <w:r><w:t> 页</w:t></w:r>
  </w:p>`;
}

function complexPage() {
  return `<w:p>
    <w:r><w:t>复杂域页码 </w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>`;
}

function tabbed() {
  return `<w:p>
    <w:pPr><w:tabs><w:tab w:val="center" w:pos="4153"/><w:tab w:val="right" w:pos="8306"/></w:tabs></w:pPr>
    <w:r><w:t>左侧标题</w:t></w:r>
    <w:r><w:tab/></w:r>
    <w:r><w:t>居中</w:t></w:r>
    <w:r><w:tab/></w:r>
    <w:r><w:t>右侧</w:t></w:r>
  </w:p>`;
}

const rule = `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="1F4E79"/></w:pBdr>`;
const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
const sect1 = `<w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:headerReference w:type="first" r:id="rId3"/>
      <w:headerReference w:type="even" r:id="rId4"/>
      <w:footerReference w:type="default" r:id="rId5"/>
      <w:footerReference w:type="first" r:id="rId6"/>
      <w:footerReference w:type="even" r:id="rId7"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
      <w:titlePg/>
    </w:sectPr>`;
const sect2 = `<w:sectPr>
      <w:headerReference w:type="default" r:id="rId9"/>
      <w:footerReference w:type="default" r:id="rId10"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
      <w:pgNumType w:fmt="lowerRoman" w:start="1"/>
    </w:sectPr>`;
const body = [
  textPara("第一页正文。首页应显示“首页页眉”，页脚是首页页脚。"),
  pageBreak,
  textPara("第二页正文。偶数页应显示“偶数页页眉”，总页数应是全文页数。"),
  pageBreak,
  textPara("第三页正文。奇数页页眉应分开左、中、右，页码不再停在 1，下面有一条横线。"),
  `<w:p><w:pPr>${sect1}</w:pPr><w:r><w:t>本节到此结束，下一页进入第二节。</w:t></w:r></w:p>`,
  textPara("第二节正文。页眉应换成“第二节页眉”，页码从 i 重新开始。"),
].join("");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}">
  <w:body>
    ${body}
    ${sect2}
  </w:body>
</w:document>`;

const headers = {
  "header1.xml": story("w:hdr", `${textPara("奇数页页眉", undefined, rule)}${complexPage()}${tabbed()}`),
  "header2.xml": story("w:hdr", textPara("首页页眉")),
  "header3.xml": story("w:hdr", textPara("偶数页页眉")),
  "header4.xml": story("w:hdr", textPara("第二节页眉")),
};
const footers = {
  "footer1.xml": story("w:ftr", simplePage("奇数页 第 ")),
  "footer2.xml": story("w:ftr", textPara("首页页脚", "center")),
  "footer3.xml": story("w:ftr", simplePage("偶数页 第 ")),
  "footer4.xml": story("w:ftr", simplePage("第二节 第 ")),
};

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/header3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/word/footer3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/word/header4.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer4.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${W}"><w:evenAndOddHeaders/></w:settings>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header3.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer3.xml"/>
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header4.xml"/>
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer4.xml"/>
</Relationships>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.folder("_rels").file(".rels", rootRels);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", styles);
word.file("settings.xml", settings);
word.folder("_rels").file("document.xml.rels", docRels);
for (const [name, xml] of Object.entries({ ...headers, ...footers })) {
  word.file(name, xml);
}

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.mkdirSync(new URL("../public", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../header-demo.docx", import.meta.url), buf);
fs.writeFileSync(new URL("../public/header-demo.docx", import.meta.url), buf);
console.log("wrote header-demo.docx", buf.length);
