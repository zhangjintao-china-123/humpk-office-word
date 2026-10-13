import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const body = "一二三四五六七八九十";
const wrap = `${body}${body}${body}${body}。`;

function run(text, opts = {}) {
  const size = opts.size ?? 24;
  const bold = opts.bold ? "<w:b/>" : "";
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  return `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>${bold}<w:sz w:val="${size}"/>${color}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function para(text, pPr = "", opts = {}) {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${run(text, opts)}</w:p>`;
}

function heading(text) {
  const pPr = [
    `<w:pStyle w:val="Heading"/>`,
    `<w:spacing w:before="280" w:after="80"/>`,
    `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="C45911"/></w:pBdr>`,
  ].join("");
  return para(text, pPr, { size: 32, bold: true, color: "C45911" });
}

const spacingTight = [
  para("段后为 0。下面这一段段前也是 0，两段贴在一起。", `<w:spacing w:before="0" w:after="0"/>`),
  para("这是紧挨着的下一段。", `<w:spacing w:before="0" w:after="0"/>`),
  para("这一段段后 12 磅。再下面一段段前也是 12 磅，中间只留较大的那一份，不会叠成 24 磅。", `<w:spacing w:before="0" w:after="240"/>`),
  para("中间这段空隙来自上一段的段后距。", `<w:spacing w:before="240" w:after="0"/>`),
].join("");

const contextual = [
  para("同一样式，开了「相同样式之间不加空格」。", `<w:pStyle w:val="Note"/>`),
  para("所以这两段虽然各自有段前段后，中间仍然贴着。", `<w:pStyle w:val="Note"/>`),
  para("换成另一种样式后，段间距又回来了。", `<w:spacing w:before="200" w:after="0"/>`),
].join("");

const indent = [
  para(`没有缩进。${wrap}`),
  para(`首行缩进 2 个字符。${wrap}`, `<w:ind w:firstLineChars="200"/>`),
  para(`整段左缩进半英寸，只写了磅值。${wrap}`, `<w:ind w:left="720"/>`),
  para(`右边也缩进半英寸，行尾提前换行。${wrap}`, `<w:ind w:left="360" w:right="720"/>`),
  para(`悬挂缩进：第一行更靠左，换行后停在左缩进上。${wrap}`, `<w:ind w:left="720" w:hanging="420"/>`),
].join("");

const align = [
  para("这一句居中。", `<w:jc w:val="center"/>`),
  para("这一句靠右。", `<w:jc w:val="right"/>`),
  para(`两端对齐。最后一行不拉开。${wrap}${body}`, `<w:jc w:val="both"/>`),
  para("分散对齐会把这一行的字拉开到整行。", `<w:jc w:val="distribute"/>`),
].join("");

const lineSpacing = [
  para(`单倍行距。${wrap}`, `<w:spacing w:line="240" w:lineRule="auto"/>`),
  para(`1.5 倍行距。${wrap}`, `<w:spacing w:before="120" w:line="360" w:lineRule="auto"/>`),
  para(`2 倍行距。${wrap}`, `<w:spacing w:before="120" w:line="480" w:lineRule="auto"/>`),
  para(`固定值 28 磅，字按基线排在行框上沿。${wrap}`, `<w:spacing w:before="120" w:line="560" w:lineRule="exact"/><w:textAlignment w:val="baseline"/>`),
  para(`最小值 24 磅。字号本身更矮时，行高也不会低于这个值。${wrap}`, `<w:spacing w:before="120" w:line="480" w:lineRule="atLeast"/>`),
].join("");

const borders = [
  para(
    "黄底，四边都有框，框和文字之间留了一点距离。",
    `<w:shd w:val="clear" w:fill="FFF2CC"/>
     <w:pBdr>
       <w:top w:val="single" w:sz="12" w:space="4" w:color="C45911"/>
       <w:left w:val="single" w:sz="12" w:space="4" w:color="C45911"/>
       <w:bottom w:val="single" w:sz="12" w:space="4" w:color="C45911"/>
       <w:right w:val="single" w:sz="12" w:space="4" w:color="C45911"/>
     </w:pBdr>
     <w:spacing w:before="160" w:after="160"/>`,
  ),
  para(
    "只有左边一条粗线，常用来做引用。",
    `<w:ind w:left="200"/>
     <w:shd w:val="clear" w:fill="F2F2F2"/>
     <w:pBdr><w:left w:val="single" w:sz="24" w:space="6" w:color="2E75B6"/></w:pBdr>
     <w:spacing w:before="80" w:after="80"/>`,
  ),
].join("");

const tabPr = `<w:tabs><w:tab w:val="left" w:pos="2800"/><w:tab w:val="right" w:leader="dot" w:pos="9000"/></w:tabs>`;
const tabs = [
  para("第一章\t总则\t1", tabPr),
  para("第二章\t职责\t4", tabPr),
  para("第三章\t附则\t9", tabPr),
].join("");

const numbered = [
  para(`第一条，编号落在悬挂区里，换行后的文字和第一行正文对齐。${wrap}`, `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`),
  para(`第二条，下一条重新编号，不会接着上一条的悬挂空档错位。${wrap}`, `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>`),
].join("");

