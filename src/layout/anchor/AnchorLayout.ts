import type { Document } from "../../model/document/Document";
import type { Drawing } from "../../model/inline/Drawing";
import type { Line } from "../../model/line/Line";
import type { Paragraph } from "../../model/block/Paragraph";
import type { LayoutConstraints } from "../LayoutConstraints";
import { PlacedAnchor } from "../../model/inline/PlacedAnchor";
import { WrapScanline } from "./WrapScanline";

const WRAP_GAP = 8;

interface CharPoint {
  x: number;
  y: number;
}

export class AnchorLayout {
  private readonly scanline = new WrapScanline();

  run(document: Document, lines: Line[], constraints: LayoutConstraints): PlacedAnchor[] {
    const placed = this.collect(document).map(({ drawing, paragraph }) =>
      this.place(drawing, paragraph, constraints),
    );
    this.applyNowrap(placed, lines);
    this.applySideWrap(placed, lines, constraints.contentWidth);
    return placed;
  }

  private collect(document: Document): { drawing: Drawing; paragraph: Paragraph }[] {
    const found: { drawing: Drawing; paragraph: Paragraph }[] = [];
    document.paragraphs.each((node) => {
      for (const block of node.data.blocks) {
        if (block.drawing?.position === "anchor") {
          found.push({ drawing: block.drawing, paragraph: node.data });
        }
      }
    });
    return found;
  }

  private place(drawing: Drawing, paragraph: Paragraph, constraints: LayoutConstraints): PlacedAnchor {
    const placed = new PlacedAnchor(drawing, paragraph);
    const host = paragraph.lines[0] ?? paragraph.getPreParagraph()?.lines.at(-1);
    const pageH = Math.max(1, constraints.contentHeight);
    const pageStart = host ? Math.floor(host.top / pageH) * pageH : 0;
    const atChar = this.locateChar(paragraph, this.charIndex(paragraph, drawing));
    placed.x = this.resolveX(drawing, constraints, atChar);
    placed.y = this.resolveY(drawing, host?.top ?? 0, pageStart, pageH, constraints.contentHeight, atChar);
    const set = drawing.anchorSet;
    placed.wrapLeft = placed.x - (set?.distLeft ?? 0);
    placed.wrapRight = placed.x + placed.width + (set?.distRight ?? 0);
    placed.wrapTop = placed.y - (set?.distTop ?? 0);
    placed.wrapBottom = placed.y + placed.height + (set?.distBottom ?? 0);
    return placed;
  }

  private charIndex(paragraph: Paragraph, drawing: Drawing): number {
    let index = 0;
    for (const block of paragraph.blocks) {
      if (block.drawing === drawing) {
        return index;
      }
      index += block.text.length;
    }
    return 0;
  }

  private locateChar(paragraph: Paragraph, index: number): CharPoint | null {
    let seen = 0;
    let fallback: CharPoint | null = null;
    for (const line of paragraph.lines) {
      let node = line.startNode;
      for (let i = 0; i < line.length; i += 1) {
        if (!node) {
          break;
        }
        const word = node.data;
        if (word.kind === "text" && !word.isEnterChar()) {
          if (seen >= index) {
            return { x: word.left, y: line.top };
          }
          fallback = { x: word.left + word.kernedWidth, y: line.top };
          seen += 1;
        }
        node = node.next;
      }
    }
    return fallback;
  }

  private resolveX(drawing: Drawing, constraints: LayoutConstraints, atChar: CharPoint | null): number {
    const set = drawing.anchorSet;
    const width = drawing.width;
    const contentWidth = constraints.contentWidth;
    const align = set?.leftAlign;
    if (align === "center") {
      return (contentWidth - width) / 2;
    }
    if (align === "right") {
      return contentWidth - width;
    }
    if (align === "left") {
      return 0;
    }
    const offset = set?.left ?? 0;
    const from = set?.leftFrom;
    if (from === "character") {
      return (atChar?.x ?? 0) + offset;
    }
    if (from === "page") {
      return offset - (constraints.leftMargin ?? 0);
    }
    if (from === "rightMargin") {
      return contentWidth - width - offset;
    }
    return offset;
  }

