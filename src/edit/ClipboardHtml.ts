import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { RunStyle } from "../model/style/RunStyle";
import { ptToPx, pxToPt } from "../shared/units";
import { ClipboardPayload, type ClipboardParagraph, type ClipboardRun, type ClipboardTable } from "./ClipboardPayload";

const MARK = "humpk-office:";

/** 系统剪贴板用的 HTML：外面能看见样式，注释里留一份完整副本。 */
export function clipboardHtml(payload: ClipboardPayload): string {
  const body = payload.table ? tableHtml(payload.table) : payload.paragraphs.map(paragraphHtml).join("");
  const stored = encodeURIComponent(
    JSON.stringify({ v: 1, paragraphs: payload.paragraphs, table: payload.table }),
  );
  return `<!DOCTYPE html><html><body><!--${MARK}${stored}-->${body}</body></html>`;
}

/** 读回本编辑器写入的副本；否则按常见 HTML 样式还原。 */
export function parseClipboardHtml(html: string): ClipboardPayload | undefined {
  const marked = html.match(/<!--humpk-office:([\s\S]*?)-->/);
  if (marked) {
    try {
      const data = JSON.parse(decodeURIComponent(marked[1])) as StoredPayload;
      const payload = payloadFromStored(data);
      if (payload) {
        return payload;
      }
    } catch {
      // 注释损坏时改走可见 HTML
    }
  }
  if (typeof DOMParser === "undefined") {
    return undefined;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.body.querySelector("table");
  const paragraphs = paragraphsFromHtml(doc.body);
  if (table && paragraphs.length === 0) {
    const grid = tableFromHtml(table);
    const text = grid.rows
      .map((row) => row.cells.map((cell) => cell.paragraphs.map((item) => item.runs.map((run) => run.text).join("")).join("")).join("\t"))
      .join("\n");
    return new ClipboardPayload(text, [], grid);
  }
  if (!paragraphs.length) {
    return undefined;
  }
  return new ClipboardPayload(joinText(paragraphs), paragraphs);
}

function paragraphHtml(paragraph: ClipboardParagraph): string {
  const align = paragraph.attrs.textAlign;
  const style = align && align !== "left" && align !== "start" ? ` style="text-align:${escapeAttr(align)}"` : "";
  const runs = paragraph.runs.map((run) => runHtml(run)).join("");
  return `<p${style}>${runs}</p>`;
}

function runHtml(run: ClipboardRun): string {
  let html = escapeText(run.text);
  const style = cssOf(run.style);
  if (style) {
    html = `<span style="${escapeAttr(style)}">${html}</span>`;
  }
  if (run.style.strike) {
    html = `<s>${html}</s>`;
  }
  if (run.style.underline && run.style.underline !== "none") {
    html = `<u>${html}</u>`;
  }
  if (run.style.italic) {
    html = `<i>${html}</i>`;
  }
  if (run.style.bold) {
    html = `<b>${html}</b>`;
  }
  return html;
}

function cssOf(style: RunStyle): string {
  const parts: string[] = [];
  const family = style.fontFamily || style.wEastAsia || style.wAscii;
  if (family) {
    parts.push(`font-family:${family}`);
  }
  if (style.fontSizePx) {
    parts.push(`font-size:${pxToPt(style.fontSizePx)}pt`);
  }
  if (style.color) {
    parts.push(`color:${style.color}`);
  }
  const fill = style.backgroundColor || style.highlight;
  if (fill) {
    parts.push(`background-color:${fill}`);
  }
  return parts.join(";");
}

function tableHtml(table: ClipboardTable): string {
  const rows = table.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          const span = `${cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ""}${cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ""}`;
          return `<td${span}>${cell.paragraphs.map(paragraphHtml).join("")}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table>${rows}</table>`;
}

interface StoredPayload {
  v?: number;
  paragraphs?: ClipboardParagraph[];
  table?: ClipboardTable;
}

function payloadFromStored(data: StoredPayload): ClipboardPayload | undefined {
  if (data.v !== 1 || !Array.isArray(data.paragraphs)) {
    return undefined;
  }
  const paragraphs = data.paragraphs.filter((item) => item && Array.isArray(item.runs));
  return new ClipboardPayload(joinText(paragraphs), paragraphs, data.table);
}

function paragraphsFromHtml(body: HTMLElement): ClipboardParagraph[] {
  const blocks = [...body.children].filter((node) => isBlock(node.tagName));
  if (!blocks.length) {
    return collectInline(body, {});
  }
  if (blocks.length === 1 && blocks[0].tagName === "TABLE") {
    return [];
  }
  const paragraphs: ClipboardParagraph[] = [];
  for (const block of blocks) {
    if (block.tagName === "TABLE") {
      paragraphs.push(...flattenTable(block as HTMLTableElement));
      continue;
    }
    paragraphs.push(...collectInline(block, alignOf(block as HTMLElement)));
  }
  return paragraphs;
}

function flattenTable(table: HTMLTableElement): ClipboardParagraph[] {
  return [...table.rows].flatMap((row) => {
    const runs: ClipboardRun[] = [];
    [...row.cells].forEach((cell, index) => {
      if (index > 0) {
        runs.push({ text: "\t", style: {} });
      }
      for (const paragraph of collectInline(cell, {})) {
        runs.push(...paragraph.runs);
      }
    });
    return runs.length ? [{ attrs: {}, runs }] : [];
  });
}

function collectInline(root: ParentNode, attrs: ParagraphAttrs): ClipboardParagraph[] {
  const runs: ClipboardRun[] = [];
  walk(root, {}, runs);
  const paragraphs: ClipboardParagraph[] = [{ attrs, runs: [] }];
  for (const run of mergeRuns(runs)) {
    const parts = run.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) {
        paragraphs.push({ attrs: { ...attrs }, runs: [] });
      }
      if (part) {
        paragraphs.at(-1)?.runs.push({ text: part, style: { ...run.style } });
      }
    });
  }
  return paragraphs.some((item) => item.runs.length) ? paragraphs : [];
}