const pageBreak = para(
  "这一段设置了段前分页，所以它从下一页的页首开始。页顶那段段前距会被吃掉。",
  `<w:pageBreakBefore/><w:spacing w:before="400" w:after="80"/>`,
  { size: 28, bold: true },
);

function sectionHead(text) {
  const pPr = [
    `<w:pStyle w:val="Heading"/>`,
    `<w:pageBreakBefore/>`,
    `<w:spacing w:before="80" w:after="60"/>`,
    `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="C45911"/></w:pBdr>`,
  ].join("");
  return para(text, pPr, { size: 32, bold: true, color: "C45911" });
}

function blankLines(count) {
  const pPr = `<w:spacing w:before="0" w:after="0" w:line="320" w:lineRule="exact"/><w:snapToGrid w:val="0"/><w:shd w:val="clear" w:fill="F4F4F4"/>`;
  return Array.from({ length: count }, () => para("", pPr)).join("");
}

const keepNextGap = 41;
const keepLinesGap = 40;

const keepWithNext = [
  sectionHead("9. 与下段同页"),
  para("灰块把标题推到页尾。这一行标题要求和下一段留在同一页，本页放不下整段时，标题会跟着到下一页，不会单独留在页尾。", `<w:spacing w:before="0" w:after="40"/>`, { size: 21, color: "666666" }),
  blankLines(keepNextGap),
  para("这行标题和下一段在一起", `<w:keepNext/><w:spacing w:before="40" w:after="40"/><w:shd w:val="clear" w:fill="FCE4D6"/>`, { bold: true, color: "C45911" }),
  para(`所以它没有落在上一页的页尾。下一段从这里接上。${wrap}`, `<w:spacing w:before="0" w:after="0"/>`),
].join("");

const keepTogether = [
  sectionHead("10. 段中不分页"),
  para("灰块下面本来还剩一点高度，不够放下整段。这一段要求段中不分页，于是整段挪到下一页，上一页底部空着。", `<w:spacing w:before="0" w:after="40"/>`, { size: 21, color: "666666" }),
  blankLines(keepLinesGap),
  para(`这一段一共有好几行，中间不允许拆开。${wrap}${wrap}`, `<w:keepLines/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:fill="DDEBF7"/>`),
].join("");

const mixed = [
  heading("11. 中西文"),
  para("汉字和英文、数字之间留出大约四分之一个汉字的空隙，英文字母内部不拉开。半角括号按西文宽度，不撑成整字。", `<w:spacing w:after="80"/>`, { size: 21, color: "666666" }),
  para("正文里的 English 和数字 12 紧挨汉字。全角括号（保留），半角括号(贴着字)。don't 和 well-known 都按词来认。"),
  para(`两端对齐时，汉字之间会拉开，EnglishWord 这个单词仍旧连在一起。${wrap}`, `<w:jc w:val="both"/>`),
  para("行尾放不下一个英文单词时，整个单词换到下一行。"),
  para(`${"汉".repeat(76)}HelloWorld`),
  para("允许西文在单词中间换行时，同一个位置会按字母断开。"),
  para(`${"汉".repeat(76)}HelloWorld`, `<w:wordWrap w:val="off"/>`),
].join("");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
    ${para("分段形式", `<w:jc w:val="center"/><w:spacing w:after="40"/>`, { size: 44, bold: true })}
    ${para("下面每一节是一种段落形态，对照着看缩进、间距、对齐、行距、边框、分页和中西文。", `<w:jc w:val="center"/><w:spacing w:after="80"/>`, { size: 21, color: "666666" })}
    ${heading("1. 段前段后")}
    ${spacingTight}
    ${contextual}
    ${heading("2. 缩进")}
    ${indent}
    ${heading("3. 对齐")}
    ${align}
    ${heading("4. 行距")}
    ${lineSpacing}
    ${heading("5. 边框和底纹")}
    ${borders}
    ${heading("6. 制表位")}
    ${para("左制表位对齐中间的栏目，右边用点线引到页码。", `<w:spacing w:after="60"/>`, { size: 21, color: "666666" })}
    ${tabs}
    ${heading("7. 编号")}
    ${numbered}
    ${heading("8. 段前分页")}
    ${pageBreak}
    ${para("分页后的下一段，跟在页首那一行后面。", `<w:spacing w:before="160"/>`)}
    ${keepWithNext}
    ${keepTogether}
    ${mixed}
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
  <w:style w:type="paragraph" w:styleId="Heading">
    <w:name w:val="Heading"/>
    <w:basedOn w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Note">
    <w:name w:val="Note"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="200" w:after="200"/>
      <w:contextualSpacing/>
      <w:shd w:val="clear" w:fill="E2EFDA"/>
    </w:pPr>
  </w:style>
</w:styles>`;

const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:suff w:val="space"/>
      <w:pPr><w:ind w:left="720" w:hanging="420"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
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
word.file("numbering.xml", numberingXml);
word.folder("_rels").file(
  "document.xml.rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
);

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(new URL("../public/paragraph-demo.docx", import.meta.url), buf);
console.log("wrote public/paragraph-demo.docx", buf.length);
