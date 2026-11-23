import JSZip from "jszip";
import fs from "fs";
import zlib from "node:zlib";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";

const borders = `
  <w:tblBorders>
    <w:top w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:left w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:bottom w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:right w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:insideH w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
    <w:insideV w:val="single" w:sz="8" w:space="0" w:color="2E75B6"/>
  </w:tblBorders>`;

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
  return para(text, `<w:spacing w:before="280" w:after="60"/>`, { size: 32, bold: true, color: "C45911" });
}

function note(text) {
  return para(text, `<w:spacing w:before="20" w:after="80"/>`, { size: 21, color: "666666" });
}

function cell(text, extra = "", fill = "", opts = {}) {
  return rawCell(para(text, "", opts), extra, fill);
}

function rawCell(body, extra = "", fill = "") {
  const shd = fill ? `<w:shd w:val="clear" w:fill="${fill}"/>` : "";
  return `<w:tc><w:tcPr>${extra}${shd}</w:tcPr>${body}</w:tc>`;
}

function png(width, height, fill) {
  let c = ~0;
  const crc32 = (buf) => {
    c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + body.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 4 + body.length);
    return out;
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const edge = x < 4 || y < 4 || x >= width - 4 || y >= height - 4;
      const [r, g, b] = edge ? [255, 255, 255] : fill;
      const at = row + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inlineImage(id, rel, width, height) {
  const cx = Math.round(width * 9525);
  const cy = Math.round(height * 9525);
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="pic${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><a:blip r:embed="${rel}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function table(tblPr, grid, rows, borderXml = borders) {
  const cols = grid.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  return `<w:tbl><w:tblPr>${tblPr}${borderXml}</w:tblPr><w:tblGrid>${cols}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

function edge(tag, spec) {
  if (!spec || spec.val === "nil") {
    return `<${tag} w:val="nil"/>`;
  }
  return `<${tag} w:val="${spec.val}" w:sz="${spec.sz}" w:space="0" w:color="${spec.color}"/>`;
}

function borderSet(spec) {
  const sides = ["top", "left", "bottom", "right", "insideH", "insideV", "tl2br", "tr2bl"];
  return sides.map((side) => edge(`w:${side}`, spec[side])).join("");
}

function lineTable(spec, rows, cols = [3200, 3200, 3200]) {
  return table(`<w:tblW w:w="5000" w:type="pct"/>`, cols, rows, `<w:tblBorders>${borderSet(spec)}</w:tblBorders>`);
}

const single = (sz, color) => ({ val: "single", sz, color });
const thick = single("18", "1F4E79");
const hair = single("4", "8FAADC");
const black = (sz) => single(sz, "000000");
const gridRow = (a, b, c) => `<w:tr>${cell(a)}${cell(b)}${cell(c)}</w:tr>`;
const label = (text) => para(text, `<w:spacing w:before="160" w:after="40"/>`, { bold: true });

const valign = table(
  `<w:tblW w:w="5000" w:type="pct"/>`,
  [3200, 3200, 3200],
  [
    `<w:tr><w:trPr><w:trHeight w:val="1400" w:hRule="exact"/></w:trPr>
      ${cell("顶对齐", `<w:vAlign w:val="top"/>`, "FFF2CC")}
      ${cell("居中", `<w:vAlign w:val="center"/>`, "E2EFDA")}
      ${cell("底对齐", `<w:vAlign w:val="bottom"/>`, "DDEBF7")}
    </w:tr>`,
  ],
);

const margins = table(
  `<w:tblW w:w="5000" w:type="pct"/>`,
  [4800, 4800],
  [
    `<w:tr>
      ${cell("贴着边框", `<w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>`, "F2F2F2")}
      ${cell("四周留出空隙", `<w:tcMar><w:top w:w="280" w:type="dxa"/><w:left w:w="360" w:type="dxa"/><w:bottom w:w="280" w:type="dxa"/><w:right w:w="360" w:type="dxa"/></w:tcMar>`, "FFF2CC")}
    </w:tr>`,
  ],
);

const heights = table(
  `<w:tblW w:w="5000" w:type="pct"/>`,
  [9600],
  [
    `<w:tr><w:trPr><w:trHeight w:val="1200" w:hRule="exact"/></w:trPr>${cell("固定行高，多出来的空白留在字下面。", "", "FCE4D6")}</w:tr>`,
    `<w:tr><w:trPr><w:trHeight w:val="700" w:hRule="atLeast"/></w:trPr>${cell("至少这么高。字少的时候行也不会更矮。", "", "E2EFDA")}</w:tr>`,
    `<w:tr>${cell("这一行跟着字走。", "", "DDEBF7")}</w:tr>`,
  ],
);

function narrow(label, jc, fill) {
  const align = jc ? `<w:jc w:val="${jc}"/>` : "";
  return table(
    `<w:tblW w:w="2500" w:type="pct"/>${align}`,
    [4800],
    [`<w:tr>${cell(label, "", fill, { bold: true })}</w:tr>`],
  );
}

const headerRows = [
  `<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="500" w:hRule="atLeast"/></w:trPr>${cell("标题行，翻到下一页还会再出现", "", "F8CBAD", { bold: true, color: "C45911" })}</w:tr>`,
];
for (let index = 1; index <= 58; index += 1) {
  const fill = index % 2 === 0 ? "F7F7F7" : "FFFFFF";
  headerRows.push(
    `<w:tr><w:trPr><w:trHeight w:val="420" w:hRule="atLeast"/></w:trPr>${cell(`第 ${index} 行`, "", fill)}</w:tr>`,
  );
}
const inner = table(
  `<w:tblW w:w="5000" w:type="pct"/>`,
  [2200, 2200],
  [
    `<w:tr>${cell("甲", "", "FCE4D6", { bold: true })}${cell("乙", "", "FFF2CC", { bold: true })}</w:tr>`,
    `<w:tr>${cell("丙", "", "E2EFDA")}${cell("丁", "", "DDEBF7")}</w:tr>`,
  ],
);
const nested = table(
  `<w:tblW w:w="5000" w:type="pct"/>`,
  [3200, 6400],
  [
    `<w:tr>
      ${rawCell(`${para("外层这一格只有文字。右边整格是另一张表。")}`, "", "F7F7F7")}
      ${rawCell(inner)}
    </w:tr>`,
  ],
);

const imageRow = table(
  `<w:tblW w:w="5000" w:type="pct"/>`,
  [3600, 6000],
  [
    `<w:tr>
      ${rawCell(`${inlineImage(1, "rId4", 120, 84)}${para("图下面还有一行字。", `<w:spacing w:before="60"/>`, { size: 21, color: "666666" })}`, "", "FFF2CC")}
      ${rawCell(para("右边这格和图片同一行，行高跟着图片走。", `<w:spacing w:before="80"/>`), `<w:vAlign w:val="center"/>`, "E2EFDA")}
    </w:tr>`,
  ],
);

const repeating = table(`<w:tblW w:w="5000" w:type="pct"/>`, [9600], headerRows);

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}">
  <w:body>
    ${para("表格版式", `<w:spacing w:after="40"/>`, { size: 44, bold: true })}
    ${note("下面每节对应一种表格特性。框的颜色只是为了把格子衬出来。")}
    ${heading("1. 垂直对齐")}
    ${note("三格行高相同。字分别贴在上沿、正中和下沿。")}
    ${valign}
    ${heading("2. 单元格边距")}
    ${note("左格文字贴着框线。右格上下左右都留出一截空隙。")}
    ${margins}
    ${heading("3. 行高")}
    ${note("第一行是固定高度，第二行是最小值，第三行跟着文字。")}
    ${heights}
    ${heading("4. 表宽和对齐")}
    ${note("三张表都是半行宽。第一张靠左并再缩进一点，第二张居中，第三张靠右。最后一张拉满整行。")}
    ${table(`<w:tblW w:w="2500" w:type="pct"/><w:jc w:val="left"/><w:tblInd w:w="567" w:type="dxa"/>`, [4800], [`<w:tr>${cell("靠左，并缩进", "", "FFF2CC", { bold: true })}</w:tr>`])}
    ${para("", `<w:spacing w:before="80" w:after="0"/>`)}
    ${narrow("居中", "center", "E2EFDA")}
    ${para("", `<w:spacing w:before="80" w:after="0"/>`)}
    ${narrow("靠右", "right", "DDEBF7")}
    ${para("", `<w:spacing w:before="80" w:after="0"/>`)}
    ${table(`<w:tblW w:w="5000" w:type="pct"/>`, [9600], [`<w:tr>${cell("整行宽", "", "F8CBAD", { bold: true })}</w:tr>`])}
    ${para("5. 表格线", `<w:pageBreakBefore/><w:spacing w:before="0" w:after="60"/>`, { size: 32, bold: true, color: "C45911" })}
    ${note("每张表只改线。外框、内部、横线、竖线、虚线、点线、斜线、粗细，以及某一格自己的框。")}
    ${label("外框粗，里面细")}
    ${lineTable(
      { top: thick, left: thick, bottom: thick, right: thick, insideH: hair, insideV: hair },
      [gridRow("甲", "乙", "丙"), gridRow("丁", "戊", "己")],
    )}
    ${label("只留外框")}
    ${lineTable(
      { top: black("12"), left: black("12"), bottom: black("12"), right: black("12") },
      [gridRow("甲", "乙", "丙"), gridRow("丁", "戊", "己")],
    )}
    ${label("只留内部的线")}
    ${lineTable(
      { insideH: black("8"), insideV: black("8") },
      [gridRow("甲", "乙", "丙"), gridRow("丁", "戊", "己")],
    )}
    ${label("只留横线")}
    ${lineTable({ insideH: black("12") }, [gridRow("甲", "乙", "丙"), gridRow("丁", "戊", "己"), gridRow("庚", "辛", "壬")])}
    ${label("只留竖线")}
    ${lineTable({ insideV: black("12") }, [gridRow("甲", "乙", "丙"), gridRow("丁", "戊", "己")])}
    ${label("外框虚线，内部点线")}
    ${lineTable(
      {
        top: { val: "dashed", sz: "12", color: "C00000" },
        left: { val: "dashed", sz: "12", color: "C00000" },
        bottom: { val: "dashed", sz: "12", color: "C00000" },
        right: { val: "dashed", sz: "12", color: "C00000" },
        insideH: { val: "dotted", sz: "12", color: "2E75B6" },
        insideV: { val: "dotted", sz: "12", color: "2E75B6" },
      },
      [gridRow("甲", "乙", "丙"), gridRow("丁", "戊", "己")],
    )}
    ${label("0.5 磅、1.5 磅、3 磅")}
    ${lineTable({ top: black("4"), left: black("4"), bottom: black("4"), right: black("4"), insideH: black("4"), insideV: black("4") }, [gridRow("0.5 磅", "细", "细")])}
    ${lineTable({ top: black("12"), left: black("12"), bottom: black("12"), right: black("12"), insideH: black("12"), insideV: black("12") }, [gridRow("1.5 磅", "中", "中")])}
    ${lineTable({ top: black("24"), left: black("24"), bottom: black("24"), right: black("24"), insideH: black("24"), insideV: black("24") }, [gridRow("3 磅", "粗", "粗")])}
    ${label("斜线，以及单独一格的红框")}
    ${lineTable(
      { top: hair, left: hair, bottom: hair, right: hair, insideH: hair, insideV: hair },
      [
        `<w:tr><w:trPr><w:trHeight w:val="1100" w:hRule="atLeast"/></w:trPr>
          ${rawCell(para("斜线格"), `<w:tcBorders><w:tl2br w:val="single" w:sz="12" w:space="0" w:color="C00000"/><w:tr2bl w:val="single" w:sz="12" w:space="0" w:color="2E75B6"/></w:tcBorders>`)}
          ${cell("这一格四边描红", `<w:tcBorders>${borderSet({ top: single("18", "C00000"), left: single("18", "C00000"), bottom: single("18", "C00000"), right: single("18", "C00000") })}</w:tcBorders>`)}
          ${cell("旁边仍是细线")}
        </w:tr>`,
      ],
    )}
    ${label("不要线，只留底色")}
    ${lineTable({}, [
      `<w:tr>${cell("甲", "", "FFF2CC")}${cell("乙", "", "E2EFDA")}${cell("丙", "", "DDEBF7")}</w:tr>`,
    ])}
    ${heading("6. 表中表")}
    ${note("外层右边那一格里面又是一张两行两列的表，甲乙丙丁各占一格。")}
    ${nested}
    ${heading("7. 格子里的图")}
    ${note("图片嵌在左格里，左格因此变高。右格文字在这一行里垂直居中。")}
    ${imageRow}
    ${heading("8. 标题行跨页")}
    ${note("这一页放不下整张表。下一页开头仍是橙色标题行，再接后面的数据。")}
    ${repeating}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>
      <w:sz w:val="24"/><w:szCs w:val="24"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:snapToGrid w:val="0"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:snapToGrid w:val="0"/></w:pPr>
  </w:style>
</w:styles>`;

const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
);
zip.folder("_rels").file(
  ".rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
);
const word = zip.folder("word");
word.file("document.xml", documentXml);
word.file("styles.xml", stylesXml);
word.folder("_rels").file(
  "document.xml.rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/cell.png"/></Relationships>`,
);
word.folder("media").file("cell.png", png(120, 84, [196, 89, 17]));

const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
fs.writeFileSync(new URL("../public/table-demo.docx", import.meta.url), buf);
console.log("wrote public/table-demo.docx", buf.length);
