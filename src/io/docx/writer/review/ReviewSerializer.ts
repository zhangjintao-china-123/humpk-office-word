import type { DocComment, DocNote } from "../../../../model/review/Review";
import { eachBlock } from "../../../../model/review/Review";
import type { Block } from "../../../../model/block/Block";
import type { Document } from "../../../../model/document/Document";
import { escapeXml } from "../../ooxml/XmlEscape";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function commentBoundaries(document: Document): { start: Map<Block, string[]>; end: Map<Block, string[]> } {
  const first = new Map<string, Block>();
  const last = new Map<string, Block>();
  eachBlock(document, (block) => {
    for (const id of block.commentIds ?? []) {
      if (!first.has(id)) first.set(id, block);
      last.set(id, block);
    }
  });
  const byBlock = (bounds: Map<string, Block>): Map<Block, string[]> => {
    const found = new Map<Block, string[]>();
    for (const [id, block] of bounds) {
      const ids = found.get(block) ?? [];
      ids.push(id);
      found.set(block, ids);
    }
    return found;
  };
  return { start: byBlock(first), end: byBlock(last) };
}

export function commentsXml(comments: DocComment[]): string {
  const body = comments
    .map((comment) => {
      const author = comment.author ? ` w:author="${escapeXml(comment.author)}"` : "";
      const date = comment.date ? ` w:date="${escapeXml(comment.date)}"` : "";
      const initials = comment.initials ? ` w:initials="${escapeXml(comment.initials)}"` : "";
      const paragraphs = comment.text.split(/\r\n|\r|\n/).map((line) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("");
      return `<w:comment w:id="${escapeXml(comment.id)}"${author}${date}${initials}>${paragraphs}</w:comment>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W_NS}">${body}</w:comments>`;
}

export function notesXml(notes: DocNote[], kind: "footnote" | "endnote"): string {
  const reserved = [
    `<w:${kind} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:${kind}>`,
    `<w:${kind} w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:${kind}>`,
  ];
  const body = notes.map((note) => {
    const paragraphs = note.text.split(/\r\n|\r|\n/).map((line, index) => {
      const marker = index ? "" : `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:${kind}Ref/></w:r>`;
      return `<w:p>${marker}<w:r><w:t xml:space="preserve">${escapeXml(index ? line : ` ${line}`)}</w:t></w:r></w:p>`;
    });
    return `<w:${kind} w:id="${escapeXml(note.id)}">${paragraphs.join("")}</w:${kind}>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${kind}s xmlns:w="${W_NS}">${reserved.join("")}${body.join("")}</w:${kind}s>`;
}
