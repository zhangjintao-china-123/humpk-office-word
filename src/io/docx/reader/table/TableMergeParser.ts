import { attr, first } from "../../ooxml/XmlQuery";

export interface CellMerge {
  colSpan: number;
  rowSpan: number;
  continueRow: boolean;
}

export class TableMergeParser {
  parse(tcPr: Element | null): CellMerge {
    const merge: CellMerge = {
      colSpan: 1,
      rowSpan: 1,
      continueRow: false,
    };
    if (!tcPr) {
      return merge;
    }
    const span = attr(first(tcPr, "w:gridSpan"), "w:val");
    if (span) {
      merge.colSpan = Number(span) || 1;
    }
    const vMerge = first(tcPr, "w:vMerge");
    if (vMerge) {
      const val = attr(vMerge, "w:val");
      merge.continueRow = val !== "restart";
      if (val === "restart") {
        merge.rowSpan = 1;
      }
    }
    return merge;
  }
}
