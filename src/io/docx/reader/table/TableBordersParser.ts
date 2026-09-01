import type { TableBorder, TableBorders } from "../../../../model/table/Table";
import { attr, first } from "../../ooxml/XmlQuery";

const SIDES = [
  ["w:top", "top"],
  ["w:left", "left"],
  ["w:bottom", "bottom"],
  ["w:right", "right"],
  ["w:insideH", "insideH"],
  ["w:insideV", "insideV"],
  ["w:tl2br", "tl2br"],
  ["w:tr2bl", "tr2bl"],
] as const;

export class TableBordersParser {
  parse(parent: Element | null, tag: "w:tcBorders" | "w:tblBorders"): TableBorders | undefined {
    const root = first(parent, tag);
    if (!root) {
      return undefined;
    }
    const borders: TableBorders = {};
    let any = false;
    for (const [name, side] of SIDES) {
      const border = this.read(first(root, name));
      if (border) {
        borders[side] = border;
        any = true;
      }
    }
    return any ? borders : undefined;
  }

  private read(node: Element | null): TableBorder | undefined {
    if (!node) {
      return undefined;
    }
    const raw = attr(node, "w:color");
    return {
      type: attr(node, "w:val"),
      size: attr(node, "w:sz"),
      color: !raw || raw === "auto" ? "#000000" : raw.startsWith("#") ? raw : `#${raw}`,
    };
  }
}
