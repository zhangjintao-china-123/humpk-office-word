import type { DocComment, DocNote } from "../../../../model/review/Review";
import { attr, children, descendants, parseXml, textOf } from "../../ooxml/XmlQuery";

export class ReviewParser {
  comments(xml: string | undefined): DocComment[] {
    if (!xml) {
      return [];
    }
    return children(parseXml(xml).documentElement, "w:comment").map((node) => ({
      id: attr(node, "w:id") ?? "",
      author: attr(node, "w:author") ?? "",
      date: attr(node, "w:date"),
      initials: attr(node, "w:initials"),
      text: paragraphText(node),
    })).filter((comment) => comment.id);
  }

  footnotes(xml: string | undefined): DocNote[] {
    if (!xml) {
      return [];
    }
    return children(parseXml(xml).documentElement, "w:footnote")
      .filter((node) => !attr(node, "w:type"))
      .map((node) => ({
        id: attr(node, "w:id") ?? "",
        text: paragraphText(node),
      }))
      .filter((note) => note.id);
  }
}

function paragraphText(root: Element): string {
  const paragraphs = children(root, "w:p");
  const source = paragraphs.length ? paragraphs : [root];
  return source
    .map((paragraph) => descendants(paragraph, "w:t").map((node) => textOf(node)).join(""))
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}