  private resolveY(
    drawing: Drawing,
    hostTop: number,
    pageStart: number,
    pageH: number,
    contentHeight: number,
    atChar: CharPoint | null,
  ): number {
    const set = drawing.anchorSet;
    const height = drawing.height;
    const align = set?.topAlign;
    if (align === "center") {
      return pageStart + (pageH - height) / 2;
    }
    if (align === "bottom") {
      return pageStart + contentHeight - height;
    }
    if (align === "top") {
      return pageStart;
    }
    const offset = set?.top ?? 0;
    const from = set?.topFrom;
    if (from === "character") {
      return (atChar?.y ?? hostTop) + offset;
    }
    if (from === "page" || from === "margin" || from === "topMargin") {
      return pageStart + offset;
    }
    if (from === "bottomMargin") {
      return pageStart + contentHeight - height - offset;
    }
    if (from === "line") {
      return hostTop + offset;
    }
    return hostTop + offset;
  }

  private applyNowrap(anchors: PlacedAnchor[], lines: Line[]): void {
    const blocks = anchors.filter((anchor) => anchor.wrap === "nowrap").sort((a, b) => a.y - b.y);
    for (const anchor of blocks) {
      const hostTop = anchor.paragraph.lines[0]?.top ?? anchor.y;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.top + line.height <= anchor.wrapTop) {
          continue;
        }
        if (line.top >= anchor.wrapBottom) {
          continue;
        }
        if (line.top + 0.01 < hostTop && line.paragraph !== anchor.paragraph) {
          continue;
        }
        const shift = anchor.wrapBottom - line.top;
        if (shift <= 0) {
          continue;
        }
        for (let j = i; j < lines.length; j += 1) {
          lines[j].top += shift;
        }
        break;
      }
    }
  }

  private applySideWrap(anchors: PlacedAnchor[], lines: Line[], contentWidth: number): void {
    const wrap = anchors.filter(
      (anchor) => anchor.wrap === "square" || anchor.wrap === "tight" || anchor.wrap === "through",
    );
    for (const line of lines) {
      if (line.type === "table" || line.type === "page") {
        continue;
      }
      for (const anchor of wrap) {
        const obstacle = this.obstacleForLine(anchor, line);
        if (!obstacle) {
          continue;
        }
        const side = anchor.drawing.anchorSet?.wrapSide ?? "both";
        if (side === "left") {
          continue;
        }
        const nearLeft = obstacle.left <= line.leftBlankWidth + 4;
        if (side === "both" && !nearLeft && obstacle.left > contentWidth * 0.45) {
          continue;
        }
        const delta = obstacle.right + WRAP_GAP - line.leftBlankWidth;
        if (delta <= 0) {
          continue;
        }
        this.shiftWords(line, delta);
      }
    }
  }

  private obstacleForLine(anchor: PlacedAnchor, line: Line): { left: number; right: number } | null {
    const mid = line.top + line.height * 0.5;
    if (mid < anchor.wrapTop || mid > anchor.wrapBottom) {
      return null;
    }
    const polygon = anchor.drawing.anchorSet?.polygon;
    const contour = anchor.wrap === "tight" || anchor.wrap === "through";
    if (contour && polygon && polygon.length >= 3) {
      const localY = mid - anchor.y;
      if (anchor.wrap === "through") {
        const first = this.scanline.intervalsAt(polygon, localY)[0];
        if (!first) {
          return null;
        }
        return this.toContent(anchor, first);
      }
      const range = this.scanline.rangeAt(polygon, localY);
      if (!range) {
        return null;
      }
      return this.toContent(anchor, range);
    }
    return { left: anchor.wrapLeft, right: anchor.wrapRight };
  }

  private toContent(anchor: PlacedAnchor, local: { left: number; right: number }): { left: number; right: number } {
    const distL = anchor.drawing.anchorSet?.distLeft ?? 0;
    const distR = anchor.drawing.anchorSet?.distRight ?? 0;
    return {
      left: anchor.x + local.left - distL,
      right: anchor.x + local.right + distR,
    };
  }

  private shiftWords(line: Line, delta: number): void {
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      node.data.left += delta;
      node = node.next;
    }
  }
}
