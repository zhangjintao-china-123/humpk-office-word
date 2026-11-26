import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import type { Word } from "../model/inline/Word";
import type { LinkedNode } from "../model/list/LinkedList";
import { isAsciiDigit, isLatinLetter } from "../layout/classify/CharClass";
import { coverFlow, formatRanges } from "../selection/MainWalk";
import type { CaretPos } from "../selection/CaretPos";
import type { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

export type CaseMode =
  | "sentence"
  | "lower"
  | "upper"
  | "title"
  | "toggle"
  | "halfwidth"
  | "fullwidth";

interface CharSnap {
  story: StoryRef;
  document: Document;
  node: LinkedNode<Word>;
  before: string;
  after: string;
}

export class ChangeCaseCommand implements EditCommand {
  private played = false;
  private snaps: CharSnap[] = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly mode: CaseMode,
  ) {}

  do(): void {
    if (this.played) {
      this.applySide("after");
      return;
    }
    this.played = true;
    const ranges = this.targetRanges();
    if (!ranges.length) {
      return;
    }

    const perDoc = new Map<Document, { story: StoryRef; updates: { node: LinkedNode<Word>; char: string }[] }>();
    const seen = new Set<LinkedNode<Word>>();

    for (const range of ranges) {
      const document = this.ctx.documentOf(range.story);
      if (!document) {
        continue;
      }
      const targetNodes =
        ranges.length === 1 && range.collapsed() ? wordNodesAtCaret(range.start) : textNodesInRange(range);
      if (!targetNodes.length) {
        continue;
      }

      const byPara = groupByParagraph(targetNodes);
      let entry = perDoc.get(document);
      if (!entry) {
        entry = { story: range.story, updates: [] };
        perDoc.set(document, entry);
      }

      for (const [paragraph, selected] of byPara) {
        const paraNodes = paragraphTextNodes(document, paragraph);
        const targetSet = new Set(selected);
        const nextChars = computeParagraphCase(paraNodes, targetSet, this.mode);
        for (let i = 0; i < paraNodes.length; i += 1) {
          const node = paraNodes[i];
          if (!targetSet.has(node) || seen.has(node)) {
            continue;
          }
          const nextChar = nextChars[i];
          const prevChar = node.data.char;
          if (nextChar === prevChar || nextChar.length !== 1) {
            continue;
          }
          seen.add(node);
          this.snaps.push({
            story: range.story,
            document,
            node,
            before: prevChar,
            after: nextChar,
          });
          entry.updates.push({ node, char: nextChar });
        }
      }
    }

    for (const [document, entry] of perDoc) {
      if (!entry.updates.length) {
        continue;
      }
      const dirty = this.ctx.mutator.replaceWordChars(document, entry.updates);
      const impact = new EditImpact(entry.story, dirty);
      this.ctx.relayout.apply(impact);
      this.ctx.afterEdit(impact);
    }
  }

  undo(): void {
    this.applySide("before");
  }

  private applySide(side: "before" | "after"): void {
    if (!this.snaps.length) {
      return;
    }
    const groups = new Map<Document, { story: StoryRef; updates: { node: LinkedNode<Word>; char: string }[] }>();
    for (const snap of this.snaps) {
      let group = groups.get(snap.document);
      if (!group) {
        group = { story: snap.story, updates: [] };
        groups.set(snap.document, group);
      }
      group.updates.push({ node: snap.node, char: snap[side] });
    }
    for (const [document, group] of groups) {
      const dirty = this.ctx.mutator.replaceWordChars(document, group.updates);
      const impact = new EditImpact(group.story, dirty);
      this.ctx.relayout.apply(impact);
      this.ctx.afterEdit(impact);
    }
  }

  private targetRanges(): SelRange[] {
    const flow = this.ctx.selection.flow;
    if (flow && !flow.anchor.equals(flow.focus)) {
      const owner = this.ctx.flowOwner?.(flow.anchor) ?? this.ctx.flowOwner?.(flow.focus);
      if (owner) {
        return formatRanges(coverFlow(owner.document, owner.story, flow.anchor, flow.focus));
      }
    }
    const range = this.ctx.selection.primaryRange()?.normalized();
    return range ? [range] : [];
  }
}

/** 对字符串按指定大小写/半全角模式转换（可用于单测或纯文本预览）。 */
export function transformCaseText(text: string, mode: CaseMode): string {
  const chars = [...text];
  return transformChars(chars, new Set(chars.map((_, i) => i)), mode).join("");
}

