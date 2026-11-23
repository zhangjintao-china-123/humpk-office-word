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

function ins(id, author, value) {
  return `<w:ins w:id="${id}" w:author="${author}" w:date="2024-06-01T00:00:00Z">${text(value)}</w:ins>`;
}

function del(id, author, value) {
  return `<w:del w:id="${id}" w:author="${author}" w:date="2024-06-01T00:00:00Z"><w:r><w:delText xml:space="preserve">${value}</w:delText></w:r></w:del>`;
}

function commentRange(id, value) {
  return `<w:commentRangeStart w:id="${id}"/>${text(value)}<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`;
}

function footnoteRef(id) {
  return `<w:r><w:footnoteReference w:id="${id}"/></w:r>`;
}

function packageXml(body, comments, footnotes, title, creator) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>
${body}
<w:sectPr>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1134" w:right="1134" w:bottom="1701" w:left="1134" w:header="720" w:footer="720"/>
</w:sectPr>
</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/>
    <w:sz w:val="21"/><w:szCs w:val="21"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${title}</dc:title>
  <dc:creator>${creator}</dc:creator>
</cp:coreProperties>`;
  const overrides = [
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`,
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
  ];
  const rels = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ];
  if (comments) {
    overrides.push(`<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`);
    rels.push(`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`);
  }
  if (footnotes) {
    overrides.push(`<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>`);
    rels.push(`<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>`);
  }
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${overrides.join("\n  ")}
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rels.join("\n  ")}
</Relationships>`;
  return { documentXml, styles, core, contentTypes, rootRels, docRels, comments, footnotes };
}

function commentsXml(items) {
  const body = items
    .map(
      (item) =>
        `<w:comment w:id="${item.id}" w:author="${item.author}" w:date="2024-06-01T00:00:00Z" w:initials="${item.author.slice(0, 1)}"><w:p><w:r><w:t>${item.text}</w:t></w:r></w:p></w:comment>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W}">${body}</w:comments>`;
}

function footnotesXml(items) {
  const reserved = `<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`;
  const body = items
    .map((item) => `<w:footnote w:id="${item.id}"><w:p><w:r><w:t>${item.text}</w:t></w:r></w:p></w:footnote>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="${W}">${reserved}${body}</w:footnotes>`;
}

const demos = [
  {
    name: "review-demo.docx",
    title: "审阅示例",
    creator: "张三",
    body: [
      para(text("审阅示例", { bold: true, size: 32, color: "1F4E79" })),
      para(text("蓝色下划线是插入，红色删除线是删除。黄底是批注，页底是脚注。", { color: "666666", size: 21 }), "160"),
      para(
        `${text("这份说明")}${ins("1", "张三", "补充了最新口径")}${text("，原来的")}${del("2", "张三", "旧说法")}${text("不再使用。")}`,
        "200",
      ),
      para(
        `${text("请看")}${commentRange("0", "这段需要核对的数字")}${text("，出处见脚注")}${footnoteRef("1")}${text("。")}`,
        "160",
      ),
      para(text("选中修订后可以用「接受」或「拒绝」。批注和脚注菜单可以跳到对应位置。", { color: "666666", size: 21 }), "200"),
    ].join("\n"),
    comments: [{ id: "0", author: "张三", text: "这里的数字要和年报第 12 页核对。" }],
    footnotes: [{ id: "1", text: "数据来自 2024 年年报。" }],
  },
  {
    name: "review-track-demo.docx",
    title: "修订对照",
    creator: "张三",
    body: [
      para(text("修订对照", { bold: true, size: 32, color: "1F4E79" })),
      para(text("同一段里可以连续插入和删除。蓝字是新增，红字是删掉的原文。", { color: "666666", size: 21 }), "160"),
      para(text("1. 替换一个词", { bold: true, color: "1F4E79" }), "200"),
      para(`${text("会议通过了")}${del("1", "张三", "初步方案")}${ins("2", "张三", "正式方案")}${text("。")}`),
      para(text("2. 删掉一句，补上一句", { bold: true, color: "1F4E79" }), "200"),
      para(`${del("3", "李四", "此条仅供内部讨论。")}${ins("4", "张三", "此条可以对外引用。")}`),
      para(text("3. 一句里改两处", { bold: true, color: "1F4E79" }), "200"),
      para(
        `${text("预算从")}${del("5", "李四", "80 万")}${ins("6", "李四", "120 万")}${text("调整到")}${del("7", "张三", "明年")}${ins("8", "张三", "本季度")}${text("完成。")}`,
      ),
      para(text("4. 整句作废，整句新增", { bold: true, color: "1F4E79" }), "200"),
      para(del("9", "李四", "旧结论：维持原预算，不再追加。")),
      para(ins("10", "张三", "新结论：本季度追加到 120 万，周五前确认。")),
    ].join("\n"),
  },
  {
    name: "review-notes-demo.docx",
    title: "批注与脚注",
    creator: "张三",
    body: [
      para(text("批注与脚注", { bold: true, size: 32, color: "1F4E79" })),
      para(text("黄底对应批注菜单，上标对应页底脚注。第二页的脚注只出现在第二页。", { color: "666666", size: 21 }), "160"),
      para(
        `${text("营收")}${commentRange("0", "同比增长 12%")}${footnoteRef("1")}${text("，毛利率")}${commentRange("1", "保持在 28%")}${footnoteRef("2")}${text("。")}`,
        "200",
      ),
      para(`${text("请")}${ins("1", "张三", "在周五前")}${text("确认")}${commentRange("2", "附件三")}${text("。")}`, "120"),
      `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
      para(text("第二页", { bold: true, size: 32, color: "1F4E79" })),
      para(`${text("结论与董事会决议一致")}${footnoteRef("3")}${text("。")}`, "160"),
      para(`${text("详见")}${commentRange("3", "审计意见")}${text("。")}`, "80"),
    ].join("\n"),
    comments: [
      { id: "0", author: "张三", text: "12% 含海外子公司。" },
      { id: "1", author: "李四", text: "28% 是扣非后口径。" },
      { id: "2", author: "李四", text: "附件三还缺审计意见。" },
      { id: "3", author: "张三", text: "审计意见放在附录最后。" },
    ],
    footnotes: [
      { id: "1", text: "营收含海外子公司。" },
      { id: "2", text: "毛利率为扣非后口径。" },
      { id: "3", text: "结论与董事会决议一致。" },
    ],
  },
];

const dir = new URL("../public/", import.meta.url);
fs.mkdirSync(dir, { recursive: true });
for (const demo of demos) {
  const parts = packageXml(demo.body, demo.comments, demo.footnotes, demo.title, demo.creator);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", parts.contentTypes);
  zip.folder("_rels").file(".rels", parts.rootRels);
  zip.folder("docProps").file("core.xml", parts.core);
  const word = zip.folder("word");
  word.file("document.xml", parts.documentXml);
  word.file("styles.xml", parts.styles);
  if (parts.comments) {
    word.file("comments.xml", commentsXml(demo.comments));
  }
  if (parts.footnotes) {
    word.file("footnotes.xml", footnotesXml(demo.footnotes));
  }
  word.folder("_rels").file("document.xml.rels", parts.docRels);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(new URL(demo.name, dir), buf);
  console.log("wrote public/" + demo.name, buf.length);
}
