import JSZip from "jszip";
import fs from "fs";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function text(value, opts = {}) {
  const bold = opts.bold ? "<w:b/>" : "";
  const size = opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : "";
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  const fonts = `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>`;
  return `<w:r><w:rPr>${fonts}${bold}${size}${color}</w:rPr><w:t xml:space="preserve">${value}</w:t></w:r>`;
}

function para(inner, spacing) {
  const pPr = spacing ? `<w:pPr><w:spacing w:before="${spacing}" w:after="60"/></w:pPr>` : `<w:pPr><w:spacing w:after="60"/></w:pPr>`;
  return `<w:p>${pPr}${inner}</w:p>`;
}

function heading(value) {
  return para(text(value, { bold: true, size: 36, color: "1F4E79" }), "200");
}

function note(value) {
  return para(text(value, { size: 21, color: "666666" }));
}

function cell(value, fill) {
  const shd = fill ? `<w:shd w:val="clear" w:fill="${fill}"/>` : "";
  return `<w:tc><w:tcPr>${shd}</w:tcPr><w:p>${text(value, { size: 21 })}</w:p></w:tc>`;
}

function pageBreak() {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

const borders = `
  <w:tblBorders>
    <w:top w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:left w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:bottom w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:right w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="8FAADC"/>
    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="8FAADC"/>
  </w:tblBorders>`;

const findTable = `<w:tbl>
  <w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr>
  <w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="6400"/></w:tblGrid>
  <w:tr>${cell("项目", "D6E3F0")}${cell("说明", "D6E3F0")}</w:tr>
  <w:tr>${cell("合同编号")}${cell("HT-2026-018")}</w:tr>
  <w:tr>${cell("合同金额")}${cell("壹拾万元整")}</w:tr>
</w:tbl>`;

const findBody = [
  heading("查找替换"),
  note("点「查找」或按 Ctrl+F。先搜「合同」，正文、表格、页眉和页脚里都有。再搜 Report，不勾选「区分大小写」时，report 和 Report 都算。"),
  para(text("本合同自签订之日起生效。")),
  para(text("甲方应按照本合同履行义务，乙方按约定交付。")),
  para(text("补充协议与本合同具有同等效力。")),
  para(text("条款一览", { bold: true, size: 24, color: "1F4E79" }), "160"),
  findTable,
  pageBreak(),
  heading("大小写"),
  para(text("The quarterly Report is ready. Please review the draft report before Friday.")),
  para(text("Another report sits in this sentence, and the final Report closes the page.")),
].join("\n");

const pagesBody = [
  heading("第一页"),
  note("这份用来看缩放和打印。缩放到 50% 时，一屏里能看到两页。打印应按这三页的纸张输出。"),
  para(text("第一页正文。页脚显示当前页和总页数。把比例改成 150%，字和光标一起变大，点选仍然落在字上。")),
  para(text("纸张是 A4。页与页之间留有灰边，缩小后灰边也跟着变窄。")),
  pageBreak(),
  heading("第二页"),
  para(text("第二页只有这一段标题和说明，用来和第一页、第三页区分。")),
  para(text("打印预览里，这一页应当单独成页，页脚页码是 2。")),
  pageBreak(),
  heading("第三页"),
  para(text("第三页是最后一页。总页数应为 3。")),
  para(text("放大到 200% 后，这一页会超出窗口，可以滚动查看。")),
].join("\n");

function documentXml(body, withHeader) {
  const refs = withHeader
    ? `<w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/>`
    : `<w:footerReference w:type="default" r:id="rId2"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}">
  <w:body>
${body}
    <w:sectPr>
      ${refs}
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function story(tag, inner) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<${tag} xmlns:w="${W}">${inner}</${tag}>`;
}

const footer = story(
  "w:ftr",
  `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${text("第 ", { size: 18, color: "666666" })}<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>${text(" 页 / 共 ", { size: 18, color: "666666" })}<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple>${text(" 页", { size: 18, color: "666666" })}</w:p>`,
);

const findHeader = story("w:hdr", `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="1F4E79"/></w:pBdr></w:pPr>${text("合同档案", { size: 21, color: "1F4E79" })}</w:p>`);
const findFooter = story(
  "w:ftr",
  `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${text("合同页脚  ·  第 ", { size: 18, color: "666666" })}<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>${text(" 页", { size: 18, color: "666666" })}</w:p>`,
);

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
    <w:sz w:val="21"/><w:szCs w:val="21"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

function contentTypes(parts) {
  const overrides = parts
    .map((part) => {
      const kind = part.startsWith("header") ? "header" : part.startsWith("footer") ? "footer" : "";
      return kind
        ? `<Override PartName="/word/${part}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/>`
        : "";
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  ${overrides}
</Types>`;
}

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function docRels(entries) {
  const body = entries
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

async function write(name, files) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes(Object.keys(files).filter((name) => name.endsWith(".xml") && name !== "document.xml" && name !== "styles.xml")));
  zip.folder("_rels").file(".rels", rootRels);
  const word = zip.folder("word");
  for (const [file, xml] of Object.entries(files)) {
    if (file.endsWith(".rels")) {
      word.folder("_rels").file("document.xml.rels", xml);
    } else {
      word.file(file, xml);
    }
  }
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.mkdirSync(new URL("../public", import.meta.url), { recursive: true });
  fs.writeFileSync(new URL(`../public/${name}`, import.meta.url), buf);
  console.log("wrote", name, buf.length);
}

await write("find-demo.docx", {
  "document.xml": documentXml(findBody, true),
  "styles.xml": styles,
  "header1.xml": findHeader,
  "footer1.xml": findFooter,
  "document.xml.rels": docRels([
    ["rId1", "styles", "styles.xml"],
    ["rId2", "header", "header1.xml"],
    ["rId3", "footer", "footer1.xml"],
  ]),
});

await write("pages-demo.docx", {
  "document.xml": documentXml(pagesBody, false),
  "styles.xml": styles,
  "footer1.xml": footer,
  "document.xml.rels": docRels([
    ["rId1", "styles", "styles.xml"],
    ["rId2", "footer", "footer1.xml"],
  ]),
});
