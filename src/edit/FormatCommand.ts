import { ptToPx } from "../shared/units";
import type { Paragraph } from "../model/block/Paragraph";
import type { Block } from "../model/block/Block";
import type { Document } from "../model/document/Document";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { StyleSheet } from "../model/style/StyleSheet";
import { mergeRunStyle, type RunStyle } from "../model/style/RunStyle";
import { headingLevelFromName } from "../model/toc/Toc";
import { coverFlow, formatRanges } from "../selection/MainWalk";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import { storyEquals, type StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

export type FormatAction =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "fontFamily"; value: string }
  | { type: "fontSizePt"; value: number }
  | { type: "color"; value: string }
  | { type: "highlight"; value: string }
  | { type: "align"; value: string }
  | { type: "superscript" }
  | { type: "subscript" }
  | { type: "style"; value: "normal" | "heading1" | "heading2" | "heading3" }
  | { type: "indent"; value: "none" | "first2" | "hang2" | "left2" | "right2" }
  | { type: "lineSpacing"; value: "1" | "1.5" | "2" | "exact28" }
  | { type: "paraGap"; value: "0" | "before6" | "after6" | "both6" }
  | { type: "clear" };

type RunSnap = {
  story: StoryRef;
  document: Document;
  node: LinkedNode<Word>;
  before: Block | null;
  after: Block | null;
};
type ParaSnap = { story: StoryRef; paragraph: Paragraph; before: ParagraphAttrs; after: ParagraphAttrs };

