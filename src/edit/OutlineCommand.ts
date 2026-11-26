import type { Document } from "../model/document/Document";
import type { Paragraph } from "../model/block/Paragraph";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { Numbering } from "../model/style/Numbering";
import { headingLevelFromName } from "../model/toc/Toc";
import { CaretPos } from "../selection/CaretPos";
import { coverFlow, formatRanges } from "../selection/MainWalk";
import type { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import {
  clearNumbering,
  cloneAttrs,
  definedDepth,
  DEFAULT_BULLET,
  DEFAULT_NUMBERING,
  ensureBullet,
  ensureBulletLevels,
  ensureMultilevel,
  ensureNumbering,
  ensureNumberingLevels,
  ensureOutline,
  forEachStoryParagraph,
  isBulletParagraph,
  isNumberedListParagraph,
  isOutlineNumId,
  multilevelPresetById,
  PRESET_MULTILEVELS,
  renumberStory,
  restoreNumbering,
  withLevelIndent,
  type MultilevelLevelSpec,
} from "./OutlineNumbering";

export type OutlineAction =
  | { type: "apply" }
  | { type: "bullet"; symbol?: string }
  | { type: "toggleBullet"; symbol?: string }
  | { type: "numbering"; numFmt?: string; lvlText?: string; start?: number }
  | { type: "toggleNumbering"; numFmt?: string; lvlText?: string; start?: number }
  | { type: "multilevel"; presetId?: string; levels?: MultilevelLevelSpec[]; linkHeading?: boolean }
  | { type: "level"; ilvl: number }
  | { type: "promote" }
  | { type: "demote" }
  | { type: "clear" };

interface StorySnap {
  story: StoryRef;
  dirty: Paragraph[];
  snaps: { paragraph: Paragraph; attrs: ParagraphAttrs; after: ParagraphAttrs }[];
}

export class OutlineCommand implements EditCommand {
  private played = false;
  private records: StorySnap[] = [];

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
    const groups = this.targetGroups();
    if (!groups.length) {
      return;
    }
    this.records = [];
    for (const { story, document, targets } of groups) {
      const before = new Map<Paragraph, ParagraphAttrs>();
      forEachStoryParagraph(document, (paragraph) => {
        before.set(paragraph, cloneAttrs(paragraph.attrs));
      });

      const resolved = this.resolveAction(document.numbering, targets);
      const touched =
        resolved.type === "multilevel"
          ? applyMultilevelToStory(document, targets, resolved)
          : targets.map((paragraph) => {
              paragraph.attrs = assignOutline(paragraph.attrs, resolved, document.numbering);
              paragraph.changed = true;
              return paragraph;
            });
      const dirty = new Set<Paragraph>([...touched, ...renumberStory(document)]);
      const snaps: StorySnap["snaps"] = [];
      for (const [paragraph, attrs] of before) {
        if (fingerprint(attrs) !== fingerprint(paragraph.attrs)) {
          snaps.push({ paragraph, attrs, after: cloneAttrs(paragraph.attrs) });
        }
      }
      const dirtyList = [...dirty];
      this.records.push({ story, dirty: dirtyList, snaps });
      const impact = new EditImpact(story, dirtyList);
      this.ctx.relayout.apply(impact);
      this.ctx.afterEdit(impact);
    }
  }

  undo(): void {
    this.restore("before");
  }

  private restore(side: "before" | "after"): void {
    const records = side === "before" ? [...this.records].reverse() : this.records;
    for (const record of records) {
      if (!record.snaps.length) {
        continue;
      }
      restoreNumbering(
        record.snaps.map((snap) => ({
          paragraph: snap.paragraph,
          attrs: side === "before" ? snap.attrs : snap.after,
        })),
      );
      const impact = new EditImpact(record.story, record.dirty);
      this.ctx.relayout.apply(impact);
      this.ctx.afterEdit(impact);
    }
  }

  private resolveAction(numbering: Numbering, targets: Paragraph[]): OutlineAction {
    if (this.action.type === "toggleBullet") {
      const allBullet = targets.length > 0 && targets.every((paragraph) => isBulletParagraph(numbering, paragraph));
      if (allBullet) {
        return { type: "clear" };
      }
      return { type: "bullet", symbol: this.action.symbol ?? DEFAULT_BULLET };
    }
    if (this.action.type === "toggleNumbering") {
      const allNumbered = targets.length > 0 && targets.every((paragraph) => isNumberedListParagraph(numbering, paragraph));
      if (allNumbered) {
        return { type: "clear" };
      }
      return {
        type: "numbering",
        numFmt: this.action.numFmt ?? DEFAULT_NUMBERING.numFmt,
        lvlText: this.action.lvlText ?? DEFAULT_NUMBERING.lvlText,
        start: this.action.start ?? DEFAULT_NUMBERING.start,
      };
    }
    return this.action;
  }

  private targetGroups(): { story: StoryRef; document: Document; targets: Paragraph[] }[] {
    const ranges = this.editRanges();
    const groups: { story: StoryRef; document: Document; targets: Paragraph[] }[] = [];
    for (const range of ranges) {
      const document = this.ctx.documentOf(range.story);
      if (!document) {
        continue;
      }
      const targets = paragraphsInRange(range);
      if (!targets.length) {
        continue;
      }
      const existing = groups.find((item) => item.document === document);
      if (existing) {
        for (const paragraph of targets) {
          if (!existing.targets.includes(paragraph)) {
            existing.targets.push(paragraph);
          }
        }
      } else {
        groups.push({ story: range.story, document, targets });
      }
    }
    return groups;
  }

  private editRanges(): SelRange[] {
    const flow = this.ctx.selection.flow;
    if (flow && !flow.anchor.equals(flow.focus)) {
      const owner = this.ctx.flowOwner?.(flow.anchor) ?? this.ctx.flowOwner?.(flow.focus);
      if (owner) {
        return formatRanges(coverFlow(owner.document, owner.story, flow.anchor, flow.focus));
      }
    }
    return this.ctx.selection.normalized();
  }
}

