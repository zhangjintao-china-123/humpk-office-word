import type { TableInsets, TableLength } from "../../../../model/table/Table";
import { twipToPx } from "../../../../shared/units";
import { attr, first } from "../../ooxml/XmlQuery";

const SIDES = [
  ["w:top", "top"],
  ["w:left", "left"],
  ["w:bottom", "bottom"],
  ["w:right", "right"],
] as const;

export function readLength(node: Element | null): TableLength | undefined {
  if (!node) {
    return undefined;
  }
  const raw = Number(attr(node, "w:w"));
  if (!Number.isFinite(raw)) {
    return undefined;
  }
  const type = attr(node, "w:type") || "dxa";
  if (type === "auto" || type === "nil") {
    return { type: "auto", value: 0 };
  }
  if (type === "pct") {
    return { type: "pct", value: raw / 50 };
  }
  return { type: "dxa", value: twipToPx(raw) };
}

/** 边距元素出现时，没写的边按 0。整个元素缺省则交给排版用 Word 默认值。 */
export function readInsets(node: Element | null): TableInsets | undefined {
  if (!node) {
    return undefined;
  }
  const insets: TableInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const [name, side] of SIDES) {
    insets[side] = sidePx(first(node, name));
  }
  return insets;
}

function sidePx(node: Element | null): number {
  if (!node) {
    return 0;
  }
  const raw = Number(attr(node, "w:w"));
  if (!Number.isFinite(raw) || attr(node, "w:type") === "nil") {
    return 0;
  }
  return twipToPx(raw);
}
