import type { DocProps } from "../../../model/document/Document";
import { parseXml } from "../ooxml/XmlQuery";

export class CorePropsParser {
  parse(xml: string | undefined): DocProps {
    if (!xml) {
      return {};
    }
    const root = parseXml(xml).documentElement;
    const props: DocProps = {};
    const title = textOf(root, "title");
    const creator = textOf(root, "creator");
    const created = dateOf(root, "created");
    const modified = dateOf(root, "modified");
    if (title) {
      props.title = title;
    }
    if (creator) {
      props.creator = creator;
    }
    if (created) {
      props.created = created;
    }
    if (modified) {
      props.modified = modified;
    }
    return props;
  }
}

function textOf(root: Element, local: string): string | undefined {
  for (const node of Array.from(root.getElementsByTagName("*"))) {
    if (node.localName === local) {
      const text = node.textContent?.trim();
      return text || undefined;
    }
  }
  return undefined;
}

function dateOf(root: Element, local: string): Date | undefined {
  const text = textOf(root, local);
  if (!text) {
    return undefined;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