function walk(node: ParentNode, style: RunStyle, runs: ClipboardRun[]): void {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) {
      const text = child.textContent ?? "";
      if (text) {
        runs.push({ text, style: { ...style } });
      }
      continue;
    }
    if (child.nodeType !== 1) {
      continue;
    }
    const element = child as HTMLElement;
    const name = element.tagName.toLowerCase();
    if (name === "script" || name === "style") {
      continue;
    }
    if (name === "br") {
      runs.push({ text: "\n", style: { ...style } });
      continue;
    }
    walk(element, mergeElementStyle(style, element), runs);
  }
}

function tableFromHtml(table: HTMLTableElement): ClipboardTable {
  const rows = [...table.rows].map((row) => ({
    cells: [...row.cells].map((cell) => ({
      colSpan: cell.colSpan || 1,
      rowSpan: cell.rowSpan || 1,
      paragraphs: collectInline(cell, alignOf(cell)),
    })),
  }));
  const count = rows.reduce((max, row) => Math.max(max, row.cells.reduce((sum, cell) => sum + cell.colSpan, 0)), 1);
  return {
    columnWidths: Array.from({ length: count }, () => 80),
    rows,
  };
}

function alignOf(element: HTMLElement): ParagraphAttrs {
  const align = element.style.textAlign || element.getAttribute("align") || "";
  if (align === "center" || align === "right" || align === "justify" || align === "both") {
    return { textAlign: align === "justify" ? "both" : align };
  }
  return {};
}

function mergeElementStyle(base: RunStyle, element: HTMLElement): RunStyle {
  const next: RunStyle = { ...base };
  const name = element.tagName.toLowerCase();
  if (name === "b" || name === "strong") {
    next.bold = true;
  }
  if (name === "i" || name === "em") {
    next.italic = true;
  }
  if (name === "u") {
    next.underline = "single";
  }
  if (name === "s" || name === "strike" || name === "del") {
    next.strike = "single";
  }
  if (name === "font") {
    const color = element.getAttribute("color");
    const face = element.getAttribute("face");
    if (color) {
      next.color = color;
    }
    if (face) {
      next.fontFamily = face;
    }
  }
  const style = element.getAttribute("style") ?? "";
  for (const piece of style.split(";")) {
    const split = piece.indexOf(":");
    if (split < 0) {
      continue;
    }
    const key = piece.slice(0, split).trim().toLowerCase();
    const value = piece.slice(split + 1).trim();
    if (key === "color" && value) {
      next.color = value;
    }
    if ((key === "background" || key === "background-color") && value && value !== "transparent") {
      next.backgroundColor = value;
      next.highlight = value;
    }
    if (key === "font-family" && value) {
      next.fontFamily = value.split(",")[0].replace(/["']/g, "").trim();
    }
    if (key === "font-size" && value) {
      const size = fontSizePx(value);
      if (size) {
        next.fontSizePx = size;
      }
    }
    if (key === "font-weight" && (value === "bold" || Number(value) >= 600)) {
      next.bold = true;
    }
    if (key === "font-style" && value === "italic") {
      next.italic = true;
    }
    if (key === "text-decoration" || key === "text-decoration-line") {
      if (value.includes("underline")) {
        next.underline = "single";
      }
      if (value.includes("line-through")) {
        next.strike = "single";
      }
    }
  }
  return next;
}

function fontSizePx(value: string): number | undefined {
  const size = Number.parseFloat(value);
  if (!Number.isFinite(size) || size <= 0) {
    return undefined;
  }
  if (value.endsWith("pt")) {
    return ptToPx(size);
  }
  if (value.endsWith("px") || /^\d+(\.\d+)?$/.test(value)) {
    return size;
  }
  return undefined;
}

function mergeRuns(runs: ClipboardRun[]): ClipboardRun[] {
  const merged: ClipboardRun[] = [];
  for (const run of runs) {
    const prev = merged.at(-1);
    if (prev && JSON.stringify(prev.style) === JSON.stringify(run.style)) {
      prev.text += run.text;
    } else {
      merged.push({ text: run.text, style: { ...run.style } });
    }
  }
  return merged;
}

function isBlock(tag: string): boolean {
  return ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TABLE", "BLOCKQUOTE"].includes(tag);
}

function joinText(paragraphs: ClipboardParagraph[]): string {
  return paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n");
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeText(text).replace(/"/g, "&quot;");
}