function computeParagraphCase(
  paraNodes: LinkedNode<Word>[],
  targets: Set<LinkedNode<Word>>,
  mode: CaseMode,
): string[] {
  const chars = paraNodes.map((node) => node.data.char);
  const indices = new Set<number>();
  for (let i = 0; i < paraNodes.length; i += 1) {
    if (targets.has(paraNodes[i])) {
      indices.add(i);
    }
  }
  return transformChars(chars, indices, mode);
}

function transformChars(chars: string[], targetIndices: Set<number>, mode: CaseMode): string[] {
  const result = chars.slice();
  if (mode === "lower") {
    for (const i of targetIndices) {
      result[i] = chars[i].toLowerCase();
    }
    return result;
  }
  if (mode === "upper") {
    for (const i of targetIndices) {
      result[i] = chars[i].toUpperCase();
    }
    return result;
  }
  if (mode === "toggle") {
    for (const i of targetIndices) {
      result[i] = toggleCharCase(chars[i]);
    }
    return result;
  }
  if (mode === "halfwidth") {
    for (const i of targetIndices) {
      result[i] = toHalfwidthChar(chars[i]);
    }
    return result;
  }
  if (mode === "fullwidth") {
    for (const i of targetIndices) {
      result[i] = toFullwidthChar(chars[i]);
    }
    return result;
  }
  if (mode === "title") {
    for (const i of targetIndices) {
      const ch = chars[i];
      if (!isCasedLetter(ch)) {
        continue;
      }
      const prev = i > 0 ? chars[i - 1] : "";
      const prevPrev = i > 1 ? chars[i - 2] : "";
      const continuesWord =
        isWordLetterOrDigit(prev) || ((prev === "'" || prev === "’") && isWordLetterOrDigit(prevPrev));
      result[i] = continuesWord ? ch.toLowerCase() : ch.toUpperCase();
    }
    return result;
  }

  // sentence: 按句子首字母大写，句内其余字母小写
  let sentenceStart = true;
  let pendingEnd = false;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === "\n" || ch === "\r") {
      sentenceStart = true;
      pendingEnd = false;
      continue;
    }
    if (isSentenceTerminator(ch)) {
      const prev = i > 0 ? chars[i - 1] : "";
      const next = i + 1 < chars.length ? chars[i + 1] : "";
      const isDecimal = ch === "." && isDigit(prev) && isDigit(next);
      if (!isDecimal) {
        if (ch === "。" || ch === "！" || ch === "？") {
          sentenceStart = true;
          pendingEnd = false;
        } else {
          pendingEnd = true;
        }
      }
      continue;
    }
    if (pendingEnd) {
      if (isWhitespace(ch) || isClosingOrOpeningBracket(ch)) {
        sentenceStart = true;
        pendingEnd = false;
        continue;
      }
      pendingEnd = false;
    }
    if (sentenceStart && (isWhitespace(ch) || isOpeningWrapper(ch))) {
      continue;
    }
    if (isCasedLetter(ch)) {
      if (targetIndices.has(i)) {
        result[i] = sentenceStart ? ch.toUpperCase() : ch.toLowerCase();
      }
      sentenceStart = false;
      continue;
    }
    if (isDigit(ch)) {
      sentenceStart = false;
    }
  }
  return result;
}

function toggleCharCase(ch: string): string {
  const lower = ch.toLowerCase();
  const upper = ch.toUpperCase();
  if (lower === upper) {
    return ch;
  }
  return ch === lower ? upper : lower;
}

function toHalfwidthChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code === 0x3000) {
    return " ";
  }
  if (code >= 0xff01 && code <= 0xff5e) {
    return String.fromCharCode(code - 0xfee0);
  }
  return ch;
}

function toFullwidthChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code === 0x0020) {
    return "\u3000";
  }
  if (code >= 0x0021 && code <= 0x007e) {
    return String.fromCharCode(code + 0xfee0);
  }
  return ch;
}

function isCasedLetter(ch: string): boolean {
  return ch.length > 0 && ch.toLowerCase() !== ch.toUpperCase();
}

function isWordLetterOrDigit(ch: string): boolean {
  if (!ch) {
    return false;
  }
  const code = ch.codePointAt(0) ?? 0;
  return isLatinLetter(ch, code) || isAsciiDigit(ch, code) || isFullwidthAlnum(code) || isCasedLetter(ch);
}

