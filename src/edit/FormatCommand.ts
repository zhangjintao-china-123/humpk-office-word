import { ptToPx } from "../shared/units";
import type { Paragraph } from "../model/block/Paragraph";
import type { Block } from "../model/block/Block";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import { mergeRunStyle, type RunStyle } from "../model/style/RunStyle";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
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
  | { type: "clear" };

type RunSnap = { node: LinkedNode<Word>; before: Block | null; after: Block | null };
type ParaSnap = { paragraph: Paragraph; before: ParagraphAttrs; after: ParagraphAttrs };

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
    const range = this.ctx.selection.primaryRange()?.normalized();
    if (!range) {
      return;
    }
    this.story = range.story;
    const document = this.ctx.documentOf(range.story);
    if (!document) {
      return;
    }
    if (this.action.type === "align") {
      const before = this.ctx.mutator.applyParagraphAttrs(document, range, { textAlign: this.action.value });
      this.paraSnaps = before.map((item) => ({
        paragraph: item.paragraph,
        before: item.attrs,
        after: { ...item.paragraph.attrs },
      }));
      this.commit(this.paraSnaps.map((item) => item.paragraph));
      return;
    }
    const patch = this.runPatch(range);
    if (range.collapsed()) {
      this.prevPending = this.ctx.pendingRunStyle?.();
      this.nextPending = mergeRunStyle(this.prevPending, patch);
      this.ctx.setPendingRunStyle?.(this.nextPending);
    }
    const target = range.collapsed() ? expandToRun(range) : range;
    const before = this.ctx.mutator.applyRunStyle(document, target, patch);
    this.runSnaps = before.map((item) => ({
      node: item.node,
      before: item.block,
      after: item.node.data.block,
    }));
    if (!this.runSnaps.length && range.collapsed()) {
      this.ctx.afterEdit(new EditImpact(range.story, []));
      return;
    }
    this.commit(paragraphsOf(this.runSnaps));
  }

  undo(): void {
    this.restore("before");
  }

  private restore(side: "before" | "after"): void {
    if (!this.story) {
      return;
    }
    const document = this.ctx.documentOf(this.story);
    let dirty: Paragraph[] = [];
    if (this.runSnaps.length && document) {
      dirty = this.ctx.mutator.restoreRunStyle(
        document,
        this.runSnaps.map((item) => ({ node: item.node, block: item[side] })),
      );
    }
    if (this.paraSnaps.length) {
      dirty = this.ctx.mutator.restoreParagraphAttrs(
        this.paraSnaps.map((item) => ({ paragraph: item.paragraph, attrs: item[side] })),
      );
    }
    if (this.nextPending !== undefined || this.prevPending !== undefined) {
      this.ctx.setPendingRunStyle?.(side === "after" ? this.nextPending : this.prevPending);
    }
    if (dirty.length) {
      this.ctx.relayout.apply(new EditImpact(this.story, dirty));
    }
    this.ctx.afterEdit(new EditImpact(this.story, dirty));
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
