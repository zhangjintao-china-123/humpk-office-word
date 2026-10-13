import { describe, expect, it } from "vitest";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { paragraphPropertiesXml } from "../../src/io/docx/writer/paragraph/ParagraphPropertiesWriter";
import type { ParagraphAttrs } from "../../src/model/style/ParagraphAttrs";

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="a">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr>
  </w:style>
</w:styles>`;

const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:pPr><w:ind w:left="420" w:hanging="420"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>正文</w:t></w:r></w:p>
    <w:p><w:pPr>
      <w:ind w:left="420" w:leftChars="200" w:hanging="420" w:hangingChars="200"/>
      <w:spacing w:before="0" w:after="0"/>
      <w:jc w:val="distribute"/>
      <w:textAlignment w:val="baseline"/>
      <w:pageBreakBefore/>
      <w:keepNext/>
      <w:keepLines/>
      <w:overflowPunct w:val="0"/>
      <w:autoSpaceDE w:val="0"/>
      <w:shd w:val="clear" w:fill="FFFF00"/>
      <w:pBdr>
        <w:top w:val="single" w:sz="4" w:space="1" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:color="FF0000"/>
        <w:bottom w:val="single" w:sz="12" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:color="auto"/>
      </w:pBdr>
    </w:pPr><w:r><w:t>格式</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>条款</w:t></w:r></w:p>
  </w:body>
</w:document>`;

describe("段落属性", () => {
  it("套用正文样式，并读入缩进、边框、底纹和分页开关", () => {
    const pack = DocxPackage.fromParts({
      texts: {
        "word/document.xml": documentXml,
        "word/styles.xml": styles,
        "word/numbering.xml": numbering,
      },
    });
    const paragraphs = new DocxReader().readPackage(pack).paragraphs.toArray();
    expect(paragraphs[0].attrs.after).toBe("160");
    expect(paragraphs[0].attrs.line).toBe("240");
    expect(paragraphs[0].attrs.resolvedStyleId).toBe("a");
    expect(paragraphs[0].inheritedRunStyle?.wEastAsia).toBe("宋体");
    expect(paragraphs[0].attrs.styleId).toBeUndefined();

    const formatted = paragraphs[1].attrs;
    expect(formatted.leftTwip).toBe(420);
    expect(formatted.leftChars).toBe(200);
    expect(formatted.hangingChars).toBe(200);
    expect(formatted.before).toBe("0");
    expect(formatted.textAlign).toBe("distribute");
    expect(formatted.textAlignment).toBe("baseline");
    expect(formatted.pageBreakBefore).toBe("1");
    expect(formatted.keepNext).toBe("1");
    expect(formatted.keepLines).toBe("1");
    expect(formatted.overflowPunct).toBe("0");
    expect(formatted.autoSpaceDE).toBe("0");
    expect(formatted.shading?.fill).toBe("FFFF00");
    expect(formatted.borderTop?.space).toBe("1");
    expect(formatted.borderLeft?.color).toBe("FF0000");
    expect(formatted.borderBottom?.sz).toBe("12");
    expect(formatted.borderRight?.val).toBe("single");

    expect(paragraphs[2].attrs.leftTwip).toBe(420);
    expect(paragraphs[2].attrs.hangingTwip).toBe(420);
  });

  it("段前为 0、左缩进和悬挂缩进会写回去", () => {
    const attrs: ParagraphAttrs = {
      before: "0",
      after: "0",
      leftTwip: 420,
      hangingTwip: 420,
      leftChars: 200,
      pageBreakBefore: "1",
      overflowPunct: "0",
      borderTop: { val: "single", sz: "4" },
      shading: { val: "clear", fill: "FFFF00" },
    };
    const xml = paragraphPropertiesXml(attrs);
    expect(xml).toContain('w:before="0"');
    expect(xml).toContain('w:after="0"');
    expect(xml).toContain('w:left="420"');
    expect(xml).toContain('w:hanging="420"');
    expect(xml).toContain('w:leftChars="200"');
    expect(xml).toContain("<w:pageBreakBefore");
    expect(xml).toContain('w:overflowPunct w:val="0"');
    expect(xml).toContain("<w:top ");
    expect(xml).toContain('w:fill="FFFF00"');
  });
});
