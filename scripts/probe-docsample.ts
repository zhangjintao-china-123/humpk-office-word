import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Window } from "happy-dom";
import { DocxReader } from "../src/io/docx/reader/DocxReader";
import { WordStreamBuilder } from "../src/model/flatten/WordStreamBuilder";
import type { Document } from "../src/model/document/Document";

const happy = new Window();
globalThis.DOMParser = happy.DOMParser;

const dir = join(process.cwd(), "docsample/test01");

function countTables(document: Document): number {
  let count = 0;
  document.paragraphs.each((node) => {
    if (node.data.isTable) {
      count += 1;
    }
  });
  return count;
}

function collectAllText(document: Document, builder: WordStreamBuilder): string {
  const parts = [builder.joinText(document)];
  for (const section of document.sections) {
    for (const header of section.headers.values()) {
      parts.push(collectAllText(header, builder));
    }
    for (const footer of section.footers.values()) {
      parts.push(collectAllText(footer, builder));
    }
  }
  document.paragraphs.each((node) => {
    const table = node.data.table;
    if (!table) {
      return;
    }
    for (const row of table.rows) {
      for (const cell of row.cells) {
        parts.push(collectAllText(cell.document, builder));
      }
    }
  });
  return parts.join("");
}

function countDrawings(document: Document): number {
  let count = 0;
  document.paragraphs.each((node) => {
    for (const block of node.data.blocks) {
      if (block.drawing) {
        count += 1;
      }
    }
  });
  return count;
}

async function probe(fileName: string) {
  const started = Date.now();
  const data = await readFile(join(dir, fileName));
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const document = await new DocxReader().read(buffer);
  const builder = new WordStreamBuilder();
  builder.build(document);
  const text = collectAllText(document, builder).replace(/\n+/g, "\n").trim();
  return {
    fileName,
    ms: Date.now() - started,
    paragraphs: document.paragraphs.length,
    words: document.words.length,
    tables: countTables(document),
    drawings: countDrawings(document),
    headers: document.header() ? document.header()!.paragraphs.length : 0,
    footers: document.footer() ? document.footer()!.paragraphs.length : 0,
    preview: text.slice(0, 80),
  };
}

const files = (await readdir(dir))
  .filter((name) => name.toLowerCase().endsWith(".docx"))
  .sort((a, b) => a.localeCompare(b, "zh-CN"));

const ok: Awaited<ReturnType<typeof probe>>[] = [];
const failed: { fileName: string; error: string }[] = [];

for (const fileName of files) {
  try {
    ok.push(await probe(fileName));
    process.stdout.write(`OK  ${fileName}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    failed.push({ fileName, error: message });
    process.stdout.write(`ERR ${fileName}\n${message}\n`);
  }
}

console.log("\n======== 汇总 ========");
console.log(`共 ${files.length} 个，成功 ${ok.length}，失败 ${failed.length}\n`);
for (const item of ok) {
  console.log(
    `${item.fileName}\n  段=${item.paragraphs} 字=${item.words} 表=${item.tables} 图=${item.drawings} 眉=${item.headers} 脚=${item.footers} ${item.ms}ms\n  ${JSON.stringify(item.preview)}`,
  );
}
if (failed.length > 0) {
  console.log("\n失败文件:");
  for (const item of failed) {
    console.log(`- ${item.fileName}: ${item.error}`);
  }
  process.exitCode = 1;
}
