import { describe, expect, it } from "vitest";
import { DocxPackage } from "../../src/io/docx/ooxml/DocxPackage";
import { DocxReader } from "../../src/io/docx/reader/DocxReader";
import { DocxWriter } from "../../src/io/docx/writer/DocxWriter";
import { Document } from "../../src/model/document/Document";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("批注、修订和脚注", () => {
  it("能读出插入、删除、批注和脚注", () => {
    const document = read(body());
    const first = document.paragraphs.toArray()[0].blocks;
    expect(first.map((block) => block.text)).toEqual(["前文", "插入", "删除"]);
    expect(first[1].revision).toMatchObject({ kind: "ins", id: "1", author: "张三" });
    expect(first[1].style.color).toBe("#2E75B6");
    expect(first[1].style.underline).toBe("single");
    expect(first[2].revision).toMatchObject({ kind: "del", id: "2" });
    expect(first[2].style.color).toBe("#C00000");
    expect(first[2].style.strike).toBe("single");

    const second = document.paragraphs.toArray()[1].blocks;
    expect(second[0].text).toBe("批注文字");
    expect(second[0].commentIds).toEqual(["0"]);
    expect(second[0].style.backgroundColor).toBe("#FFF2CC");
    expect(second.find((block) => block.commentRef === "0")?.text).toBe("1");
    expect(second.find((block) => block.footnoteId === "1")?.text).toBe("1");
    expect(document.comments).toEqual([
      expect.objectContaining({ id: "0", author: "张三", text: "这里补充一下口径。" }),
    ]);
    expect(document.footnotes).toEqual([{ id: "1", text: "数据来自 2024 年年报。" }]);
  });

  it("写回后再读，修订、批注和脚注还在", async () => {
    const again = new DocxReader().readPackage(await DocxPackage.open(await new DocxWriter().write(read(body()))));
    const first = again.paragraphs.toArray()[0].blocks;
    expect(first[1].revision?.kind).toBe("ins");
    expect(first[2].revision?.kind).toBe("del");
    const second = again.paragraphs.toArray()[1].blocks;
    expect(second[0].commentIds).toEqual(["0"]);
    expect(second.some((block) => block.commentRef === "0")).toBe(true);
    expect(second.some((block) => block.footnoteId === "1")).toBe(true);
    expect(again.comments[0]?.text).toBe("这里补充一下口径。");
    expect(again.footnotes[0]?.text).toBe("数据来自 2024 年年报。");
    const pack = await DocxPackage.open(await new DocxWriter().write(again));
    expect(pack.xml("word/comments.xml")).toContain("这里补充一下口径。");
    expect(pack.xml("word/footnotes.xml")).toContain("数据来自 2024 年年报。");
    const xml = pack.xml("word/document.xml") ?? "";
    expect(xml).toContain("<w:ins ");
    expect(xml).toContain("<w:del ");
    expect(xml).toContain("<w:delText");
    expect(xml).toContain("commentRangeStart");
    expect(xml).toContain("footnoteReference");
  });
});

function body(): string {
  return `
    <w:p>
      <w:r><w:t>前文</w:t></w:r>
      <w:ins w:id="1" w:author="张三" w:date="2024-05-06T00:00:00Z"><w:r><w:t>插入</w:t></w:r></w:ins>
      <w:del w:id="2" w:author="张三"><w:r><w:delText>删除</w:delText></w:r></w:del>
    </w:p>
    <w:p>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:t>批注文字</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:commentReference w:id="0"/></w:r>
      <w:r><w:t>以及</w:t></w:r>
      <w:r><w:footnoteReference w:id="1"/></w:r>
    </w:p>`;
}

function read(content: string): Document {
  const pack = DocxPackage.fromParts({
    texts: {
      "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${content}</w:body></w:document>`,
      "word/comments.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="张三" w:date="2024-05-06T00:00:00Z" w:initials="张"><w:p><w:r><w:t>这里补充一下口径。</w:t></w:r></w:p></w:comment></w:comments>`,
      "word/footnotes.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${W}">
  <w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
  <w:footnote w:id="1"><w:p><w:r><w:t>数据来自 2024 年年报。</w:t></w:r></w:p></w:footnote>
</w:footnotes>`,
    },
  });
  return new DocxReader().readPackage(pack);
}
