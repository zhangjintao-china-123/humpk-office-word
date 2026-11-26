import { ptToPx } from "../shared/units";
import type { Paragraph } from "../model/block/Paragraph";
import type { Block } from "../model/block/Block";
import type { Document } from "../model/document/Document";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { StyleDefinition, StyleSheet } from "../model/style/StyleSheet";
import { ensureGalleryStyle, STYLE_GALLERY, type GalleryStyleKey } from "../model/style/StyleGallery";
import { mergeRunStyle, type RunStyle } from "../model/style/RunStyle";
import { coverFlow, formatRanges } from "../selection/MainWalk";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import { storyEquals, type StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import { renumberStory } from "./OutlineNumbering";

export type FormatAction =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "fontFamily"; value: string }
  | { type: "fontSizePt"; value: number }
  | { type: "color"; value: string }
  | { type: "highlight"; value: string }
  | { type: "shading" }
  | { type: "align"; value: string }
  | { type: "superscript" }
  | { type: "subscript" }
  | { type: "style"; value: GalleryStyleKey }
  | { type: "indent"; value: "none" | "first2" | "hang2" | "left2" | "right2" }
  | { type: "indentStep"; value: 1 | -1 }
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
type ParagraphFormat = { attrs: ParagraphAttrs; inherited?: RunStyle };
type ParaSnap = { story: StoryRef; paragraph: Paragraph; before: ParagraphFormat; after: ParagraphFormat };

export class FormatCommand implements EditCommand {
  private played = false;
  private story: StoryRef | null = null;
  private prevPending?: RunStyle;
  private nextPending?: RunStyle;
  private pendingChanged = false;
  private runSnaps: RunSnap[] = [];
  private paraSnaps: ParaSnap[] = [];
  private renumber = new Map<Document, StoryRef>();

