import type { MathExpr } from "../../../../model/math/MathExpr";
import { attr, children, descendants, first, matchesName, textOf } from "../../ooxml/XmlQuery";

export function parseMath(node: Element): MathExpr {
  const math = matchesName(node, "m:oMath") ? node : (first(node, "m:oMath") ?? node);
  return { type: "row", items: parseList(math) };
}

export function serializeElement(node: Element): string {
  return new XMLSerializer().serializeToString(node);
}

function parseList(node: Element): MathExpr[] {
  const items: MathExpr[] = [];
  for (const child of Array.from(node.children)) {
    const expr = parseNode(child);
    if (expr) {
      items.push(expr);
    }
  }
  if (!items.length) {
    const text = descendants(node, "m:t").map((item) => textOf(item)).join("");
    if (text) {
      items.push({ type: "text", text });
    }
  }
  return items;
}

function parseNode(node: Element): MathExpr | undefined {
  if (matchesName(node, "m:r")) {
    const text = children(node, "m:t").map((item) => textOf(item)).join("");
    return text ? { type: "text", text } : undefined;
  }
  if (matchesName(node, "m:f")) {
    return { type: "frac", num: row(first(node, "m:num")), den: row(first(node, "m:den")) };
  }
  if (matchesName(node, "m:sSup")) {
    return { type: "sup", base: row(first(node, "m:e")), sup: row(first(node, "m:sup")) };
  }
  if (matchesName(node, "m:sSub")) {
    return { type: "sub", base: row(first(node, "m:e")), sub: row(first(node, "m:sub")) };
  }
  if (matchesName(node, "m:sSubSup")) {
    return {
      type: "subsup",
      base: row(first(node, "m:e")),
      sub: row(first(node, "m:sub")),
      sup: row(first(node, "m:sup")),
    };
  }
  if (matchesName(node, "m:rad")) {
    return { type: "rad", body: row(first(node, "m:e")) };
  }
  if (matchesName(node, "m:d")) {
    const props = first(node, "m:dPr");
    return {
      type: "delim",
      open: attr(first(props, "m:begChr"), "m:val") || "(",
      close: attr(first(props, "m:endChr"), "m:val") || ")",
      body: row(first(node, "m:e")),
    };
  }
  if (matchesName(node, "m:e") || matchesName(node, "m:oMath")) {
    return { type: "row", items: parseList(node) };
  }
  const nested = parseList(node);
  return nested.length ? { type: "row", items: nested } : undefined;
}

function row(node: Element | null): MathExpr {
  return { type: "row", items: node ? parseList(node) : [] };
}