function applyMultilevelToStory(
  document: Document,
  targets: Paragraph[],
  action: Extract<OutlineAction, { type: "multilevel" }>,
): Paragraph[] {
  const touched: Paragraph[] = [...targets];
  const preset = action.levels
    ? { levels: action.levels, linkHeading: action.linkHeading }
    : (multilevelPresetById(action.presetId) ?? PRESET_MULTILEVELS[0]);
  const numId = ensureMultilevel(document.numbering, preset.levels);
  const linkHeading = !!preset.linkHeading || preset.levels.some((item) => item.headingLevel != null);

  for (const paragraph of targets) {
    const headingLv = paragraph.attrs.outlineLevel ?? headingLevelFromName(paragraph.attrs.styleId);
    const ilvl =
      headingLv != null
        ? Math.min(8, Math.max(0, headingLv - 1))
        : paragraph.attrs.numId && paragraph.attrs.numId !== "0"
          ? Math.min(8, Math.max(0, Number(paragraph.attrs.ilvl ?? "0") || 0))
          : 0;
    const spec = preset.levels[ilvl];
    const level = document.numbering.getLevel(numId, String(ilvl));
    let next: ParagraphAttrs = { ...paragraph.attrs, numId, ilvl: String(ilvl) };
    if (spec?.numFmt === "none") {
      delete next.leftTwip;
      delete next.hangingTwip;
    } else if (level) {
      next = withLevelIndent(next, level);
    }
    if (linkHeading) {
      const targetHeading = spec?.headingLevel ?? ilvl + 1;
      if (!next.outlineLevel) {
        next.outlineLevel = targetHeading;
      }
      if (!next.styleId) {
        next.styleId = `Heading${targetHeading}`;
      }
    }
    paragraph.attrs = next;
    paragraph.changed = true;
  }

  if (linkHeading) {
    forEachStoryParagraph(document, (paragraph) => {
      if (targets.includes(paragraph)) {
        return;
      }
      const headingLv = paragraph.attrs.outlineLevel ?? headingLevelFromName(paragraph.attrs.styleId);
      if (headingLv == null) {
        return;
      }
      const matchIndex = preset.levels.findIndex((item) => item.headingLevel === headingLv);
      if (matchIndex < 0) {
        return;
      }
      const level = document.numbering.getLevel(numId, String(matchIndex));
      let next: ParagraphAttrs = { ...paragraph.attrs, numId, ilvl: String(matchIndex) };
      if (preset.levels[matchIndex]?.numFmt === "none") {
        delete next.leftTwip;
        delete next.hangingTwip;
      } else if (level) {
        next = withLevelIndent(next, level);
      }
      paragraph.attrs = next;
      paragraph.changed = true;
      touched.push(paragraph);
    });
  }
  return touched;
}