  constructor(
    private readonly ctx: EditContext,
    private readonly action: FormatAction,
    private readonly styleSheet?: StyleSheet,
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
      this.action.type === "indentStep" ||
      this.action.type === "lineSpacing" ||
      this.action.type === "paraGap";
    if (paragraphAction) {
      for (const range of ranges) {
        this.applyParagraphFormat(range);
      }
      return;
    }
    if (this.action.type === "style" || this.action.type === "clear") {
      for (const range of ranges) {
        this.applyGalleryFormat(range, this.action);
      }
      for (const [document, story] of this.renumber) {
        const impact = new EditImpact(story, renumberStory(document));
        this.ctx.relayout.apply(impact);
        this.ctx.afterEdit(impact);
      }
      return;
    }
    const patch = this.runPatch(ranges[0]);
    if (ranges.length === 1 && ranges[0].collapsed()) {
      this.updatePending(mergeRunStyle(this.ctx.pendingRunStyle?.(), patch));
    }
    let styled = false;
    for (const range of ranges) {
      const document = this.ctx.documentOf(range.story);
      if (!document) {
        continue;
      }
      const target = ranges.length === 1 && range.collapsed() ? expandToRun(range) : range;
      const before = this.applyRuns(document, target, patch);
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

  private applyParagraphFormat(range: SelRange): void {
    const document = this.ctx.documentOf(range.story);
    if (!document) {
      return;
    }
    this.story = range.story;
    const action = this.action;
    const patch =
      action.type === "align"
        ? { textAlign: action.value }
        : action.type === "indentStep"
          ? (attrs: ParagraphAttrs) => indentStepPatch(attrs, action.value)
          : action.type === "indent" || action.type === "lineSpacing" || action.type === "paraGap"
            ? paragraphPatch(action)
            : {};
    const before = this.ctx.mutator.applyParagraphAttrs(document, range, patch);
    for (const item of before) {
      const inherited = item.paragraph.inheritedRunStyle;
      this.paraSnaps.push({
        story: range.story, paragraph: item.paragraph,
        before: { attrs: item.attrs, inherited },
        after: { attrs: item.paragraph.attrs, inherited },
      });
    }
    this.commit(before.map((item) => item.paragraph));
  }

  private applyGalleryFormat(range: SelRange, action: Extract<FormatAction, { type: "style" | "clear" }>): void {
    const document = this.ctx.documentOf(range.story);
    const spans = this.ctx.mutator.paragraphRanges(range);
    if (!document || !spans.length) {
      return;
    }
    this.story = range.story;
    const sheet = this.styleSheet ?? document.styles;
    const clear = action.type === "clear";
    const key = clear ? "normal" : action.value;
    const preset = STYLE_GALLERY[key];
    const character = preset.type === "character";
    const appliesToParagraph = !character && (!clear || spans.some(coversParagraph));
    const definition = character || appliesToParagraph ? ensureGalleryStyle(sheet, key) : undefined;
    const resolved = definition ? sheet.getResolved(definition.styleId) : undefined;
    const changed = new Map<Paragraph, ParagraphFormat>();
    for (const span of spans) {
      const paragraph = span.start.node!.data.paragraph!;
      if (appliesToParagraph && definition && (!clear || coversParagraph(span))) {
        const outlineLevel = clear ? undefined : preset.paragraphAttrs?.outlineLevel;
        const before = this.applyParagraphStyle(range.story, paragraph, sheet, definition, outlineLevel, clear);
        changed.set(paragraph, before);
        if (paragraph.attrs.numId !== before.attrs.numId || paragraph.attrs.ilvl !== before.attrs.ilvl) {
          const owner = this.ctx.flowOwner?.(span.start);
          this.renumber.set(owner?.document ?? document, owner?.story ?? range.story);
        }
      }
    }

    if (range.collapsed()) {
      if (character && definition) {
        const paragraph = range.start.node!.data.paragraph!;
        const sample = mergeRunStyle(runAtCaret(range)?.data.block?.style, this.ctx.pendingRunStyle?.());
        const reset = Object.fromEntries(Object.keys(sample).map((key) => [key, undefined]));
        this.updatePending({ ...reset, ...applyCharacterStyle(sheet, paragraph, definition.styleId, sample) });
        this.commit([]);
        return;
      }
      this.updatePending(undefined);
    }

    const target = clear
      ? (range.collapsed() && !changed.size ? expandToRun(range) : contentRange(spans))
      : character ? range : contentRange(spans, true);
    const dirty = this.applyRuns(document, target, (word) => {
      const paragraph = word.paragraph;
      if (!paragraph) {
        return undefined;
      }
      const block = word.block;
      const style = block?.style;
      if (clear) {
        return decorateRun(paragraphRunStyle(sheet, paragraph), block);
      }
      if (character && definition) {
        return word.isEnterChar() ? undefined : applyCharacterStyle(sheet, paragraph, definition.styleId, style);
      }
      const previous = changed.get(paragraph);
      if (!previous) {
        return undefined;
      }
      const characterStyleId = style?.characterStyleId;
      const characterRun = characterStyleId ? sheet.getResolved(characterStyleId).runStyle : undefined;
      const oldBase = mergeRunStyle(previous.inherited ?? sheet.docDefaultRun, characterRun);
      const newBase = mergeRunStyle(paragraph.inheritedRunStyle, characterRun);
      const inherited = { ...resolved?.runStyle, ...characterRun };
      return decorateRun({ ...rebaseRunStyle(style, oldBase, newBase, inherited), characterStyleId }, block);
    });
    this.commit([...new Set([...changed.keys(), ...paragraphsOf(dirty)])]);
  }

  private applyParagraphStyle(
    story: StoryRef, paragraph: Paragraph, sheet: StyleSheet, definition: StyleDefinition,
    outlineLevel: number | undefined, clear: boolean,
  ): ParagraphFormat {
    const before = { attrs: paragraph.attrs, inherited: paragraph.inheritedRunStyle };
    const resolved = sheet.getResolved(definition.styleId);
    const { endsSection, sectionBreak, numId, ilvl, titleSerial } = before.attrs;
    const list = !clear && numId && resolved.paragraphAttrs.numId == null ? {
      numId, ilvl, titleSerial,
      leftTwip: before.attrs.leftTwip, leftChars: before.attrs.leftChars,
      hangingTwip: before.attrs.hangingTwip, hangingChars: before.attrs.hangingChars,
    } : undefined;
    const attrs: ParagraphAttrs = {
      snapToGrid: "1", widowControl: "1",
      ...sheet.docDefaults, ...list, ...resolved.paragraphAttrs,
      styleId: definition.styleId, resolvedStyleId: undefined,
      outlineLevel: resolved.paragraphAttrs.outlineLevel ?? outlineLevel,
      endsSection, sectionBreak,
    };
    const inherited = mergeRunStyle(sheet.docDefaultRun, resolved.runStyle);
    paragraph.attrs = attrs;
    paragraph.inheritedRunStyle = inherited;
    paragraph.changed = true;
    this.paraSnaps.push({ story, paragraph, before, after: { attrs, inherited } });
    return before;
  }

  private applyRuns(
    document: Document, range: SelRange, patch: Parameters<EditContext["mutator"]["applyRunStyle"]>[2],
  ): RunSnap[] {
    const snaps = this.ctx.mutator.applyRunStyle(document, range, patch).map((item) => ({
      story: range.story, document, node: item.node, before: item.block, after: item.node.data.block,
    }));
    this.runSnaps.push(...snaps);
    return snaps;
  }

  private updatePending(style: RunStyle | undefined): void {
    this.prevPending = this.ctx.pendingRunStyle?.();
    this.nextPending = style;
    this.pendingChanged = true;
    this.ctx.setPendingRunStyle?.(style);
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
    for (const snap of this.paraSnaps) {
      const { attrs, inherited } = snap[side];
      this.ctx.mutator.restoreParagraphAttrs([{ paragraph: snap.paragraph, attrs }]);
      snap.paragraph.inheritedRunStyle = inherited;
      push(snap.story, [snap.paragraph]);
    }
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
    for (const [document, story] of this.renumber) {
      push(story, renumberStory(document));
    }
    if (this.pendingChanged) {
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
        return this.action.value === "auto" || this.action.value === "none" ? { color: undefined } : { color: this.action.value };
      case "highlight":
        return this.action.value === "none"
          ? { backgroundColor: undefined, highlight: undefined }
          : { backgroundColor: this.action.value, highlight: this.action.value };
      case "shading":
        return current.backgroundColor && !current.highlight
          ? { backgroundColor: undefined }
          : { backgroundColor: "#D9D9D9", highlight: undefined };
      default:
        return {};
    }
  }

  private sample(range: SelRange): RunStyle {
    const pending = this.ctx.pendingRunStyle?.();
    return mergeRunStyle(runAtCaret(range)?.data.getStyle(), pending);
  }
}

function expandToRun(range: SelRange): SelRange {
  const node = runAtCaret(range);
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
    return { ...clearFirst };
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

const INDENT_STEP_CHARS = 200;
const INDENT_STEP_TWIP = 360;

export function indentStepPatch(attrs: ParagraphAttrs, dir: 1 | -1): Partial<ParagraphAttrs> {
  const chars = attrs.leftChars ?? 0;
  const twip = attrs.leftTwip ?? 0;
  if (chars > 0 || twip <= 0) {
    const next = Math.max(0, chars + dir * INDENT_STEP_CHARS);
    return { leftChars: next || undefined, leftTwip: undefined };
  }
  const next = Math.max(0, twip + dir * INDENT_STEP_TWIP);
  return { leftTwip: next || undefined };
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

function runAtCaret(range: SelRange): LinkedNode<Word> | null {
  const { node, after } = range.start;
  const previous = node?.pre;
  return !after && previous?.data.paragraph === node?.data.paragraph ? previous ?? node : node;
}

function contentRange(spans: SelRange[], wholeParagraphs = false): SelRange {
  const first = spans[0];
  const last = spans[spans.length - 1];
  const start = wholeParagraphs ? edgeOf(first.start.node, "pre") : first.start.node;
  const end = wholeParagraphs ? edgeOf(last.end.node, "next") : last.end.node;
  return new SelRange(first.story, new CaretPos(first.story, start, false), new CaretPos(first.story, end, true));
}

function coversParagraph(range: SelRange): boolean {
  const start = range.start.node;
  const end = range.end.node;
  return !!start && !!end && start === edgeOf(start, "pre")
    && (end.data.isEnterChar() || (end.next?.data.paragraph === end.data.paragraph && end.next.data.isEnterChar()))
    && (!range.collapsed() || start.data.isEnterChar());
}

function edgeOf(node: LinkedNode<Word> | null, dir: "pre" | "next"): LinkedNode<Word> | null {
  if (!node) {
    return null;
  }
  const paragraph = node.data.paragraph;
  let current = node;
  for (let next = current[dir]; next && next.data.paragraph === paragraph; next = current[dir]) {
    current = next;
  }
  return current;
}

function paragraphRunStyle(sheet: StyleSheet, paragraph: Paragraph): RunStyle {
  const id = paragraph.attrs.styleId ?? paragraph.attrs.resolvedStyleId ?? sheet.defaultParagraphStyleId;
  return paragraph.inheritedRunStyle ?? mergeRunStyle(sheet.docDefaultRun, id ? sheet.getResolved(id).runStyle : undefined);
}

function applyCharacterStyle(sheet: StyleSheet, paragraph: Paragraph, id: string, style?: RunStyle): RunStyle {
  const base = paragraphRunStyle(sheet, paragraph);
  const previous = style?.characterStyleId;
  const oldBase = mergeRunStyle(base, previous ? sheet.getResolved(previous).runStyle : undefined);
  const applied = sheet.getResolved(id).runStyle;
  return { ...rebaseRunStyle(style, oldBase, mergeRunStyle(base, applied), applied), characterStyleId: id };
}

function rebaseRunStyle(style: RunStyle | undefined, previous: RunStyle, next: RunStyle, applied: RunStyle): RunStyle {
  const replacesFont = applied.fontFamily || applied.wAscii || applied.wEastAsia || applied.wHAnsi || applied.wCs;
  const local = Object.entries(style ?? {}).filter(([key, value]) =>
    !Object.hasOwn(applied, key) && !(key === "fontFamily" && replacesFont) && value !== previous[key as keyof RunStyle],
  );
  return { ...next, ...Object.fromEntries(local) };
}

function decorateRun(style: RunStyle, block: Block | null): RunStyle {
  if (block?.link) {
    return { ...style, color: style.color ?? "#0563C1", underline: style.underline ?? "single" };
  }
  if (block?.revision?.kind === "ins") {
    return { ...style, color: style.color ?? "#2E75B6", underline: style.underline ?? "single" };
  }
  if (block?.revision?.kind === "del") {
    return { ...style, color: style.color ?? "#C00000", strike: style.strike ?? "single" };
  }
  return style;
}
