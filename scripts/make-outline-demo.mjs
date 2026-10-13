import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function lvl(ilvl, numFmt, lvlText, extra = "") {
  return `<w:lvl w:ilvl="${ilvl}">
    <w:start w:val="1"/>
    <w:numFmt w:val="${numFmt}"/>
    <w:lvlText w:val="${lvlText}"/>
    <w:lvlJc w:val="left"/>
    <w:suff w:val="space"/>
    ${extra}
  </w:lvl>`;
}

function abstract(id, levels) {
  return `<w:abstractNum w:abstractNumId="${id}">${levels}</w:abstractNum>`;
}

function num(id, abstractId) {
  return `<w:num w:numId="${id}"><w:abstractNumId w:val="${abstractId}"/></w:num>`;
}

const bullet = (char, font = "Wingdings") =>
  lvl(
    0,
    "bullet",
    char,
    `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr>`,
  );

const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}">
  ${abstract(0, [lvl(0, "decimal", "%1"), lvl(1, "decimal", "%1.%2"), lvl(2, "decimal", "%1.%2.%3")].join(""))}
  ${abstract(1, [lvl(0, "chineseCounting", "%1、"), lvl(1, "chineseCounting", "（%2）"), lvl(2, "decimal", "%3.")].join(""))}
  ${abstract(2, lvl(0, "chineseLegalSimplified", "%1、"))}
  ${abstract(3, lvl(0, "ideographTraditional", "%1、"))}
  ${abstract(4, lvl(0, "ideographZodiac", "%1、"))}
  ${abstract(5, lvl(0, "decimalEnclosedCircle", "%1"))}
  ${abstract(6, lvl(0, "decimalEnclosedParen", "%1"))}
  ${abstract(7, [lvl(0, "upperRoman", "%1."), lvl(1, "lowerRoman", "%2)")].join(""))}
  ${abstract(8, [lvl(0, "upperLetter", "%1."), lvl(1, "lowerLetter", "%2)")].join(""))}
  ${abstract(9, lvl(0, "decimalZero", "%1."))}
  ${abstract(10, lvl(0, "ideographDigital", "%1、"))}
  ${abstract(11, bullet("\uF0B7"))}
  ${abstract(12, bullet("\uF0A7"))}
  ${abstract(13, lvl(0, "bullet", "●", `<w:suff w:val="space"/>`))}
  ${abstract(14, lvl(0, "bullet", "○"))}
  ${abstract(15, lvl(0, "bullet", "■"))}
  ${abstract(16, lvl(0, "bullet", "◆"))}
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((id) => num(id + 1, id)).join("")}
</w:numbering>`;

function p(text, opts = {}) {
  const { bold = false, size = 21, color = null, align = null, numId = null, ilvl = 0 } = opts;
  const pPr = [];
  if (align) pPr.push(`<w:jc w:val="${align}"/>`);
  if (numId != null) {
    pPr.push(`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`);
    pPr.push(`<w:ind w:left="420" w:hanging="420"/>`);
  }
  const pPrXml = pPr.length ? `<w:pPr>${pPr.join("")}</w:pPr>` : "";
  const rPr = [
    `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>`,
    bold ? "<w:b/>" : "",
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
    color ? `<w:color w:val="${color}"/>` : "",
  ].join("");
  return `<w:p>${pPrXml}<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function heading(text) {
  return p(text, { bold: true, size: 28, color: "1F4E79" });
}

const items = [
  p("大纲编号符号示例", { bold: true, size: 36, align: "center", color: "1F4E79" }),
  p("下面每组都是同一种编号格式。段首符号由编辑器按编号定义换算。", { size: 21 }),
  p(""),
  heading("一、多级十进制"),
  p("总则", { numId: 1, ilvl: 0 }),
  p("范围", { numId: 1, ilvl: 1 }),
  p("术语", { numId: 1, ilvl: 2 }),
  p("引用文件", { numId: 1, ilvl: 2 }),
  p("职责", { numId: 1, ilvl: 1 }),
  p("管理要求", { numId: 1, ilvl: 0 }),
  p(""),
  heading("二、中文大纲"),
  p("编制目的", { numId: 2, ilvl: 0 }),
  p("适用范围", { numId: 2, ilvl: 1 }),
  p("条款说明", { numId: 2, ilvl: 2 }),
  p("执行要求", { numId: 2, ilvl: 1 }),
  p("附则", { numId: 2, ilvl: 0 }),
  p(""),
  heading("三、中文大写"),
  p("合同首部", { numId: 3, ilvl: 0 }),
  p("标的", { numId: 3, ilvl: 0 }),
  p("价款", { numId: 3, ilvl: 0 }),
  p(""),
  heading("四、天干"),
  ...["方案甲", "方案乙", "方案丙", "方案丁"].map((text) => p(text, { numId: 4, ilvl: 0 })),
  p(""),
  heading("五、地支"),
  ...["子时", "丑时", "寅时"].map((text) => p(text, { numId: 5, ilvl: 0 })),
  p(""),
  heading("六、带圈数字"),
  ...["第一步", "第二步", "第三步", "第四步"].map((text) => p(text, { numId: 6, ilvl: 0 })),
  p(""),
  heading("七、括号数字"),
  ...["选项甲", "选项乙", "选项丙"].map((text) => p(text, { numId: 7, ilvl: 0 })),
  p(""),
  heading("八、罗马数字"),
  p("第一章", { numId: 8, ilvl: 0 }),
  p("第一节", { numId: 8, ilvl: 1 }),
  p("第二节", { numId: 8, ilvl: 1 }),
  p("第二章", { numId: 8, ilvl: 0 }),
  p(""),
  heading("九、英文字母"),
  p("大写项", { numId: 9, ilvl: 0 }),
  p("小写项", { numId: 9, ilvl: 1 }),
  p("另一小写", { numId: 9, ilvl: 1 }),
  p("下一大写", { numId: 9, ilvl: 0 }),
  p(""),
  heading("十、前导零"),
  ...["样本一", "样本二", "样本三"].map((text) => p(text, { numId: 10, ilvl: 0 })),
  p(""),
  heading("十一、汉字数字逐位"),
  ...["编号十一示意", "下一条"].map((text) => p(text, { numId: 11, ilvl: 0 })),
  p(""),
  heading("十二、项目符号"),
  p("圆点 Wingdings", { numId: 12, ilvl: 0 }),
  p("方点 Wingdings", { numId: 13, ilvl: 0 }),
  p("实心圆", { numId: 14, ilvl: 0 }),
  p("空心圆", { numId: 15, ilvl: 0 }),
  p("实心方", { numId: 16, ilvl: 0 }),
  p("菱形", { numId: 17, ilvl: 0 }),
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

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
        <w:sz w:val="21"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.folder("_rels").file(".rels", rootRels);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("numbering.xml", numbering);
word.file("styles.xml", styles);
word.folder("_rels").file("document.xml.rels", docRels);

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.mkdirSync(new URL("../public", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../outline-demo.docx", import.meta.url), buf);
fs.writeFileSync(new URL("../public/outline-demo.docx", import.meta.url), buf);
console.log("wrote outline-demo.docx", buf.length);
