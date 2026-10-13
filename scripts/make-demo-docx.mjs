import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

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

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault/>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function p(text, opts = {}) {
  const { bold = false, size = 21, align = null, color = null, pageBreakBefore = false } = opts;
  const pPrParts = [];
  if (align) pPrParts.push(`<w:jc w:val="${align}"/>`);
  if (pageBreakBefore) pPrParts.push(`<w:pageBreakBefore/>`);
  const pPr = pPrParts.length ? `<w:pPr>${pPrParts.join("")}</w:pPr>` : "";
  const colorXml = color ? `<w:color w:val="${color}"/>` : "";
  const boldXml = bold ? "<w:b/><w:bCs/>" : "";
  return `<w:p>
    ${pPr}
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
        ${boldXml}
        <w:sz w:val="${size}"/>
        <w:szCs w:val="${size}"/>
        ${colorXml}
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function pageBreak() {
  return `<w:p>
    <w:r>
      <w:br w:type="page"/>
    </w:r>
  </w:p>`;
}

function cell(text, opts = {}) {
  const { bold = false, width = 2340, fill = null, align = null } = opts;
  const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "";
  const jc = align ? `<w:jc w:val="${align}"/>` : "";
  const boldXml = bold ? "<w:b/><w:bCs/>" : "";
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${width}" w:type="dxa"/>
      ${shd}
    </w:tcPr>
    <w:p>
      <w:pPr>${jc}</w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
          ${boldXml}
          <w:sz w:val="21"/>
          <w:szCs w:val="21"/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:tc>`;
}

function table(rows) {
  const colWidths = [1200, 2800, 2200, 1800, 1800];
  const grid = colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const trs = rows
    .map((row, index) => {
      const isHeader = index === 0;
      const cells = row
        .map((text, i) =>
          cell(text, {
            bold: isHeader,
            width: colWidths[i],
            fill: isHeader ? "1F4E79" : index % 2 === 0 ? "F2F2F2" : null,
            align: i >= 3 ? "right" : "left",
          }),
        )
        .join("");
      // header text should be white — override via dedicated header cell styling
      if (isHeader) {
        const headerCells = row
          .map(
            (text, i) => `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${colWidths[i]}" w:type="dxa"/>
      <w:shd w:val="clear" w:color="auto" w:fill="1F4E79"/>
    </w:tcPr>
    <w:p>
      <w:pPr><w:jc w:val="${i >= 3 ? "right" : "center"}"/></w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
          <w:b/><w:bCs/>
          <w:color w:val="1F4E79"/>
          <w:sz w:val="21"/>
          <w:szCs w:val="21"/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:tc>`,
          )
          .join("");
        return `<w:tr>${headerCells}</w:tr>`;
      }
      return `<w:tr>${cells}</w:tr>`;
    })
    .join("\n");

  return `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${colWidths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="8" w:space="0" w:color="1F4E79"/>
      <w:left w:val="single" w:sz="8" w:space="0" w:color="1F4E79"/>
      <w:bottom w:val="single" w:sz="8" w:space="0" w:color="1F4E79"/>
      <w:right w:val="single" w:sz="8" w:space="0" w:color="1F4E79"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="8FAADC"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="8FAADC"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>${grid}</w:tblGrid>
  ${trs}
</w:tbl>`;
}

const tableRows = [
  ["序号", "项目名称", "负责人", "工期(天)", "进度"],
  ["1", "需求调研", "张三", "5", "100%"],
  ["2", "原型设计", "李四", "8", "100%"],
  ["3", "排版引擎", "王五", "21", "85%"],
  ["4", "表格模块", "赵六", "12", "70%"],
  ["5", "页眉页脚", "钱七", "7", "60%"],
  ["6", "图片绕排", "孙八", "10", "55%"],
  ["7", "导出写回", "周九", "9", "40%"],
  ["8", "性能测试", "吴十", "6", "20%"],
  ["9", "样张验收", "郑一", "4", "10%"],
  ["10", "文档发布", "冯二", "3", "0%"],
  ["11", "浏览器适配", "陈三", "5", "30%"],
  ["12", "快捷键完善", "楚四", "4", "25%"],
  ["13", "剪贴板样式", "魏五", "6", "15%"],
  ["14", "撤销重做", "蒋六", "5", "50%"],
  ["15", "多节文档", "沈七", "11", "5%"],
];

const filler = (n) =>
  Array.from({ length: n }, (_, i) =>
    p(
      `补充说明 ${i + 1}：本段用于撑开页面高度，验证分页、滚动与多页预览。中英文混排示例 Mixed layout sample paragraph for page ${Math.floor(i / 4) + 1}.`,
      { size: 22 },
    ),
  );

const body = [
  p("humpk-office Word 演示文档", { bold: true, size: 36, align: "center", color: "1F4E79" }),
  p(""),
  p("你好！这是一份用于预览效果的演示 Word 文件，已加入表格并做成多页。", { size: 24 }),
  p("本编辑器在浏览器中按页绘制 .docx，支持中西文混排、表格与图片等常见版式。", { size: 24 }),
  p(""),
  p("一、功能概览", { bold: true, size: 28, color: "2E75B6" }),
  p("1. 打开本地 docx，按纸张尺寸分页预览；"),
  p("2. 支持页眉页脚、列表编号、表格跨页；"),
  p("3. 可在画布上做有限编辑，并保存回 docx。"),
  p(""),
  p("二、项目进度表", { bold: true, size: 28, color: "2E75B6" }),
  p("下面插入一张带边框与表头样式的项目进度表，便于查看表格绘制效果。"),
  p(""),
  table(tableRows),
  p(""),
  p("表格说明：五列表格，表头加粗；工期与进度右对齐。", { size: 18, color: "666666" }),
  pageBreak(),
  p("三、第二页：中英文混排", { bold: true, size: 28, color: "2E75B6" }),
  p("This is an English sentence mixed with 中文内容，用来检查字体分流与字距。Font size 10.5pt."),
  p("在第二页继续放一些说明文字，方便你滚动查看分页效果。"),
  ...filler(8),
  pageBreak(),
  p("四、第三页：结束语", { bold: true, size: 28, color: "2E75B6" }),
  p("如果你能在浏览器里看到多页纸张、以及上一页的表格，说明打开、表格与分页链路工作正常。"),
  ...filler(6),
  p(""),
  p(`—— 生成于 ${new Date().toLocaleString("zh-CN")}`, { align: "right", size: 18, color: "666666" }),
].join("\n");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", contentTypes);
zip.folder("_rels").file(".rels", rootRels);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", styles);
word.folder("_rels").file("document.xml.rels", docRels);

const out = new URL("../demo-preview.docx", import.meta.url);
const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(out, buf);
const publicOut = new URL("../public/demo-preview.docx", import.meta.url);
fs.mkdirSync(new URL("../public", import.meta.url), { recursive: true });
fs.writeFileSync(publicOut, buf);
console.log("wrote", out.pathname, "and public/", buf.length, "bytes");
