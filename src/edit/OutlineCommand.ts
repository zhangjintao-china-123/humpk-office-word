import type { Paragraph } from "../model/block/Paragraph";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { Numbering } from "../model/style/Numbering";
import { CaretPos } from "../selection/CaretPos";
import type { SelRange } from "../selection/SelRange";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import {
  clearNumbering,
  cloneAttrs,
  definedDepth,
  ensureOutline,
  forEachStoryParagraph,
  renumberStory,
  restoreNumbering,
  withLevelIndent,
} from "./OutlineNumbering";

export type OutlineAction =
  | { type: "apply" }
  | { type: "level"; ilvl: number }
  | { type: "promote" }
  | { type: "demote" }
  | { type: "clear" };

export class OutlineCommand implements EditCommand {
  private played = false;
  private snaps: { paragraph: Paragraph; attrs: ParagraphAttrs; after: ParagraphAttrs }[] = [];
  private dirty: Paragraph[] = [];
  private story: SelRange["story"] | null = null;

  constructor(
    private readonly ctx: EditContext,
    private readonly action: OutlineAction,
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
    const document = this.ctx.documentOf(range.story);
    if (!document) {
      return;
    }
    const targets = paragraphsInRange(range);
    if (!targets.length) {
      return;
    }
    this.story = range.story;
    const before = new Map<Paragraph, ParagraphAttrs>();
    forEachStoryParagraph(document, (paragraph) => {
      before.set(paragraph, cloneAttrs(paragraph.attrs));
    });

    const outlineId = this.action.type === "clear" ? "" : ensureOutline(document.numbering);
    for (const paragraph of targets) {
      paragraph.attrs = assignOutline(paragraph.attrs, this.action, outlineId, document.numbering);
      paragraph.changed = true;
    }
    const dirty = new Set<Paragraph>([...targets, ...renumberStory(document)]);
    this.dirty = [...dirty];
    this.snaps = [];
    for (const [paragraph, attrs] of before) {
      if (fingerprint(attrs) !== fingerprint(paragraph.attrs)) {
        this.snaps.push({ paragraph, attrs, after: cloneAttrs(paragraph.attrs) });
      }
    }
    this.commit([...dirty]);
  }

  undo(): void {
    this.restore("before");
  }

  private restore(side: "before" | "after"): void {
    if (!this.story || !this.snaps.length) {
      return;
    }
    restoreNumbering(
      this.snaps.map((snap) => ({ paragraph: snap.paragraph, attrs: side === "before" ? snap.attrs : snap.after })),
    );
    const impact = new EditImpact(this.story, this.dirty);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }

  private commit(dirty: Paragraph[]): void {
    if (!this.story) {
      return;
    }
    const impact = new EditImpact(this.story, dirty);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }
}

function assignOutline(
  attrs: ParagraphAttrs,
  action: OutlineAction,
  outlineId: string,
  numbering: Numbering,
): ParagraphAttrs {
  if (action.type === "clear") {
    return clearNumbering(attrs, numbering);
  }
  if (action.type === "promote" || action.type === "demote") {
    if (!attrs.numId || attrs.numId === "0") {
      return attrs;
    }
    const depth = definedDepth(numbering, attrs.numId);
    if (depth < 0) {
      return attrs;
    }
    const current = Math.min(depth, Math.max(0, Number(attrs.ilvl ?? "0") || 0));
    const ilvl = action.type === "promote" ? Math.max(0, current - 1) : Math.min(depth, current + 1);
    const level = numbering.getLevel(attrs.numId, String(ilvl));
    const next = { ...attrs, ilvl: String(ilvl) };
    return level ? withLevelIndent(next, level) : next;
  }
  const keep = action.type === "apply" && attrs.numId === outlineId;
  const ilvl = keep ? Math.min(8, Math.max(0, Number(attrs.ilvl ?? "0") || 0)) : action.type === "level" ? Math.min(8, Math.max(0, action.ilvl)) : 0;
  const level = numbering.getLevel(outlineId, String(ilvl));
  const next = { ...attrs, numId: outlineId, ilvl: String(ilvl) };
  return level ? withLevelIndent(next, level) : next;
}

function paragraphsInRange(range: SelRange): Paragraph[] {
  const normalized = range.normalized();
  if (normalized.collapsed()) {
    const paragraph = normalized.start.node?.data.paragraph;
    return paragraph && !paragraph.isTable ? [paragraph] : [];
  }
  const from = normalized.start.after ? (normalized.start.node?.next ?? null) : normalized.start.node;
  const to = normalized.end.after ? normalized.end.node : (normalized.end.node?.pre ?? null);
  const unique: Paragraph[] = [];
  let node = from;
  while (node) {
    const paragraph = node.data.paragraph;
    if (paragraph && !paragraph.isTable && !unique.includes(paragraph)) {
      unique.push(paragraph);
    }
    if (node === to) {
      break;
    }
    node = node.next;
  }
  return unique;
}

function fingerprint(attrs: ParagraphAttrs): string {
  return JSON.stringify({
    numId: attrs.numId ?? "",
    ilvl: attrs.ilvl ?? "",
    label: attrs.titleSerial?.label ?? "",
    serial: attrs.titleSerial?.serial ?? 0,
    leftTwip: attrs.leftTwip ?? null,
    hangingTwip: attrs.hangingTwip ?? null,
  });
}

export function caretParagraph(pos: CaretPos | null | undefined): Paragraph | null {
  const paragraph = pos?.node?.data.paragraph;
  return paragraph && !paragraph.isTable ? paragraph : null;
}
