import type { Block } from "../block/Block";
import type { Paragraph } from "../block/Paragraph";
import type { Document } from "../document/Document";
import { fieldValues, formatPageNumber, type FieldValues, type PageLabel } from "../document/PageLabel";
import type { Line } from "../line/Line";
import type { StyleSheet } from "../style/StyleSheet";
import { fieldArgs } from "./TextLink";

export interface FieldView {
  values: FieldValues;
  text: Map<Block, string>;
  showMarks?: boolean;
}

export function buildFieldView(document: Document, lines: Line[], labels: PageLabel[], pageHeight: number, now = new Date()): FieldView {
  const values = labels[0] ? fieldValues(labels[0]) : { PAGE: "1", NUMPAGES: "1", SECTIONPAGES: "1" };
  const paragraphs = collectParagraphs(document);
  const bookmarkText = new Map<string, string>();
  const bookmarkPage = new Map<string, string>();
  for (const paragraph of paragraphs) {
    const page = pageOf(paragraph, lines, labels, pageHeight);
    for (const name of paragraph.bookmarks) {
      bookmarkText.set(name, paragraph.getFullText());
      if (page) {
        bookmarkPage.set(name, page);
      }
    }
  }
  const seq = sequenceNumbers(paragraphs);
  const styleRef = styleReferences(paragraphs, document.styles);
  const text = new Map<Block, string>();
  for (const paragraph of paragraphs) {
    for (const block of paragraph.blocks) {
      if (!block.field || block.field === "HYPERLINK") {
        continue;
      }
      const shown = resolveField(block, {
        props: document.props,
        fileName: document.fileName,
        now,
        bookmarkText,
        bookmarkPage,
        seq,
        styleRef,
      });
      if (shown != null) {
        text.set(block, shown);
      }
    }
  }
  return { values, text };
}

interface FieldEnv {
  props: Document["props"];
  fileName?: string;
  now: Date;
  bookmarkText: Map<string, string>;
  bookmarkPage: Map<string, string>;
  seq: Map<Block, string>;
  styleRef: Map<Block, string>;
}

function resolveField(block: Block, env: FieldEnv): string | undefined {
  const instr = block.fieldInstr ?? block.field ?? "";
  const parsed = fieldArgs(instr);
  switch (block.field) {
    case "PAGE":
    case "NUMPAGES":
    case "SECTIONPAGES":
      return undefined;
    case "DATE":
    case "TIME":
      return formatDate(env.now, parsed.switches.get("@"), block.field);
    case "CREATEDATE":
      return formatDate(env.props.created ?? env.now, parsed.switches.get("@"), "DATE");
    case "SAVEDATE":
      return formatDate(env.props.modified ?? env.now, parsed.switches.get("@"), "DATE");
    case "AUTHOR":
      return env.props.creator || block.text;
    case "TITLE":
      return env.props.title || block.text;
    case "FILENAME":
      return env.fileName || block.text;
    case "REF":
      return env.bookmarkText.get(parsed.args[0] ?? "") ?? block.text;
    case "PAGEREF":
      return env.bookmarkPage.get(parsed.args[0] ?? "") ?? block.text;
    case "STYLEREF":
      return env.styleRef.get(block) ?? block.text;
    case "SEQ":
      return env.seq.get(block) ?? block.text;
    default:
      return undefined;
  }
}

function formatDate(date: Date, picture: string | undefined, kind: string): string {
  const pattern = picture || (kind === "TIME" ? "HH:mm" : "yyyy-MM-dd");
  const minutes = /h|s/i.test(pattern);
  return pattern.replace(/'(?:[^']*)'|yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s/g, (token) => {
    if (token.startsWith("'")) {
      return token.slice(1, -1);
    }
    const month = date.getMonth() + 1;
    const minute = date.getMinutes();
    switch (token) {
      case "yyyy":
        return String(date.getFullYear());
      case "yy":
        return String(date.getFullYear()).slice(-2);
      case "MM":
        return pad(month);
      case "M":
        return String(month);
      case "dd":
        return pad(date.getDate());
      case "d":
        return String(date.getDate());
      case "HH":
        return pad(date.getHours());
      case "H":
        return String(date.getHours());
      case "hh":
        return pad(date.getHours() % 12 || 12);
      case "h":
        return String(date.getHours() % 12 || 12);
      case "mm":
        return pad(minutes ? minute : month);
      case "m":
        return String(minutes ? minute : month);
      case "ss":
        return pad(date.getSeconds());
      case "s":
        return String(date.getSeconds());
      default:
        return token;
    }
  });
}

function sequenceNumbers(paragraphs: Paragraph[]): Map<Block, string> {
  const counts = new Map<string, number>();
  const result = new Map<Block, string>();
  for (const paragraph of paragraphs) {
    for (const block of paragraph.blocks) {
      if (block.field !== "SEQ") {
        continue;
      }
      const name = fieldArgs(block.fieldInstr ?? "").args[0] ?? "";
      const next = (counts.get(name) ?? 0) + 1;
      counts.set(name, next);
      result.set(block, String(next));
    }
  }
  return result;
}

function styleReferences(paragraphs: Paragraph[], styles: StyleSheet): Map<Block, string> {
  const result = new Map<Block, string>();
  paragraphs.forEach((paragraph, index) => {
    for (const block of paragraph.blocks) {
      if (block.field !== "STYLEREF") {
        continue;
      }
      const wanted = fieldArgs(block.fieldInstr ?? "").args[0] ?? "";
      for (let cursor = index; cursor >= 0; cursor -= 1) {
        if (styleMatches(paragraphs[cursor], styles, wanted)) {
          result.set(block, paragraphs[cursor].getFullText());
          break;
        }
      }
    }
  });
  return result;
}

function styleMatches(paragraph: Paragraph, styles: StyleSheet, wanted: string): boolean {
  const key = wanted.trim().toLowerCase();
  if (!key) {
    return false;
  }
  const styleId = paragraph.attrs.styleId ?? "";
  const name = styleId ? (styles.get(styleId)?.name ?? "") : "";
  return styleId.toLowerCase() === key || name.toLowerCase() === key;
}

function pageOf(paragraph: Paragraph, lines: Line[], labels: PageLabel[], pageHeight: number): string | undefined {
  const line = lines.find((item) => item.paragraph === paragraph && item.type !== "page");
  if (!line || pageHeight <= 0) {
    return undefined;
  }
  const index = Math.min(labels.length - 1, Math.max(0, Math.floor(line.top / pageHeight)));
  const label = labels[index];
  return label ? formatPageNumber(label.pageNumber, label.fmt) : undefined;
}

function collectParagraphs(document: Document): Paragraph[] {
  const found: Paragraph[] = [];
  const visit = (story: Document): void => {
    story.paragraphs.each((node) => {
      found.push(node.data);
      const table = node.data.table;
      if (!table) {
        return;
      }
      for (const row of table.rows) {
        for (const cell of row.cells) {
          visit(cell.document);
        }
      }
    });
  };
  visit(document);
  return found;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
