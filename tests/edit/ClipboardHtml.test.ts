import { describe, expect, it } from "vitest";
import { Clipboard, payloadFromData } from "../../src/edit/Clipboard";
import { clipboardHtml, parseClipboardHtml } from "../../src/edit/ClipboardHtml";
import { ClipboardPayload } from "../../src/edit/ClipboardPayload";

function io(store: { text: string; html: string }) {
  return {
    writeText: async (text: string) => {
      store.text = text;
    },
    readText: async () => store.text,
    writeHtml: async (html: string, text: string) => {
      store.html = html;
      store.text = text;
    },
    readHtml: async () => store.html,
  };
}

describe("系统剪贴板 HTML", () => {
  it("写入 HTML，读回加粗、颜色和对齐", async () => {
    const store = { text: "", html: "" };
    const clipboard = new Clipboard(io(store));
    const payload = new ClipboardPayload("红\n中", [
      { attrs: {}, runs: [{ text: "红", style: { bold: true, color: "#C00000" } }] },
      { attrs: { textAlign: "center" }, runs: [{ text: "中", style: { italic: true } }] },
    ]);
    await clipboard.write(payload);
    expect(store.html).toContain("<b>");
    expect(store.html).toContain("text-align:center");
    expect(store.text).toBe("红\n中");

    store.text = "别处改过的纯文本";
    const read = await clipboard.read();
    expect(read.paragraphs[0].runs[0].style.bold).toBe(true);
    expect(read.paragraphs[0].runs[0].style.color).toBe("#C00000");
    expect(read.paragraphs[1].attrs.textAlign).toBe("center");
    expect(read.paragraphs[1].runs[0].style.italic).toBe(true);
    expect(read.text).toBe("红\n中");
  });

  it("外来 HTML 还原粗体、字号和换行", () => {
    const html = `<p><b>粗</b><span style="font-size:16pt;color:#0070C0">蓝</span></p><p style="text-align:right">右<br>下</p>`;
    const payload = parseClipboardHtml(html);
    expect(payload?.paragraphs).toHaveLength(3);
    expect(payload?.paragraphs[0].runs[0]).toMatchObject({ text: "粗", style: { bold: true } });
    expect(payload?.paragraphs[0].runs[1].style.color).toBe("#0070C0");
    expect(payload?.paragraphs[0].runs[1].style.fontSizePx).toBeCloseTo(16 * (96 / 72));
    expect(payload?.paragraphs[1].attrs.textAlign).toBe("right");
    expect(payload?.paragraphs[1].runs[0].text).toBe("右");
    expect(payload?.paragraphs[2].runs[0].text).toBe("下");
  });

  it("只有表格的 HTML 还原成表", () => {
    const html = "<table><tr><td>甲</td><td><b>乙</b></td></tr></table>";
    const payload = parseClipboardHtml(html);
    expect(payload?.table?.rows).toHaveLength(1);
    expect(payload?.table?.rows[0].cells[1].paragraphs[0].runs[0].style.bold).toBe(true);
    expect(payload?.text).toBe("甲\t乙");
  });

  it("段落和表格混在一起时表格变成制表符，不丢掉旁边的段落", () => {
    const html = "<p>上文</p><table><tr><td>甲</td><td>乙</td></tr></table><p>下文</p>";
    const payload = parseClipboardHtml(html);
    expect(payload?.table).toBeUndefined();
    expect(payload?.paragraphs.map((item) => item.runs.map((run) => run.text).join(""))).toEqual(["上文", "甲\t乙", "下文"]);
  });

  it("粘贴事件里的 HTML 优先于纯文本", () => {
    const html = clipboardHtml(
      new ClipboardPayload("红", [{ attrs: {}, runs: [{ text: "红", style: { bold: true } }] }]),
    );
    const payload = payloadFromData({
      getData: (format: string) => (format === "text/html" ? html : "红"),
    });
    expect(payload?.paragraphs[0].runs[0].style.bold).toBe(true);
  });

  it("读取 HTML 不返回时退回纯文本", async () => {
    const clipboard = new Clipboard(
      {
        writeText: async () => undefined,
        readText: async () => "from-system",
        readHtml: () => new Promise(() => undefined),
      },
      30,
    );
    await clipboard.writeText("local");
    expect(await clipboard.readText()).toBe("from-system");
  });

  it("生成的 HTML 能被自己读回表格列宽", () => {
    const payload = new ClipboardPayload("A", [], {
      columnWidths: [120, 40],
      rows: [
        {
          cells: [
            { colSpan: 1, rowSpan: 1, paragraphs: [{ attrs: {}, runs: [{ text: "A", style: {} }] }] },
            { colSpan: 1, rowSpan: 1, paragraphs: [{ attrs: {}, runs: [{ text: "B", style: { underline: "single" } }] }] },
          ],
        },
      ],
    });
    const read = parseClipboardHtml(clipboardHtml(payload));
    expect(read?.table?.columnWidths).toEqual([120, 40]);
    expect(read?.table?.rows[0].cells[1].paragraphs[0].runs[0].style.underline).toBe("single");
  });
});
