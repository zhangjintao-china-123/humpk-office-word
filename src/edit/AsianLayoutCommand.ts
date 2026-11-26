import type { Document } from "../model/document/Document";
import type { AsianLayoutKind, AsianLayoutSpec } from "../model/inline/AsianLayout";
import type { Word } from "../model/inline/Word";
import type { LinkedNode } from "../model/list/LinkedList";
import type { RunStyle } from "../model/style/RunStyle";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import type { MutationPatch } from "./MutationPatch";
import { refreshNumbering, renumberStory, restoreNumbering } from "./OutlineNumbering";

export type AsianLayoutAction =
  | { type: "apply"; text: string; spec: AsianLayoutSpec }
  | { type: "remove" };

export interface AsianLayoutStateInfo {
  text: string;
  spec: AsianLayoutSpec;
  active: boolean;
}

export function inspectAsianLayout(ctx: EditContext, fallbackKind: AsianLayoutKind = "twoInOne"): AsianLayoutStateInfo {
  const range = ctx.selection.primaryRange()?.normalized();
  const defaultSpec: AsianLayoutSpec =
    fallbackKind === "twoInOne"
      ? { kind: "twoInOne", brackets: "round" }
      : fallbackKind === "fitWidth"
        ? { kind: "fitWidth", fitWidthPx: 48 }
        : fallbackKind === "tatechuyoko"
          ? { kind: "tatechuyoko", compress: true }
          : { kind: "combine" };

  if (!range) {
    return { text: "", spec: defaultSpec, active: false };
  }
  if (!range.collapsed()) {
    const nodes = textNodesInRange(range);
    const first = nodes.find((node) => node.data.block?.asianLayout != null)?.data.block?.asianLayout;
    const text = nodes.map((node) => node.data.char).join("");
    return {
      text,
      spec: first ? { ...first } : defaultSpec,
      active: first != null,
    };
  }
  const candidate = caretCandidateNode(range.start);
  if (!candidate) {
    return { text: "", spec: defaultSpec, active: false };
  }
  const existing = candidate.data.block?.asianLayout;
  return {
    text: candidate.data.char,
    spec: existing ? { ...existing } : defaultSpec,
    active: existing != null,
  };
}

export class AsianLayoutCommand implements EditCommand {
  private played = false;
  private patches: MutationPatch[] = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly action: AsianLayoutAction,
  ) {}

  do(): void {
    if (this.played) {
      for (const patch of this.patches) {
        const document = this.ctx.documentOf(patch.story);
        if (!document) {
          continue;
        }
        this.ctx.mutator.replay(document, patch);
        renumberStory(document);
        this.ctx.relayout.apply(patch.impact);
        this.ctx.selection.collapse(patch.caret);
        this.ctx.afterEdit(patch.impact);
      }
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

    if (this.action.type === "remove") {
      this.removeLayout(document, range);
      return;
    }

    const text = this.action.text.trim();
    if (!text) {
      return;
    }
    const spec: AsianLayoutSpec = { ...this.action.spec };

    let insertPos = range.start;
    let style = this.ctx.pendingRunStyle?.();

    if (!range.collapsed()) {
      const nodes = textNodesInRange(range);
      if (nodes[0]?.data.block?.style) {
        style = { ...nodes[0].data.block.style };
      }
      const deleted = this.ctx.mutator.deleteRange(document, range.story, range);
      if (deleted.removed.length || deleted.inserted.length) {
        this.recordPatch(document, deleted);
        insertPos = deleted.caret;
      }
    } else {
      const candidate = caretCandidateNode(range.start);
      if (candidate) {
        style = candidate.data.block?.style ? { ...candidate.data.block.style } : style;
        const single = new SelRange(
          range.story,
          new CaretPos(range.story, candidate, false),
          new CaretPos(range.story, candidate, true),
        );
        const deleted = this.ctx.mutator.deleteRange(document, range.story, single);
        if (deleted.removed.length || deleted.inserted.length) {
          this.recordPatch(document, deleted);
          insertPos = deleted.caret;
        }
      }
    }

    const inserted = this.ctx.mutator.insertAsianLayout(document, range.story, insertPos, text, style, spec);
    if (!inserted.inserted.length) {
      return;
    }
    this.recordPatch(document, inserted);
    this.ctx.selection.collapse(inserted.caret);
    this.ctx.afterEdit(inserted.impact);
  }

  undo(): void {
    for (const patch of [...this.patches].reverse()) {
      const document = this.ctx.documentOf(patch.story);
      if (!document) {
        continue;
      }
      restoreNumbering(patch.numberingBefore);
      const impact = this.ctx.mutator.invert(document, patch);
      this.ctx.relayout.apply(impact);
      this.ctx.selection.collapse(patch.originalCaret);
      this.ctx.afterEdit(impact);
    }
  }

  private removeLayout(document: Document, range: SelRange): void {
    const targets = range.collapsed()
      ? (() => {
          const candidate = caretCandidateNode(range.start);
          return candidate && candidate.data.block?.asianLayout ? [candidate] : [];
        })()
      : textNodesInRange(range).filter((node) => node.data.block?.asianLayout != null);
    if (!targets.length) {
      return;
    }
    let lastCaret = range.start;
    for (const node of [...targets].reverse()) {
      const style: RunStyle | undefined = node.data.block?.style ? { ...node.data.block.style } : undefined;
      const text = node.data.char;
      const single = new SelRange(
        range.story,
        new CaretPos(range.story, node, false),
        new CaretPos(range.story, node, true),
      );
      const deleted = this.ctx.mutator.deleteRange(document, range.story, single);
      this.recordPatch(document, deleted);
      const inserted = this.ctx.mutator.insert(document, range.story, deleted.caret, text, style);
      this.recordPatch(document, inserted);
      lastCaret = inserted.caret;
    }
    this.ctx.selection.collapse(lastCaret);
    const last = this.patches.at(-1);
    if (last) {
      this.ctx.afterEdit(last.impact);
    }
  }

  private recordPatch(document: Document, patch: MutationPatch): void {
    this.patches.push(patch);
    refreshNumbering(document, patch);
    this.ctx.relayout.apply(patch.impact);
  }
}

function textNodesInRange(range: SelRange): LinkedNode<Word>[] {
  const from = range.start.after ? (range.start.node?.next ?? null) : range.start.node;
  const to = range.end.after ? range.end.node : (range.end.node?.pre ?? null);
  const nodes: LinkedNode<Word>[] = [];
  let node = from;
  while (node) {
    if (node.data.kind === "text" && !node.data.isEnterChar()) {
      nodes.push(node);
    }
    if (node === to) {
      break;
    }
    node = node.next;
  }
  return nodes;
}

function caretCandidateNode(pos: CaretPos): LinkedNode<Word> | null {
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