export class FormatCommand implements EditCommand {
  private played = false;
  private story: StoryRef | null = null;
  private prevPending?: RunStyle;
  private nextPending?: RunStyle;
  private runSnaps: RunSnap[] = [];
  private paraSnaps: ParaSnap[] = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly action: FormatAction,
  ) {}

  do(): void {
    if (this.played) {
      this.restore("after");
      return;
    }
    this.played = true;
    const ranges = this.editRanges();
    if (!ranges.length) {
      return;
    }
    const paragraphAction =
      this.action.type === "align" ||
      this.action.type === "indent" ||
      this.action.type === "lineSpacing" ||
      this.action.type === "paraGap";
    if (paragraphAction || this.action.type === "style") {
      for (const range of ranges) {
        this.applyBlock(range, paragraphAction);
      }
      return;
    }
    const patch = this.runPatch(ranges[0]);
    if (ranges.length === 1 && ranges[0].collapsed()) {
      this.prevPending = this.ctx.pendingRunStyle?.();
      this.nextPending = mergeRunStyle(this.prevPending, patch);
      this.ctx.setPendingRunStyle?.(this.nextPending);
    }
    let styled = false;
    for (const range of ranges) {
      const document = this.ctx.documentOf(range.story);
      if (!document) {
        continue;
      }
      const target = ranges.length === 1 && range.collapsed() ? expandToRun(range) : range;
      const before = this.ctx.mutator.applyRunStyle(document, target, patch);
      this.runSnaps.push(
        ...before.map((item) => ({
          story: range.story,
          document,
          node: item.node,
          before: item.block,
          after: item.node.data.block,
        })),
      );
      if (before.length) {
        styled = true;
        this.story = range.story;
        this.commit(paragraphsOf(this.runSnaps.filter((item) => item.story === range.story && item.document === document)));
      }
    }
    if (!styled && ranges.length === 1 && ranges[0].collapsed()) {
      this.ctx.afterEdit(new EditImpact(ranges[0].story, []));
    }
  }

  private editRanges(): SelRange[] {
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

  private applyBlock(range: SelRange, paragraphOnly: boolean): void {
    const document = this.ctx.documentOf(range.story);
    if (!document) {
      return;
    }
    this.story = range.story;
    if (paragraphOnly) {
      const alignPatch =
        this.action.type === "align"
          ? { textAlign: this.action.value }
          : this.action.type === "indent" || this.action.type === "lineSpacing" || this.action.type === "paraGap"
            ? paragraphPatch(this.action)
            : {};
      const before = this.ctx.mutator.applyParagraphAttrs(document, range, alignPatch);
      this.paraSnaps.push(
        ...before.map((item) => ({
          story: range.story,
          paragraph: item.paragraph,
          before: item.attrs,
          after: { ...item.paragraph.attrs },
        })),
      );
      this.commit(before.map((item) => item.paragraph));
      return;
    }
    if (this.action.type !== "style") {
      return;
    }
    const spec = resolveParagraphStyle(document, this.action.value);
    const before = this.ctx.mutator.applyParagraphAttrs(document, range, {
      styleId: spec.styleId,
      outlineLevel: spec.outlineLevel,
    });
    this.paraSnaps.push(
      ...before.map((item) => ({
        story: range.story,
        paragraph: item.paragraph,
        before: item.attrs,
        after: { ...item.paragraph.attrs },
      })),
    );
    const styled = this.ctx.mutator.applyRunStyle(document, coverParagraphs(range), spec.run);
    this.runSnaps.push(
      ...styled.map((item) => ({
        story: range.story,
        document,
        node: item.node,
        before: item.block,
        after: item.node.data.block,
      })),
    );
    this.commit(before.map((item) => item.paragraph));
  }

  undo(): void {
    this.restore("before");
  }

  private restore(side: "before" | "after"): void {
    const impacts: { story: StoryRef; paragraphs: Paragraph[] }[] = [];
    const push = (story: StoryRef, paragraphs: Paragraph[]): void => {
      const found = impacts.find((item) => storyEquals(item.story, story));
      if (found) {
        found.paragraphs.push(...paragraphs);
        return;
      }
      impacts.push({ story, paragraphs: [...paragraphs] });
    };
    const groups = new Map<Document, RunSnap[]>();
    for (const snap of this.runSnaps) {
      const list = groups.get(snap.document) ?? [];
      list.push(snap);
      groups.set(snap.document, list);
    }
    for (const [document, snaps] of groups) {
      const dirty = this.ctx.mutator.restoreRunStyle(
        document,
        snaps.map((item) => ({ node: item.node, block: item[side] })),
      );
      if (snaps[0]) {
        push(snaps[0].story, dirty);
      }
    }
    if (this.paraSnaps.length) {
      this.ctx.mutator.restoreParagraphAttrs(
        this.paraSnaps.map((item) => ({ paragraph: item.paragraph, attrs: item[side] })),
      );
      for (const snap of this.paraSnaps) {
        push(snap.story, [snap.paragraph]);
      }
    }
    if (this.nextPending !== undefined || this.prevPending !== undefined) {
      this.ctx.setPendingRunStyle?.(side === "after" ? this.nextPending : this.prevPending);
    }
    if (!impacts.length && this.story) {
      impacts.push({ story: this.story, paragraphs: [] });
    }
    for (const impact of impacts) {
      this.ctx.relayout.apply(new EditImpact(impact.story, impact.paragraphs));
      this.ctx.afterEdit(new EditImpact(impact.story, impact.paragraphs));
    }
  }

  private commit(dirty: Paragraph[]): void {
    if (!this.story) {
      return;
    }
    const impact = new EditImpact(this.story, dirty);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }

  private runPatch(range: SelRange): Partial<RunStyle> {
    const current = this.sample(range);
    switch (this.action.type) {
      case "bold":
        return { bold: !current.bold };
      case "italic":
        return { italic: !current.italic };
      case "underline":
        return { underline: current.underline && current.underline !== "none" ? "none" : "single" };
      case "strike":
        return { strike: current.strike ? undefined : "single" };
      case "superscript":
        return { vertAlign: current.vertAlign === "superscript" ? "baseline" : "superscript" };
      case "subscript":
        return { vertAlign: current.vertAlign === "subscript" ? "baseline" : "subscript" };
      case "fontFamily":
        return {
          fontFamily: this.action.value,
          wAscii: this.action.value,
          wEastAsia: this.action.value,
          wHAnsi: this.action.value,
        };
      case "fontSizePt":
        return { fontSizePx: ptToPx(this.action.value), fontSizeHalfPoint: this.action.value * 2 };
      case "color":
        return { color: this.action.value };
      case "highlight":
        return this.action.value === "none"
          ? { backgroundColor: undefined, highlight: undefined }
          : { backgroundColor: this.action.value, highlight: this.action.value };
      case "clear":
        return {
          bold: false,
          italic: false,
          underline: "none",
          strike: undefined,
          color: "#111111",
          backgroundColor: undefined,
          highlight: undefined,
          vertAlign: "baseline",
        };
      default:
        return {};
    }
  }

  private sample(range: SelRange): RunStyle {
    const pending = this.ctx.pendingRunStyle?.();
    const node = range.start.after ? range.start.node : (range.start.node?.pre ?? range.start.node);
    return mergeRunStyle(node?.data.getStyle(), pending);
  }
}