function assignOutline(
  attrs: ParagraphAttrs,
  action: OutlineAction,
  numbering: Numbering,
): ParagraphAttrs {
  if (action.type === "clear") {
    return clearNumbering(attrs, numbering);
  }
  if (action.type === "bullet") {
    const symbol = action.symbol ?? DEFAULT_BULLET;
    const keepLevel =
      attrs.numId &&
      attrs.numId !== "0" &&
      numbering.getLevel(attrs.numId, attrs.ilvl ?? "0")?.numFmt === "bullet"
        ? Math.min(8, Math.max(0, Number(attrs.ilvl ?? "0") || 0))
        : 0;
    const bulletId = ensureBullet(numbering, symbol, keepLevel);
    const level = numbering.getLevel(bulletId, String(keepLevel));
    const next = { ...attrs, numId: bulletId, ilvl: String(keepLevel) };
    return level ? withLevelIndent(next, level) : next;
  }
  if (action.type === "numbering") {
    const keepLevel =
      attrs.numId &&
      attrs.numId !== "0" &&
      numbering.getLevel(attrs.numId, attrs.ilvl ?? "0")?.numFmt !== "bullet" &&
      !isOutlineNumId(numbering, attrs.numId)
        ? Math.min(8, Math.max(0, Number(attrs.ilvl ?? "0") || 0))
        : 0;
    const numId = ensureNumbering(
      numbering,
      {
        numFmt: action.numFmt ?? DEFAULT_NUMBERING.numFmt,
        lvlText: action.lvlText ?? DEFAULT_NUMBERING.lvlText,
        start: action.start ?? DEFAULT_NUMBERING.start,
      },
      keepLevel,
    );
    const level = numbering.getLevel(numId, String(keepLevel));
    const next = { ...attrs, numId, ilvl: String(keepLevel) };
    return level ? withLevelIndent(next, level) : next;
  }
  if (action.type === "promote" || action.type === "demote") {
    if (!attrs.numId || attrs.numId === "0") {
      return attrs;
    }
    const baseLevel = numbering.getLevel(attrs.numId, attrs.ilvl ?? "0");
    if (baseLevel?.numFmt === "bullet") {
      ensureBulletLevels(numbering, attrs.numId, baseLevel.lvlText || DEFAULT_BULLET, Number(attrs.ilvl ?? "0") || 0);
    } else if (baseLevel) {
      ensureNumberingLevels(numbering, attrs.numId);
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
  const outlineId = ensureOutline(numbering);
  const keep = action.type === "apply" && attrs.numId === outlineId;
  const ilvl = keep
    ? Math.min(8, Math.max(0, Number(attrs.ilvl ?? "0") || 0))
    : action.type === "level"
      ? Math.min(8, Math.max(0, action.ilvl))
      : 0;
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
