import type { Block } from "../model/block/Block";
import type { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import type { Word } from "../model/inline/Word";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Numbering } from "../model/style/Numbering";
import type { ParagraphAttrs, ParagraphBorder, ParagraphShading, TabStop } from "../model/style/ParagraphAttrs";
import { mergeRunStyle, type RunStyle } from "../model/style/RunStyle";
import type { TableCell } from "../model/table/Table";
import { CaretPos } from "../selection/CaretPos";
import { cellsInReadingOrder, coverFlow } from "../selection/MainWalk";
import { SelRange } from "../selection/SelRange";
import { storyEquals, type StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import { cloneAttrs, forEachStoryParagraph, renumberStory } from "./OutlineNumbering";

export type FormatPainterMode = "off" | "once" | "locked";

export interface FormatSample {
  run: RunStyle;
  paragraph?: ParagraphAttrs;
  inheritedRunStyle?: RunStyle;
  includeParagraph: boolean;
  sourceNumbering?: Numbering;
}

interface TargetSlice {
  range: SelRange;
  whole: boolean;
}

interface RunSnap {
  story: StoryRef;
  document: Document;
  node: LinkedNode<Word>;
  before: Block | null;
  after: Block | null;
}

interface EmptyBlockSnap {
  story: StoryRef;
  paragraph: Paragraph;
  block: Block;
  before: RunStyle;
  after: RunStyle;
}

interface ParaSnap {
  story: StoryRef;
  paragraph: Paragraph;
  beforeAttrs: ParagraphAttrs;
  afterAttrs: ParagraphAttrs;
  beforeInherited?: RunStyle;
  afterInherited?: RunStyle;
}

const PARAGRAPH_FORMAT_KEYS: (keyof ParagraphAttrs)[] = [
  "firstLineChars",
  "firstLineTwip",
  "hangingChars",
  "hangingTwip",
  "leftChars",
  "leftTwip",
  "rightChars",
  "rightTwip",
  "textAlign",
  "textAlignment",
  "line",
  "lineRule",
  "beforeLines",
  "afterLines",
  "before",
  "after",
  "beforeAutospacing",
  "afterAutospacing",
  "contextualSpacing",
  "snapToGrid",
  "widowControl",
  "keepNext",
  "keepLines",
  "pageBreakBefore",
  "overflowPunct",
  "kinsoku",
  "autoSpaceDE",
  "autoSpaceDN",
  "wordWrap",
  "styleId",
  "numId",
  "ilvl",
  "outlineLevel",
  "tabs",
  "borderTop",
  "borderLeft",
  "borderBottom",
  "borderRight",
  "borderBetween",
  "shading",
];

/** 从当前选区或光标位置采集字符和段落格式，供格式刷使用。 */
export function captureFormatSample(ctx: EditContext): FormatSample | null {
  const targets = resolveTargets(ctx);
  if (!targets.length) {
    return null;
  }
  const first = targets[0];
  const document = ctx.documentOf(first.range.story);
  if (!document) {
    return null;
  }

  let sampleNode: LinkedNode<Word> | null = null;
  let paragraph: Paragraph | null | undefined;
  const collapsedCaret = targets.length === 1 && !first.whole && first.range.collapsed();
  if (collapsedCaret) {
    sampleNode = caretTextNode(first.range.start);
    paragraph = sampleNode?.data.paragraph ?? first.range.start.node?.data.paragraph;
  } else {
    const nodes = nodesInRange(first.range);
    sampleNode = nodes.find((item) => item.data.kind === "text" && !item.data.isEnterChar()) ?? null;
    paragraph =
      sampleNode?.data.paragraph ??
      nodes.find((item) => item.data.paragraph && !item.data.paragraph.isTable)?.data.paragraph ??
      first.range.start.node?.data.paragraph;
  }

  if (!paragraph || paragraph.isTable) {
    paragraph = firstNonTableParagraph(document);
  }
  if (!paragraph) {
    return null;
  }

  const pending = collapsedCaret ? ctx.pendingRunStyle?.() : undefined;
  const run = resolveSampleRunStyle(document, paragraph, sampleNode, pending);
  const paraFormat = extractParagraphFormat(document, paragraph);
  const includeParagraph =
    targets.length > 1 || first.whole || collapsedCaret || coversWholeParagraph(document, first.range);

  return {
    run,
    paragraph: paraFormat,
    inheritedRunStyle: { ...run },
    includeParagraph,
    sourceNumbering: document.numbering,
  };
}

export function runStylePatchFromSample(sample: RunStyle): Partial<RunStyle> {
  return {
    fontFamily: sample.fontFamily,
    fontSizePx: sample.fontSizePx,
    fontSizeHalfPoint: sample.fontSizeHalfPoint,
    color: sample.color,
    backgroundColor: sample.backgroundColor,
    highlight: sample.highlight,
    bold: sample.bold ?? false,
    italic: sample.italic ?? false,
    underline: sample.underline ?? "none",
    strike: sample.strike,
    vertAlign: sample.vertAlign ?? "baseline",
    wHint: sample.wHint,
    wAscii: sample.wAscii,
    wEastAsia: sample.wEastAsia,
    wCs: sample.wCs,
    wHAnsi: sample.wHAnsi,
  };
}

export function paragraphAttrsPatchFromSample(sample: ParagraphAttrs): Partial<ParagraphAttrs> {
  const patch: Partial<ParagraphAttrs> = {};
  for (const key of PARAGRAPH_FORMAT_KEYS) {
    const value = sample[key];
    if (key === "tabs") {
      patch.tabs = cloneTabs(value as TabStop[] | undefined);
    } else if (
      key === "borderTop" ||
      key === "borderLeft" ||
      key === "borderBottom" ||
      key === "borderRight" ||
      key === "borderBetween"
    ) {
      patch[key] = cloneBorder(value as ParagraphBorder | undefined);
    } else if (key === "shading") {
      patch.shading = cloneShading(value as ParagraphShading | undefined);
    } else {
      (patch as Record<string, unknown>)[key] = value;
    }
  }
  return patch;
}

export class FormatPainterCommand implements EditCommand {
  private played = false;
  private primaryStory: StoryRef | null = null;
  private prevPending?: RunStyle;
  private nextPending?: RunStyle;
  private pendingTouched = false;
  private runSnaps: RunSnap[] = [];
  private emptyBlockSnaps: EmptyBlockSnap[] = [];
  private paraSnaps: ParaSnap[] = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly sample: FormatSample,
  ) {}

  do(): void {
    if (this.played) {
      this.restore("after");
      return;
    }
    this.played = true;
    const targets = resolveTargets(this.ctx);
    if (!targets.length) {
      return;
    }

    const runPatch = runStylePatchFromSample(this.sample.run);
    const paraPatch = this.sample.paragraph ? paragraphAttrsPatchFromSample(this.sample.paragraph) : null;
    const impacts: { story: StoryRef; dirty: Paragraph[] }[] = [];
    const addDirty = (story: StoryRef, paragraphs: Paragraph[]): void => {
      let entry = impacts.find((item) => storyEquals(item.story, story));
      if (!entry) {
        entry = { story, dirty: [] };
        impacts.push(entry);
      }
      for (const paragraph of paragraphs) {
        if (!entry.dirty.includes(paragraph)) {
          entry.dirty.push(paragraph);
        }
      }
    };

    const docBefore = new Map<
      Document,
      {
        story: StoryRef;
        snapshots: Map<Paragraph, { attrs: ParagraphAttrs; inherited?: RunStyle }>;
        touchedParagraphs: Paragraph[];
      }
    >();
    const ensureDocSnap = (document: Document, story: StoryRef) => {
      let record = docBefore.get(document);
      if (!record) {
        const snapshots = new Map<Paragraph, { attrs: ParagraphAttrs; inherited?: RunStyle }>();
        forEachStoryParagraph(document, (paragraph) => {
          snapshots.set(paragraph, {
            attrs: cloneAttrs(paragraph.attrs),
            inherited: paragraph.inheritedRunStyle ? { ...paragraph.inheritedRunStyle } : undefined,
          });
        });
        record = { story, snapshots, touchedParagraphs: [] };
        docBefore.set(document, record);
      }
      return record;
    };

    const singleCollapsed = targets.length === 1 && !targets[0].whole && targets[0].range.collapsed();
    if (singleCollapsed) {
      this.primaryStory = targets[0].range.story;
      this.prevPending = this.ctx.pendingRunStyle?.();
      this.nextPending = { ...runPatch };
      this.pendingTouched = true;
      this.ctx.setPendingRunStyle?.(this.nextPending);
    }

    for (const target of targets) {
      const document = this.ctx.documentOf(target.range.story);
      if (!document) {
        continue;
      }
      this.primaryStory ??= target.range.story;
      const isCollapsed = !target.whole && target.range.collapsed();

      if (isCollapsed) {
        const node = caretTextNode(target.range.start);
        if (node) {
          const runRange = expandNodeToRun(target.range.story, node);
          const before = this.ctx.mutator.applyRunStyle(document, runRange, runPatch);
          this.pushRunSnaps(target.range.story, document, before);
          addDirty(target.range.story, paragraphsFromRunSnaps(before));
        } else {
          const paragraph = target.range.start.node?.data.paragraph;
          if (paragraph && !paragraph.isTable) {
            this.applyEmptyParagraphRun(target.range.story, paragraph, runPatch);
            addDirty(target.range.story, [paragraph]);
          }
        }
      } else {
        const before = this.ctx.mutator.applyRunStyle(document, target.range, runPatch);
        this.pushRunSnaps(target.range.story, document, before);
        addDirty(target.range.story, paragraphsFromRunSnaps(before));
        for (const paragraph of paragraphsForTarget(document, target.range, target.whole)) {
          if (paragraph.getFullText() === "") {
            this.applyEmptyParagraphRun(target.range.story, paragraph, runPatch);
            addDirty(target.range.story, [paragraph]);
          }
        }
      }

      const shouldApplyParagraph =
        this.sample.includeParagraph &&
        paraPatch != null &&
        (targets.length > 1 || target.whole || isCollapsed || coversWholeParagraph(document, target.range));
      if (!shouldApplyParagraph || !paraPatch) {
        continue;
      }

      if (paraPatch.numId && paraPatch.numId !== "0" && this.sample.sourceNumbering) {
        copyNumberingLevels(this.sample.sourceNumbering, document.numbering, paraPatch.numId);
      }

      const record = ensureDocSnap(document, target.range.story);
      const paragraphs = paragraphsForTarget(document, target.range, target.whole);
      for (const paragraph of paragraphs) {
        paragraph.attrs = { ...paragraph.attrs, ...cloneParagraphPatch(paraPatch) };
        paragraph.inheritedRunStyle = this.sample.inheritedRunStyle ? { ...this.sample.inheritedRunStyle } : undefined;
        paragraph.changed = true;
        if (!record.touchedParagraphs.includes(paragraph)) {
          record.touchedParagraphs.push(paragraph);
        }
      }
      addDirty(target.range.story, paragraphs);
    }

    for (const [document, record] of docBefore) {
      const renumbered = renumberStory(document);
      addDirty(record.story, renumbered);
      for (const [paragraph, before] of record.snapshots) {
        const attrsChanged = attrsFingerprint(before.attrs) !== attrsFingerprint(paragraph.attrs);
        const inheritedChanged =
          JSON.stringify(before.inherited ?? null) !== JSON.stringify(paragraph.inheritedRunStyle ?? null);
        if (attrsChanged || inheritedChanged) {
          this.paraSnaps.push({
            story: record.story,
            paragraph,
            beforeAttrs: before.attrs,
            afterAttrs: cloneAttrs(paragraph.attrs),
            beforeInherited: before.inherited,
            afterInherited: paragraph.inheritedRunStyle ? { ...paragraph.inheritedRunStyle } : undefined,
          });
        }
      }
    }

    if (!impacts.length && this.primaryStory) {
      impacts.push({ story: this.primaryStory, dirty: [] });
    }
    for (const item of impacts) {
      const impact = new EditImpact(item.story, item.dirty);
      this.ctx.relayout.apply(impact);
      this.ctx.afterEdit(impact);
    }
  }

  undo(): void {
    this.restore("before");
  }

  private restore(side: "before" | "after"): void {
    const impacts: { story: StoryRef; dirty: Paragraph[] }[] = [];
    const push = (story: StoryRef, paragraphs: Paragraph[]): void => {
      let found = impacts.find((item) => storyEquals(item.story, story));
      if (!found) {
        found = { story, dirty: [] };
        impacts.push(found);
      }
      for (const paragraph of paragraphs) {
        if (!found.dirty.includes(paragraph)) {
          found.dirty.push(paragraph);
        }
      }
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

    for (const snap of this.emptyBlockSnaps) {
      snap.block.style = { ...(side === "after" ? snap.after : snap.before) };
      snap.paragraph.changed = true;
      push(snap.story, [snap.paragraph]);
    }

    for (const snap of this.paraSnaps) {
      snap.paragraph.attrs = cloneAttrs(side === "after" ? snap.afterAttrs : snap.beforeAttrs);
      const inherited = side === "after" ? snap.afterInherited : snap.beforeInherited;
      snap.paragraph.inheritedRunStyle = inherited ? { ...inherited } : undefined;
      snap.paragraph.changed = true;
      push(snap.story, [snap.paragraph]);
    }

    if (this.pendingTouched) {
      this.ctx.setPendingRunStyle?.(side === "after" ? this.nextPending : this.prevPending);
    }

    if (!impacts.length && this.primaryStory) {
      impacts.push({ story: this.primaryStory, dirty: [] });
    }
    for (const item of impacts) {
      const impact = new EditImpact(item.story, item.dirty);
      this.ctx.relayout.apply(impact);
      this.ctx.afterEdit(impact);
    }
  }

  private pushRunSnaps(story: StoryRef, document: Document, before: { node: LinkedNode<Word>; block: Block | null }[]): void {
    this.runSnaps.push(
      ...before.map((item) => ({
        story,
        document,
        node: item.node,
        before: item.block,
        after: item.node.data.block,
      })),
    );
  }

  private applyEmptyParagraphRun(story: StoryRef, paragraph: Paragraph, runPatch: Partial<RunStyle>): void {
    const block = paragraph.blocks[0];
    if (!block) {
      return;
    }
    if (this.emptyBlockSnaps.some((snap) => snap.block === block)) {
      return;
    }
    const before = { ...block.style };
    const after = mergeRunStyle(block.style, runPatch);
    block.style = after;
    paragraph.changed = true;
    this.emptyBlockSnaps.push({ story, paragraph, block, before, after: { ...after } });
  }
}

function resolveTargets(ctx: EditContext): TargetSlice[] {
  const flow = ctx.selection.flow;
  if (flow && !flow.anchor.equals(flow.focus)) {
    const owner = ctx.flowOwner?.(flow.anchor) ?? ctx.flowOwner?.(flow.focus);
    if (owner) {
      const cover = coverFlow(owner.document, owner.story, flow.anchor, flow.focus);
      const slices: TargetSlice[] = [];
      const seenCells = new Set<TableCell>();
      for (const range of cover.ranges) {
        const cell = range.story.slot === "cell" ? range.story.cell : null;
        if (cell && cover.fullCells.includes(cell)) {
          if (!seenCells.has(cell)) {
            seenCells.add(cell);
            const full = cellFullRange(cell);
            if (full) {
              slices.push({ range: full, whole: true });
            }
          }
          continue;
        }
        if (!range.collapsed()) {
          slices.push({ range: range.normalized(), whole: false });
        }
      }
      for (const cell of cover.fullCells) {
        if (seenCells.has(cell)) {
          continue;
        }
        seenCells.add(cell);
        const full = cellFullRange(cell);
        if (full) {
          slices.push({ range: full, whole: true });
        }
      }
      for (const entry of cover.tables) {
        for (const cell of cellsInReadingOrder(entry.table)) {
          if (seenCells.has(cell)) {
            continue;
          }
          seenCells.add(cell);
          const full = cellFullRange(cell);
          if (full) {
            slices.push({ range: full, whole: true });
          }
        }
      }
      if (slices.length) {
        return slices;
      }
    }
  }

  const slices: TargetSlice[] = [];
  for (const raw of ctx.selection.ranges) {
    if (raw.mode === "cell" && raw.story.slot === "cell") {
      const full = cellFullRange(raw.story.cell);
      if (full) {
        slices.push({ range: full, whole: true });
      }
      continue;
    }
    slices.push({ range: raw.normalized(), whole: false });
  }
  return slices;
}

function cellFullRange(cell: TableCell): SelRange | null {
  const story: StoryRef = { slot: "cell", cell };
  const head = cell.document.words.head;
  const tail = cell.document.words.tail;
  if (!head || !tail) {
    return null;
  }
  return new SelRange(story, new CaretPos(story, head, false), new CaretPos(story, tail, true), "cell");
}

function caretTextNode(pos: CaretPos): LinkedNode<Word> | null {
  const node = pos.node;
  if (!node) {
    return null;
  }
  const para = node.data.paragraph;
  if (pos.after) {
    return node.data.kind === "text" && !node.data.isEnterChar() ? node : null;
  }
  if (node.data.kind === "text" && !node.data.isEnterChar()) {
    return node;
  }
  if (node.pre && node.pre.data.paragraph === para && node.pre.data.kind === "text" && !node.pre.data.isEnterChar()) {
    return node.pre;
  }
  return null;
}

function expandNodeToRun(story: StoryRef, node: LinkedNode<Word>): SelRange {
  const block = node.data.block;
  const para = node.data.paragraph;
  let start = node;
  while (
    start.pre &&
    start.pre.data.paragraph === para &&
    start.pre.data.block === block &&
    start.pre.data.kind === "text" &&
    !start.pre.data.isEnterChar()
  ) {
    start = start.pre;
  }
  let end = node;
  while (
    end.next &&
    end.next.data.paragraph === para &&
    end.next.data.block === block &&
    end.next.data.kind === "text" &&
    !end.next.data.isEnterChar()
  ) {
    end = end.next;
  }
  return new SelRange(story, new CaretPos(story, start, false), new CaretPos(story, end, true));
}

function resolveSampleRunStyle(
  document: Document,
  paragraph: Paragraph,
  node: LinkedNode<Word> | null,
  pending?: RunStyle,
): RunStyle {
  const styleId = paragraph.attrs.styleId ?? paragraph.attrs.resolvedStyleId ?? document.styles.defaultParagraphStyleId;
  const fromSheet = styleId ? document.styles.getResolved(styleId).runStyle : undefined;
  const blockStyle = node?.data.block?.style ?? paragraph.blocks[0]?.style;
  return cleanRunStyle({
    ...document.styles.docDefaultRun,
    ...fromSheet,
    ...paragraph.inheritedRunStyle,
    ...blockStyle,
    ...pending,
  });
}

function cleanRunStyle(raw: RunStyle): RunStyle {
  const out: RunStyle = {};
  if (raw.fontFamily != null) out.fontFamily = raw.fontFamily;
  if (raw.fontSizePx != null) out.fontSizePx = raw.fontSizePx;
  if (raw.fontSizeHalfPoint != null) out.fontSizeHalfPoint = raw.fontSizeHalfPoint;
  if (raw.color != null) out.color = raw.color;
  if (raw.backgroundColor != null) out.backgroundColor = raw.backgroundColor;
  if (raw.highlight != null) out.highlight = raw.highlight;
  if (raw.bold != null) out.bold = raw.bold;
  if (raw.italic != null) out.italic = raw.italic;
  if (raw.smallCaps != null) out.smallCaps = raw.smallCaps;
  if (raw.underline != null) out.underline = raw.underline;
  if (raw.strike != null) out.strike = raw.strike;
  if (raw.vertAlign != null) out.vertAlign = raw.vertAlign;
  if (raw.wHint != null) out.wHint = raw.wHint;
  if (raw.wAscii != null) out.wAscii = raw.wAscii;
  if (raw.wEastAsia != null) out.wEastAsia = raw.wEastAsia;
  if (raw.wCs != null) out.wCs = raw.wCs;
  if (raw.wHAnsi != null) out.wHAnsi = raw.wHAnsi;
  return out;
}

function extractParagraphFormat(document: Document, paragraph: Paragraph): ParagraphAttrs {
  const styleId = paragraph.attrs.styleId ?? paragraph.attrs.resolvedStyleId ?? document.styles.defaultParagraphStyleId;
  const fromSheet = styleId ? document.styles.getResolved(styleId).paragraphAttrs : undefined;
  const merged: ParagraphAttrs = {
    ...document.styles.docDefaults,
    ...fromSheet,
    ...paragraph.attrs,
    styleId: paragraph.attrs.styleId,
  };
  const out: ParagraphAttrs = {};
  for (const key of PARAGRAPH_FORMAT_KEYS) {
    const value = merged[key];
    if (value === undefined) {
      continue;
    }
    if (key === "tabs") {
      out.tabs = cloneTabs(value as TabStop[]);
    } else if (
      key === "borderTop" ||
      key === "borderLeft" ||
      key === "borderBottom" ||
      key === "borderRight" ||
      key === "borderBetween"
    ) {
      out[key] = cloneBorder(value as ParagraphBorder);
    } else if (key === "shading") {
      out.shading = cloneShading(value as ParagraphShading);
    } else {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function coversWholeParagraph(document: Document, range: SelRange): boolean {
  const normalized = range.normalized();
  if (normalized.mode === "cell") {
    return true;
  }
  if (normalized.collapsed()) {
    return false;
  }
  const nodes = nodesInRange(normalized);
  if (!nodes.length) {
    return false;
  }
  const paragraphs: Paragraph[] = [];
  for (const node of nodes) {
    const paragraph = node.data.paragraph;
    if (paragraph && !paragraph.isTable && !paragraphs.includes(paragraph)) {
      paragraphs.push(paragraph);
    }
  }
  if (paragraphs.length > 1) {
    return true;
  }
  if (paragraphs.length === 0) {
    return false;
  }
  if (nodes.some((node) => node.data.isEnterChar())) {
    return true;
  }
  const paragraph = paragraphs[0];
  let firstVisible: LinkedNode<Word> | null = null;
  let lastVisible: LinkedNode<Word> | null = null;
  let cursor = document.words.head;
  while (cursor) {
    if (cursor.data.paragraph === paragraph && cursor.data.kind === "text" && !cursor.data.isEnterChar()) {
      firstVisible ??= cursor;
      lastVisible = cursor;
    }
    cursor = cursor.next;
  }
  if (!firstVisible || !lastVisible) {
    return true;
  }
  return nodes.includes(firstVisible) && nodes.includes(lastVisible);
}

function paragraphsForTarget(document: Document, range: SelRange, whole: boolean): Paragraph[] {
  if (whole) {
    const list: Paragraph[] = [];
    document.paragraphs.each((node) => {
      if (!node.data.isTable) {
        list.push(node.data);
      }
    });
    return list;
  }
  const normalized = range.normalized();
  if (normalized.collapsed()) {
    const paragraph = normalized.start.node?.data.paragraph;
    return paragraph && !paragraph.isTable ? [paragraph] : [];
  }
  const unique: Paragraph[] = [];
  for (const node of nodesInRange(normalized)) {
    const paragraph = node.data.paragraph;
    if (paragraph && !paragraph.isTable && !unique.includes(paragraph)) {
      unique.push(paragraph);
    }
  }
  return unique;
}

function nodesInRange(range: SelRange): LinkedNode<Word>[] {
  const normalized = range.normalized();
  if (normalized.collapsed()) {
    return [];
  }
  const from = normalized.start.after ? (normalized.start.node?.next ?? null) : normalized.start.node;
  const to = normalized.end.after ? normalized.end.node : (normalized.end.node?.pre ?? null);
  const nodes: LinkedNode<Word>[] = [];
  let node = from;
  while (node) {
    nodes.push(node);
    if (node === to) {
      break;
    }
    node = node.next;
  }
  return nodes;
}

function firstNonTableParagraph(document: Document): Paragraph | undefined {
  let found: Paragraph | undefined;
  document.paragraphs.each((node) => {
    if (!found && !node.data.isTable) {
      found = node.data;
    }
  });
  return found;
}

function paragraphsFromRunSnaps(snaps: { node: LinkedNode<Word>; block: Block | null }[]): Paragraph[] {
  const dirty: Paragraph[] = [];
  for (const item of snaps) {
    const paragraph = item.node.data.paragraph;
    if (paragraph && !dirty.includes(paragraph)) {
      dirty.push(paragraph);
    }
  }
  return dirty;
}

function copyNumberingLevels(source: Numbering, target: Numbering, numId: string): void {
  if (source === target) {
    return;
  }
  for (const entry of source.entries()) {
    if (entry.numId === numId && !target.getLevel(entry.numId, entry.ilvl)) {
      target.setLevel(entry.numId, entry.ilvl, { ...entry.level });
    }
  }
}

function cloneParagraphPatch(patch: Partial<ParagraphAttrs>): Partial<ParagraphAttrs> {
  return {
    ...patch,
    tabs: cloneTabs(patch.tabs),
    borderTop: cloneBorder(patch.borderTop),
    borderLeft: cloneBorder(patch.borderLeft),
    borderBottom: cloneBorder(patch.borderBottom),
    borderRight: cloneBorder(patch.borderRight),
    borderBetween: cloneBorder(patch.borderBetween),
    shading: cloneShading(patch.shading),
  };
}

function cloneTabs(tabs: TabStop[] | undefined): TabStop[] | undefined {
  return tabs ? tabs.map((tab) => ({ ...tab })) : undefined;
}

function cloneBorder(border: ParagraphBorder | undefined): ParagraphBorder | undefined {
  return border ? { ...border } : undefined;
}

function cloneShading(shading: ParagraphShading | undefined): ParagraphShading | undefined {
  return shading ? { ...shading } : undefined;
}

function attrsFingerprint(attrs: ParagraphAttrs): string {
  return JSON.stringify(attrs);
}
