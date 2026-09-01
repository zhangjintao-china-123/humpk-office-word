export function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error(parseError.textContent || "XML parse error");
  }
  return doc;
}

function localNameOf(name: string): string {
  const index = name.indexOf(":");
  return index >= 0 ? name.slice(index + 1) : name;
}

export function matchesName(el: Element, expected: string): boolean {
  return el.nodeName === expected || el.localName === localNameOf(expected);
}

function elementChildren(node: ParentNode | null): Element[] {
  if (!node) {
    return [];
  }
  return Array.from(node.children);
}

export function children(node: ParentNode | null, name: string): Element[] {
  return elementChildren(node).filter((child) => matchesName(child, name));
}

export function first(node: ParentNode | null, name: string): Element | null {
  if (!node) {
    return null;
  }
  for (const child of elementChildren(node)) {
    if (matchesName(child, name)) {
      return child;
    }
  }
  return null;
}

export function descendants(node: ParentNode | null, name: string): Element[] {
  if (!node) {
    return [];
  }
  const local = localNameOf(name);
  const byTag = Array.from((node as Document | Element).getElementsByTagName(name));
  if (byTag.length > 0) {
    return byTag;
  }
  return Array.from((node as Document | Element).getElementsByTagName(local));
}

export function attr(el: Element | null, name: string): string | undefined {
  if (!el) {
    return undefined;
  }
  const direct = el.getAttribute(name);
  if (direct != null) {
    return direct;
  }
  const local = localNameOf(name);
  const unprefixed = el.getAttribute(local);
  if (unprefixed != null) {
    return unprefixed;
  }
  for (const item of Array.from(el.attributes)) {
    if (item.localName === local) {
      return item.value;
    }
  }
  return undefined;
}

export function textOf(el: Element | null): string {
  return el?.textContent ?? "";
}
