import type { Block } from "../block/Block";
import type { Document } from "../document/Document";

/** 一条批注。text 是批注正文。 */
export interface DocComment {
  id: string;
  author: string;
  date?: string;
  initials?: string;
  text: string;
}

/** 一条脚注。id 对应正文里的 w:footnoteReference。 */
export interface DocNote {
  id: string;
  text: string;
}

/** 插入或删除修订。 */
export interface RevisionMark {
  kind: "ins" | "del";
  id: string;
  author?: string;
  date?: string;
}

export function sameRevision(a: RevisionMark | undefined, b: RevisionMark | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

export function sameIds(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function nextReviewId(ids: string[]): string {
  let max = 0;
  for (const id of ids) {
    const value = Number(id);
    if (Number.isFinite(value)) {
      max = Math.max(max, value);
    }
  }
  return String(max + 1);
}

/** 给脚注和批注引用填上可见序号，并标成上标。 */
export function numberNotes(document: Document): void {
  const notes = new Map(document.footnotes.map((note, index) => [note.id, String(index + 1)]));
  const comments = new Map(document.comments.map((comment, index) => [comment.id, String(index + 1)]));
  eachBlock(document, (block) => {
    if (block.footnoteId) {
      block.text = notes.get(block.footnoteId) ?? block.footnoteId;
      block.style = { ...block.style, color: block.style.color ?? "#1F4E79", fontSizePx: block.style.fontSizePx ?? 11 };
    }
    if (block.commentRef) {
      block.text = comments.get(block.commentRef) ?? block.commentRef;
      block.style = { ...block.style, color: block.style.color ?? "#C45911", fontSizePx: block.style.fontSizePx ?? 11 };
    }
    if (block.commentIds?.length && !block.style.backgroundColor) {
      block.style = { ...block.style, backgroundColor: "#FFF2CC" };
    }
  });
}

export function eachBlock(document: Document, visit: (block: Block) => void): void {
  const visitStory = (story: Document): void => {
    story.paragraphs.each((node) => {
      for (const block of node.data.blocks) {
        visit(block);
      }
      const table = node.data.table;
      if (!table) {
        return;
      }
      for (const row of table.rows) {
        for (const cell of row.cells) {
          visitStory(cell.document);
        }
      }
    });
  };
  visitStory(document);
}