function expandToRun(range: SelRange): SelRange {
  const pos = range.start;
  const node = pos.after ? pos.node : (pos.node?.pre ?? pos.node);
  if (!node || node.data.kind !== "text" || node.data.isEnterChar()) {
    return range;
  }
  const block = node.data.block;
  let start = node;
  while (start.pre && start.pre.data.block === block && !start.pre.data.isEnterChar()) {
    start = start.pre;
  }
  let end = node;
  while (end.next && end.next.data.block === block && !end.next.data.isEnterChar()) {
    end = end.next;
  }
  return new SelRange(range.story, new CaretPos(range.story, start, false), new CaretPos(range.story, end, true));
}

function paragraphsOf(snaps: RunSnap[]): Paragraph[] {
  const dirty: Paragraph[] = [];
  for (const item of snaps) {
    const paragraph = item.node.data.paragraph;
    if (paragraph && !dirty.includes(paragraph)) {
      dirty.push(paragraph);
    }
  }
  return dirty;
}

export function paragraphPatch(
  action: Extract<FormatAction, { type: "indent" | "lineSpacing" | "paraGap" }>,
): Partial<ParagraphAttrs> {
  if (action.type === "indent") {
    const clearFirst = {
      firstLineChars: undefined,
      firstLineTwip: undefined,
      hangingChars: undefined,
      hangingTwip: undefined,
    };
    if (action.value === "first2") {
      return { ...clearFirst, firstLineChars: 200, leftChars: undefined };
    }
    if (action.value === "hang2") {
      return { ...clearFirst, leftChars: 200, hangingChars: 200, leftTwip: undefined };
    }
    if (action.value === "left2") {
      return { ...clearFirst, leftChars: 200, leftTwip: undefined };
    }
    if (action.value === "right2") {
      return { rightChars: 200, rightTwip: undefined };
    }
    return { ...clearFirst, leftChars: undefined, rightChars: undefined, leftTwip: undefined, rightTwip: undefined };
  }
  if (action.type === "lineSpacing") {
    if (action.value === "1.5") {
      return { line: "360", lineRule: "auto" };
    }
    if (action.value === "2") {
      return { line: "480", lineRule: "auto" };
    }
    if (action.value === "exact28") {
      return { line: "560", lineRule: "exact" };
    }
    return { line: "240", lineRule: "auto" };
  }
  const clear = { beforeLines: undefined, afterLines: undefined, beforeAutospacing: "0", afterAutospacing: "0" };
  if (action.value === "before6") {
    return { ...clear, before: "120", after: "0" };
  }
  if (action.value === "after6") {
    return { ...clear, before: "0", after: "120" };
  }
  if (action.value === "both6") {
    return { ...clear, before: "120", after: "120" };
  }
  return { ...clear, before: "0", after: "0" };
}

export function indentPreset(attrs: ParagraphAttrs | undefined): "none" | "first2" | "hang2" | "left2" | "right2" {
  if ((attrs?.hangingChars ?? 0) > 0 || (attrs?.hangingTwip ?? 0) > 0) {
    return "hang2";
  }
  if ((attrs?.firstLineChars ?? 0) > 0 || (attrs?.firstLineTwip ?? 0) > 0) {
    return "first2";
  }
  if ((attrs?.leftChars ?? 0) > 0 || (attrs?.leftTwip ?? 0) > 0) {
    return "left2";
  }
  if ((attrs?.rightChars ?? 0) > 0 || (attrs?.rightTwip ?? 0) > 0) {
    return "right2";
  }
  return "none";
}

