import type { DocComment, DocNote } from "../../../../model/review/Review";
import { escapeXml } from "../../ooxml/XmlEscape";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function commentsXml(comments: DocComment[]): string {
  const body = comments
    .map((comment) => {
      const author = comment.author ? ` w:author="${escapeXml(comment.author)}"` : "";
      const date = comment.date ? ` w:date="${escapeXml(comment.date)}"` : "";
      const initials = comment.initials ? ` w:initials="${escapeXml(comment.initials)}"` : "";
      return `<w:comment w:id="${escapeXml(comment.id)}"${author}${date}${initials}><w:p><w:r><w:t>${escapeXml(comment.text)}</w:t></w:r></w:p></w:comment>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W_NS}">${body}</w:comments>`;
}

export function footnotesXml(notes: DocNote[]): string {
  const reserved = [
    `<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>`,
    `<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`,
  ];
  const body = notes
    .map(
      (note) =>
        `<w:footnote w:id="${escapeXml(note.id)}"><w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>${escapeXml(note.text)}</w:t></w:r></w:p></w:footnote>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="${W_NS}">${reserved.join("")}${body}</w:footnotes>`;
}
