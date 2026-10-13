import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function run(text, opts = {}) {
  const size = opts.size ?? 24;
  const bold = opts.bold ? "<w:b/>" : "";
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  return `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>${bold}<w:sz w:val="${size}"/>${color}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function para(text, pPr = "", opts = {}) {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${run(text, opts)}</w:p>`;
}

function paraParts(parts, pPr = "") {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${parts.map((part) => run(part.text, part)).join("")}</w:p>`;
}

const col = 3360;

function card(title, word, pPr, fill) {
  const label = para(title, `<w:spacing w:after="60"/>`, { size: 18, color: "666666" });
  const sample = paraParts(
    [
      { text: "排到这里", size: 48 },
      { text: word, size: 48, color: "C00000" },
    ],
    pPr,
  );
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${col}" w:type="dxa"/>
      <w:shd w:val="clear" w:fill="${fill}"/>
    </w:tcPr>
    ${label}
    ${sample}
  </w:tc>`;
}

function pair(left, right) {
  const edge = `<w:top w:val="single" w:sz="12" w:color="2E75B6"/><w:left w:val="single" w:sz="12" w:color="2E75B6"/><w:bottom w:val="single" w:sz="12" w:color="2E75B6"/><w:right w:val="single" w:sz="12" w:color="2E75B6"/><w:insideV w:val="single" w:sz="12" w:color="2E75B6"/>`;
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${col * 2}" w:type="dxa"/>
      <w:tblBorders>${edge}</w:tblBorders>
    </w:tblPr>
    <w:tblGrid><w:gridCol w:w="${col}"/><w:gridCol w:w="${col}"/></w:tblGrid>
    <w:tr>${left}${right}</w:tr>
  </w:tbl>`;
}

function heading(text) {
  return para(text, `<w:spacing w:before="280" w:after="80"/>`, { size: 32, bold: true, color: "C45911" });
}

function note(text) {
  return para(text, `<w:spacing w:before="40" w:after="80"/>`, { size: 21, color: "666666" });
}

const tight = "汉字English紧挨着，版本12已发布。全角（括号）占一整字，半角(括号)按西文宽度。";
const breakPair = pair(
  card("整词换行", "HelloWorld", "", "FFF2CC"),
  card("按字母断开", "HelloWorld", `<w:wordWrap w:val="off"/>`, "D6EAF8"),
);
const gluePair = pair(
  card("数字粘在词上", "Windows10", "", "FFF2CC"),
  card("连字符留在行尾", "well-known", "", "FFF2CC"),
);

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
    ${para("中英文混排", `<w:spacing w:after="40"/>`, { size: 44, bold: true })}
    ${note("汉字和英文、数字挨在一起时留出大约四分之一个汉字的空隙。英文默认整词换行，打开「允许西文在单词中间换行」后才按字母断开。")}
    ${heading("1. 间距")}
    ${note("下面两段文字相同。第一段使用默认间距，第二段关掉了中西文、中文与数字之间的自动空隙。")}
    ${para(tight, `<w:spacing w:before="40" w:after="40"/><w:shd w:val="clear" w:fill="FFF2CC"/>`, { size: 32 })}
    ${para(tight, `<w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:spacing w:before="40" w:after="40"/><w:shd w:val="clear" w:fill="F2F2F2"/>`, { size: 32 })}
    ${para("汉字 English 和数字 12 中间已经有空格，就不再额外加一份空隙。", `<w:spacing w:before="80"/>`, { size: 32 })}
    ${heading("2. 整词换行")}
    ${note("每个框的右边界就是行尾。红字比右边空出来的位置更宽，所以整词换到下一行。右边那一格是同一句，但允许从字母中间断开。")}
    ${breakPair}
    ${para("", `<w:spacing w:before="160" w:after="0"/>`)}
    ${gluePair}
    ${heading("3. 两端对齐")}
    ${note("多出来的空隙加在汉字之间，以及汉字和英文的交界上。EnglishWord 内部保持原样。")}
    ${para(`两端对齐时汉字之间会拉开，EnglishWord这个单词仍旧连在一起。${"一二三四五六七八九十".repeat(4)}。`, `<w:jc w:val="both"/>`)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr><w:snapToGrid w:val="0"/></w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:snapToGrid w:val="0"/></w:pPr>
  </w:style>
</w:styles>`;

const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
);
zip
  .folder("_rels")
  .file(
    ".rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", stylesXml);
word.folder("_rels").file(
  "document.xml.rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
);

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(new URL("../public/mix-demo.docx", import.meta.url), buf);
console.log("wrote public/mix-demo.docx", buf.length);