function isFullwidthAlnum(code: number): boolean {
  return (code >= 0xff10 && code <= 0xff19) || (code >= 0xff21 && code <= 0xff3a) || (code >= 0xff41 && code <= 0xff5a);
}

function isSentenceTerminator(ch: string): boolean {
  return ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "！" || ch === "？";
}

function isDigit(ch: string): boolean {
  if (!ch) {
    return false;
  }
  const code = ch.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 0xff10 && code <= 0xff19);
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\u00a0" || ch === "\u3000";
}

function isOpeningWrapper(ch: string): boolean {
  return ch === '"' || ch === "'" || ch === "“" || ch === "‘" || ch === "(" || ch === "[" || ch === "（" || ch === "【" || ch === "「" || ch === "『" || ch === "《";
}

function isClosingOrOpeningBracket(ch: string): boolean {
  return isOpeningWrapper(ch) || ch === '"' || ch === "'" || ch === "”" || ch === "’" || ch === ")" || ch === "]" || ch === "）" || ch === "】" || ch === "」" || ch === "』" || ch === "》";
}

function textNodesInRange(range: SelRange): LinkedNode<Word>[] {
  const normalized = range.normalized();
  if (normalized.collapsed()) {
    return [];
  }
  const from = normalized.start.after ? (normalized.start.node?.next ?? null) : normalized.start.node;
  const to = normalized.end.after ? normalized.end.node : (normalized.end.node?.pre ?? null);
  const nodes: LinkedNode<Word>[] = [];
  let node = from;
  while (node) {
    if (node.data.kind === "text" && !node.data.isEnterChar() && node.data.paragraph) {
      nodes.push(node);
    }
    if (node === to) {
      break;
    }
    node = node.next;
  }
  return nodes;
}

function wordNodesAtCaret(pos: CaretPos): LinkedNode<Word>[] {
  const node = pos.node;
  if (!node) {
    return [];
  }
  const para = node.data.paragraph;
  if (!para) {
    return [];
  }
  let anchor: LinkedNode<Word> | null = null;
  if (pos.after) {
    if (isConvertibleCaretChar(node.data)) {
      anchor = node;
    }
  } else if (isConvertibleCaretChar(node.data)) {
    anchor = node;
  } else if (node.pre && node.pre.data.paragraph === para && isConvertibleCaretChar(node.pre.data)) {
    anchor = node.pre;
  }
  if (!anchor) {
    return [];
  }
  let start = anchor;
  while (start.pre && start.pre.data.paragraph === para && isConvertibleCaretChar(start.pre.data)) {
    start = start.pre;
  }
  let end = anchor;
  while (end.next && end.next.data.paragraph === para && isConvertibleCaretChar(end.next.data)) {
    end = end.next;
  }
  const result: LinkedNode<Word>[] = [];
  let cursor: LinkedNode<Word> | null = start;
  while (cursor) {
    result.push(cursor);
    if (cursor === end) {
      break;
    }
    cursor = cursor.next;
  }
  return result;
}

function isConvertibleCaretChar(word: Word): boolean {
  if (word.kind !== "text" || word.isEnterChar()) {
    return false;
  }
  const ch = word.char;
  const code = word.intChar || ch.charCodeAt(0);
  return isLatinLetter(ch, code) || isAsciiDigit(ch, code) || (code >= 0xff01 && code <= 0xff5e) || ch === "'" || ch === "’";
}

function groupByParagraph(nodes: LinkedNode<Word>[]): Map<Paragraph, LinkedNode<Word>[]> {
  const map = new Map<Paragraph, LinkedNode<Word>[]>();
  for (const node of nodes) {
    const paragraph = node.data.paragraph;
    if (!paragraph) {
      continue;
    }
    const list = map.get(paragraph) ?? [];
    list.push(node);
    map.set(paragraph, list);
  }
  return map;
}

function paragraphTextNodes(document: Document, paragraph: Paragraph): LinkedNode<Word>[] {
  const list: LinkedNode<Word>[] = [];
  let node = document.words.head;
  while (node) {
    if (node.data.paragraph === paragraph && node.data.kind === "text" && !node.data.isEnterChar()) {
      list.push(node);
    }
    node = node.next;
  }
  return list;
}
