import { CaretPos } from "../selection/CaretPos";
import { SelectionText } from "../selection/SelectionText";
import { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
import type { Document } from "../model/document/Document";
import type { Paragraph } from "../model/block/Paragraph";
import type { Drawing } from "../model/inline/Drawing";
import type { RunStyle } from "../model/style/RunStyle";
import { consumeFlow } from "./FlowEdit";
import { ClipboardPayload, drawingFromSnapshot, type ClipboardParagraph } from "./ClipboardPayload";
import { TableSnapshot } from "./TableSnapshot";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import type { MutationPatch } from "./MutationPatch";
import { refreshNumbering, renumberStory, restoreNumbering } from "./OutlineNumbering";

export class InsertCommand implements EditCommand {
  private patches: MutationPatch[] = [];
  private played = false;
  private readonly payload: ClipboardPayload;

  constructor(
    private readonly ctx: EditContext,
    source: string | ClipboardPayload,
  ) {
    this.payload = typeof source === "string" ? ClipboardPayload.plain(source) : source;
  }

  do(): void {
    if (this.played) {
      for (const patch of this.patches) {
        const document = this.ctx.documentOf(patch.story);
        if (document) {
          this.ctx.mutator.replay(document, patch);
          if (!patch.impact.textAnchor) {
            renumberStory(document);
          }
          this.ctx.relayout.apply(patch.impact);
        }
      }
      const last = this.patches.at(-1);
      if (last) {
        this.ctx.selection.collapse(last.caret);
        this.ctx.afterEdit(last.impact);
      }
      return;
    }
    this.played = true;
    const consumed = consumeFlow(this.ctx);
    if (consumed) {
      this.patches.push(...consumed);
    }
    if (this.payload.blocks?.length) {
      this.pasteBlocks();
      return;
    }
    if (this.payload.table) {
      this.pasteTable();
      return;
    }
    const ranges = this.targets();
    for (const range of ranges) {
      const document = this.ctx.documentOf(range.story);
      if (!document) {
        continue;
      }
      let pos = range.start;
      if (!range.collapsed()) {
        const deleted = this.ctx.mutator.deleteRange(document, range.story, range);
        this.patches.push(deleted);
        pos = deleted.caret;
        this.ctx.relayout.apply(deleted.impact);
      }
      this.insertPayload(document, range.story, pos);
    }
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

  private pasteBlocks(): void {
    const blocks = this.payload.blocks;
    if (!blocks?.length) {
      return;
    }
    const range = this.targets()[0];
    const document = range ? this.ctx.documentOf(range.story) : null;
    if (!range || !document) {
      return;
    }
    const story = range.story;
    let pos = range.start;
    if (!range.collapsed()) {
      const deleted = this.ctx.mutator.deleteRange(document, story, range);
      this.patches.push(deleted);
      pos = deleted.caret;
      this.ctx.relayout.apply(deleted.impact);
    }

    let prevType: "paragraph" | "table" | null = null;
    for (const block of blocks) {
      if (block.type === "paragraph") {
        if (prevType === "paragraph") {
          pos = this.insertBreak(document, story, pos, block.paragraph);
        } else if (prevType === "table") {
          const currentPara = pos.node?.data.paragraph;
          const justCreated =
            currentPara &&
            this.patches.at(-1)?.createdParagraphs.some((item) => item.paragraph === currentPara);
          if (justCreated && currentPara && this.isParagraphEmpty(document, currentPara)) {
            currentPara.attrs = { ...block.paragraph.attrs };
            currentPara.inheritedRunStyle = block.paragraph.inheritedRunStyle
              ? { ...block.paragraph.inheritedRunStyle }
              : currentPara.inheritedRunStyle;
            currentPara.changed = true;
          }
        }
        for (const run of block.paragraph.runs) {
          if (run.drawing) {
            pos = this.insertDrawing(document, story, pos, drawingFromSnapshot(run.drawing), false);
          } else if (run.enclosed && run.text) {
            pos = this.insertEnclosed(document, story, pos, run.text, this.styleOf(run.style), run.enclosed);
          } else if (run.asianLayout && run.text) {
            pos = this.insertAsianLayout(document, story, pos, run.text, this.styleOf(run.style), run.asianLayout);
          } else {
            pos = this.insertRun(document, story, pos, run.text, this.styleOf(run.style));
          }
        }
        prevType = "paragraph";
        continue;
      }

      if (this.shouldSplitBeforeTable(document, pos)) {
        pos = this.insertBreak(document, story, pos, { attrs: {}, runs: [] });
      }
      let insertPos = pos;
      if (
        prevType === "paragraph" &&
        insertPos.node &&
        !insertPos.after &&
        insertPos.node.data.isEnterChar() &&
        insertPos.node.data.paragraph &&
        this.isParagraphEmpty(document, insertPos.node.data.paragraph)
      ) {
        insertPos = new CaretPos(story, insertPos.node, true);
      }
      const table = new TableSnapshot().materialize(block.table);
      const patch = this.ctx.mutator.insertTable(document, story, insertPos, table);
      this.patches.push(patch);
      this.ctx.relayout.apply(patch.impact);
      this.ctx.selection.collapse(patch.caret);
      this.ctx.afterEdit(patch.impact);
      pos = patch.caret;
      prevType = "table";
    }
  }

  private pasteTable(): void {
    const dest = this.tableDestination();
    if (!dest || !this.payload.table) {
      return;
    }
    if (!dest.range.collapsed() && dest.range.mode !== "cell") {
      const deleted = this.ctx.mutator.deleteRange(dest.document, dest.story, dest.range);
      this.patches.push(deleted);
      dest.pos = deleted.caret;
      this.ctx.relayout.apply(deleted.impact);
    }
    const table = new TableSnapshot().materialize(this.payload.table);
    const patch = this.ctx.mutator.insertTable(dest.document, dest.story, dest.pos, table);
    this.patches.push(patch);
    this.ctx.relayout.apply(patch.impact);
    this.ctx.selection.collapse(patch.caret);
    this.ctx.afterEdit(patch.impact);
  }

  private tableDestination(): { document: Document; story: StoryRef; pos: CaretPos; range: SelRange } | null {
    const ranges = this.ctx.selection.normalized();
    const cell = ranges.find((range) => range.mode === "cell" && range.story.slot === "cell");
    if (cell && cell.story.slot === "cell") {
      const host = this.ctx.relayout.findCellHost(cell.story.cell);
      if (host) {
        const document = this.ctx.documentOf(host.parent);
        if (document) {
          return {
            document,
            story: host.parent,
            pos: this.afterParagraph(document, host.paragraph, host.parent),
            range: cell,
          };
        }
      }
    }
    const range = this.targets()[0];
    const document = range ? this.ctx.documentOf(range.story) : null;
    if (!range || !document) {
      return null;
    }
    return { document, story: range.story, pos: range.start, range };
  }

  private afterParagraph(document: Document, paragraph: Paragraph, story: StoryRef): CaretPos {
    let last = document.words.head;
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph) {
        last = node;
      }
      node = node.next;
    }
    return new CaretPos(story, last, true);
  }

  private insertPayload(document: Document, story: StoryRef, start: CaretPos): void {
    const paragraphs = this.payload.paragraphs;
    if (!paragraphs.length) {
      this.insertRun(document, story, start, this.payload.text, this.ctx.pendingRunStyle?.());
      return;
    }
    let pos = start;
    paragraphs.forEach((paragraph, index) => {
      if (index > 0) {
        pos = this.insertBreak(document, story, pos, paragraph);
      }
      for (const run of paragraph.runs) {
        if (run.drawing) {
          pos = this.insertDrawing(document, story, pos, drawingFromSnapshot(run.drawing), pictureOnly(this.payload));
        } else if (run.enclosed && run.text) {
          pos = this.insertEnclosed(document, story, pos, run.text, this.styleOf(run.style), run.enclosed);
        } else if (run.asianLayout && run.text) {
          pos = this.insertAsianLayout(document, story, pos, run.text, this.styleOf(run.style), run.asianLayout);
        } else {
          pos = this.insertRun(document, story, pos, run.text, this.styleOf(run.style));
        }
      }
    });
  }

  private insertBreak(
    document: Document,
    story: StoryRef,
    pos: CaretPos,
    paragraph: ClipboardParagraph,
  ): CaretPos {
    const patch = this.ctx.mutator.insert(document, story, pos, "\n");
    this.patches.push(patch);
    const created = patch.createdParagraphs.at(-1)?.paragraph;
    if (created) {
      created.attrs = { ...paragraph.attrs };
      created.inheritedRunStyle = paragraph.inheritedRunStyle
        ? { ...paragraph.inheritedRunStyle }
        : created.inheritedRunStyle;
      created.changed = true;
    }
    refreshNumbering(document, patch);
    this.ctx.relayout.apply(patch.impact);
    this.ctx.selection.collapse(patch.caret);
    this.ctx.afterEdit(patch.impact);
    return patch.caret;
  }

  private insertDrawing(
    document: Document,
    story: StoryRef,
    pos: CaretPos,
    drawing: Drawing,
    select: boolean,
  ): CaretPos {
    const patch = this.ctx.mutator.insertDrawing(document, story, pos, drawing);
    if (!patch.inserted.length) {
      return pos;
    }
    this.patches.push(patch);
    this.ctx.relayout.apply(patch.impact);
    const node = patch.inserted.find((item) => item.data.kind === "drawing");
    if (select && node) {
      this.ctx.selection.setRange(
        new SelRange(story, new CaretPos(story, node, false), new CaretPos(story, node, true)),
      );
    } else {
      this.ctx.selection.collapse(patch.caret);
    }
    this.ctx.afterEdit(patch.impact);
    return patch.caret;
  }

  private insertEnclosed(
    document: Document,
    story: StoryRef,
    pos: CaretPos,
    text: string,
    style: RunStyle | undefined,
    enclosed: NonNullable<ClipboardPayload["paragraphs"][number]["runs"][number]["enclosed"]>,
  ): CaretPos {
    const patch = this.ctx.mutator.insertEnclosed(document, story, pos, text, style, enclosed);
    if (!patch.inserted.length) {
      return pos;
    }
    this.patches.push(patch);
    this.ctx.relayout.apply(patch.impact);
    this.ctx.selection.collapse(patch.caret);
    this.ctx.afterEdit(patch.impact);
    return patch.caret;
  }

  private insertAsianLayout(
    document: Document,
    story: StoryRef,
    pos: CaretPos,
    text: string,
    style: RunStyle | undefined,
    asianLayout: NonNullable<ClipboardPayload["paragraphs"][number]["runs"][number]["asianLayout"]>,
  ): CaretPos {
    const patch = this.ctx.mutator.insertAsianLayout(document, story, pos, text, style, asianLayout);
    if (!patch.inserted.length) {
      return pos;
    }
    this.patches.push(patch);
    this.ctx.relayout.apply(patch.impact);
    this.ctx.selection.collapse(patch.caret);
    this.ctx.afterEdit(patch.impact);
    return patch.caret;
  }

  private insertRun(
    document: Document,
    story: StoryRef,
    pos: CaretPos,
    text: string,
    style?: RunStyle,
  ): CaretPos {
    if (!text) {
      return pos;
    }
    const patch = this.ctx.mutator.insert(document, story, pos, text, style);
    this.patches.push(patch);
    refreshNumbering(document, patch);
    this.ctx.relayout.apply(patch.impact);
    this.ctx.selection.collapse(patch.caret);
    this.ctx.afterEdit(patch.impact);
    return patch.caret;
  }

  private styleOf(style: RunStyle): RunStyle | undefined {
    if (Object.keys(style).length) {
      return style;
    }
    return this.ctx.pendingRunStyle?.();
  }

  private shouldSplitBeforeTable(document: Document, pos: CaretPos): boolean {
    const node = pos.node;
    const paragraph = node?.data.paragraph;
    if (!node || !paragraph || paragraph.isTable) {
      return false;
    }
    const first = this.firstWordOf(document, paragraph);
    if (first && node === first && !pos.after) {
      return false;
    }
    let cursor = pos.after ? node.next : node;
    while (cursor && cursor.data.paragraph === paragraph) {
      if (!cursor.data.isEnterChar()) {
        return true;
      }
      cursor = cursor.next;
    }
    return false;
  }

  private isParagraphEmpty(document: Document, paragraph: Paragraph): boolean {
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph && !node.data.isEnterChar()) {
        return false;
      }
      node = node.next;
    }
    return true;
  }

  private firstWordOf(document: Document, paragraph: Paragraph) {
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph) {
        return node;
      }
      node = node.next;
    }
    return null;
  }

  private targets(): SelRange[] {
    const ranges = this.ctx.selection.normalized();
    if (!ranges.length) {
      return [];
    }
    const selectionText = new SelectionText();
    return ranges.map((range) => {
      if (range.mode !== "cell" || range.story.slot !== "cell") {
        return range;
      }
      return selectionText.cellContentRange(range.story.cell);
    });
  }
}

function pictureOnly(payload: ClipboardPayload): boolean {
  const runs = payload.paragraphs.flatMap((paragraph) => paragraph.runs);
  return !payload.table && !payload.blocks?.length && runs.length === 1 && !!runs[0]?.drawing && !runs[0].text;
}