export function spacingPreset(attrs: ParagraphAttrs | undefined): "1" | "1.5" | "2" | "exact28" {
  if (attrs?.lineRule === "exact") {
    return "exact28";
  }
  const line = Number(attrs?.line);
  if (line >= 440) {
    return "2";
  }
  if (line >= 300) {
    return "1.5";
  }
  return "1";
}

export function gapPreset(attrs: ParagraphAttrs | undefined): "0" | "before6" | "after6" | "both6" {
  const before = Number(attrs?.before) > 0 || Number(attrs?.beforeLines) > 0;
  const after = Number(attrs?.after) > 0 || Number(attrs?.afterLines) > 0;
  if (before && after) {
    return "both6";
  }
  if (before) {
    return "before6";
  }
  if (after) {
    return "after6";
  }
  return "0";
}

const PARAGRAPH_STYLES = {
  normal: { id: "Normal", name: "Normal", size: 12, bold: false, level: undefined as number | undefined, color: "#111111" },
  heading1: { id: "Heading1", name: "heading 1", size: 18, bold: true, level: 1, color: "#1F4E79" },
  heading2: { id: "Heading2", name: "heading 2", size: 16, bold: true, level: 2, color: "#2E75B6" },
  heading3: { id: "Heading3", name: "heading 3", size: 14, bold: true, level: 3, color: "#5B9BD5" },
} as const;

function resolveParagraphStyle(document: Document, value: keyof typeof PARAGRAPH_STYLES): {
  styleId: string;
  outlineLevel?: number;
  run: Partial<RunStyle>;
} {
  const preset = PARAGRAPH_STYLES[value];
  const sheet = document.styles;
  let found = findParagraphStyle(sheet, preset);
  if (!found) {
    sheet.add({
      styleId: preset.id,
      name: preset.name,
      type: "paragraph",
      paragraphAttrs: preset.level ? { outlineLevel: preset.level } : {},
      runStyle: {
        bold: preset.bold,
        fontSizePx: ptToPx(preset.size),
        fontSizeHalfPoint: preset.size * 2,
        color: preset.color,
      },
    });
    found = sheet.get(preset.id);
  }
  const resolved = found ? sheet.getResolved(found.styleId).runStyle : {};
  const run: Partial<RunStyle> = { ...resolved };
  if (run.bold == null) {
    run.bold = preset.bold;
  }
  if (run.fontSizePx == null) {
    run.fontSizePx = ptToPx(preset.size);
    run.fontSizeHalfPoint = preset.size * 2;
  }
  if (!run.color) {
    run.color = preset.color;
  }
  return {
    styleId: found?.styleId ?? preset.id,
    outlineLevel: preset.level,
    run,
  };
}

function findParagraphStyle(
  sheet: StyleSheet,
  preset: { id: string; name: string; level?: number },
): ReturnType<StyleSheet["get"]> {
  const direct = sheet.get(preset.id);
  if (direct) {
    return direct;
  }
  return sheet.list().find((style) => {
    if (style.type === "character") {
      return false;
    }
    if (preset.level) {
      return headingLevelFromName(style.name) === preset.level || headingLevelFromName(style.styleId) === preset.level;
    }
    return style.styleId === "Normal" || style.name?.toLowerCase() === "normal";
  });
}

function coverParagraphs(range: SelRange): SelRange {
  const start = edgeOf(range.start.node, "pre");
  const end = edgeOf(range.end.node, "next");
  if (!start || !end) {
    return range;
  }
  return new SelRange(range.story, new CaretPos(range.story, start, false), new CaretPos(range.story, end, true));
}

function edgeOf(node: LinkedNode<Word> | null, dir: "pre" | "next"): LinkedNode<Word> | null {
  if (!node) {
    return null;
  }
  const paragraph = node.data.paragraph;
  let current = node;
  while (current[dir]?.data.paragraph === paragraph) {
    const next = current[dir];
    if (!next) {
      break;
    }
    current = next;
  }
  return current;
}

export function stylePreset(attrs: ParagraphAttrs | undefined): "normal" | "heading1" | "heading2" | "heading3" {
  const level = attrs?.outlineLevel ?? headingLevelFromName(attrs?.styleId);
  if (level === 1) {
    return "heading1";
  }
  if (level === 2) {
    return "heading2";
  }
  if (level === 3) {
    return "heading3";
  }
  return "normal";
}
