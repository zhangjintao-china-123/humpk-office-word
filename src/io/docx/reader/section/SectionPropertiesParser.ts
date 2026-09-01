import { parseNumber, twipToPx } from "../../../../shared/units";
import type { Section } from "../../../../model/document/Section";
import { attr, first } from "../../ooxml/XmlQuery";

export class SectionPropertiesParser {
  apply(sectPr: Element, section: Section): void {
    const size = first(sectPr, "w:pgSz");
    const width = parseNumber(attr(size, "w:w"));
    const height = parseNumber(attr(size, "w:h"));
    if (width != null) {
      section.pageWidthPx = twipToPx(width);
    }
    if (height != null) {
      section.pageHeightPx = twipToPx(height);
    }

    const margin = first(sectPr, "w:pgMar");
    const left = parseNumber(attr(margin, "w:left"));
    const right = parseNumber(attr(margin, "w:right"));
    const top = parseNumber(attr(margin, "w:top"));
    const bottom = parseNumber(attr(margin, "w:bottom"));
    const header = parseNumber(attr(margin, "w:header"));
    const footer = parseNumber(attr(margin, "w:footer"));
    if (left != null) {
      section.leftMarginPx = twipToPx(left);
    }
    if (right != null) {
      section.rightMarginPx = twipToPx(right);
    }
    if (top != null) {
      section.topMarginPx = twipToPx(top);
    }
    if (bottom != null) {
      section.bottomMarginPx = twipToPx(bottom);
    }
    if (header != null) {
      section.headerFromEdgePx = twipToPx(header);
    }
    if (footer != null) {
      section.footerFromEdgePx = twipToPx(footer);
    }

    const titlePg = first(sectPr, "w:titlePg");
    if (titlePg) {
      const value = attr(titlePg, "w:val");
      section.titlePg = value == null || value === "1" || value === "on" || value === "true";
    }

    const grid = first(sectPr, "w:docGrid");
    section.docGridType = attr(grid, "w:type");
    const pitch = parseNumber(attr(grid, "w:linePitch"));
    if (pitch != null && pitch > 0) {
      section.linePitchPx = twipToPx(pitch);
    }
  }
}
