import { CaretPos } from "../selection/CaretPos";
import { SelectionText } from "../selection/SelectionText";
import type { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
import type { Document } from "../model/document/Document";
import type { Paragraph } from "../model/block/Paragraph";
import type { RunStyle } from "../model/style/RunStyle";
import { ClipboardPayload, type ClipboardParagraph } from "./ClipboardPayload";
import { TableSnapshot } from "./TableSnapshot";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import type { MutationPatch } from "./MutationPatch";

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
      const impact = this.ctx.mutator.invert(document, patch);
      this.ctx.relayout.apply(impact);
      this.ctx.selection.collapse(patch.originalCaret);
      this.ctx.afterEdit(impact);
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
        pos = this.insertRun(document, story, pos, run.text, this.styleOf(run.style));
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
