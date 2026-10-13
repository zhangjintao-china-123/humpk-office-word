import type { FieldValues } from "../../model/document/PageLabel";
import { Draw } from "../canvas/Draw";
import { Line } from "../../model/line/Line";
import type { Drawing } from "../../model/inline/Drawing";
import type { Block } from "../../model/block/Block";
import type { Word } from "../../model/inline/Word";
import { CELL_PAD } from "../../layout/LayoutConstants";
import { fillColorOf, fontCss } from "../../layout/measure/FontSpec";
import { imageCache, type ImageCache } from "../image/ImageCache";
import { TableBorderPainter } from "../table/TableBorderPainter";
import { TableGeometry } from "../table/TableGeometry";

/** 画正文行、行内图和表格切片。 */

export class StoryPainter {
  private readonly tables = new TableGeometry();
  private readonly borders = new TableBorderPainter();

  constructor(private readonly images: ImageCache = imageCache) {}

  paintLine(draw: Draw, line: Line, x: number, top: number, pageNumber?: number, fields?: FieldValues): void {
    if (line.type === "table") {
      this.paintTable(draw, line, x, top);
      return;
    }
    const exact = line.paragraph?.attrs.lineRule === "exact";
    if (exact) {
      const box = Math.max(0, line.height - line.beforeHeight - line.afterHeight);
      draw.save();
      draw.beginPath();
      draw.rect(x, top + line.beforeHeight, Math.max(line.width, 1) + line.leftBlankWidth + line.rightBlankWidth + 8, box);
      draw.clip();
    }
    if (line.isFirst && line.outlineLabel) {
      this.paintOutline(draw, line, x, top);
    }
    let node = line.startNode;
    const paintedFields = new Set<Block>();
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      this.paintWord(draw, node.data, line, x, top, pageNumber, paintedFields, fields);
      node = node.next;
    }
    if (line.isLast && line.paragraph?.toc?.role === "entry") {
      this.paintTocPage(draw, line, x, top);
    }
    if (line.isLast) {
      this.paintBottomBorder(draw, line, x, top);
    }
    if (exact) {
      draw.restore();
    }
  }

  paintDrawing(draw: Draw, drawing: Drawing, x: number, y: number): void {
    const { width, height, url } = drawing;
    const img = this.images.ensure(url);
    if (img && width > 0 && height > 0) {
      draw.drawImage(img, x, y, width, height);
      return;
    }
    draw.setFill("#dddddd");
    draw.fillRect(x, y, Math.max(width, 24), Math.max(height, 16));
  }

  private paintOutline(draw: Draw, line: Line, x: number, top: number): void {
    const word = line.startNode?.data;
    if (word) {
      this.applyStyle(draw, word);
    } else {
      draw.setFill("#111111");
    }
    const height = Math.max(line.maxCharHeight, 14);
    const boxTop = top + line.beforeHeight + line.contentOffsetY;
    const baseline = boxTop + height * 0.85;
    if (word) {
      draw.setFont(fontCss(word.getStyle(), word.intChar));
    }
    const width = draw.measureText(line.outlineLabel);
    const textLeft = x + line.leftBlankWidth;
    draw.fillText(line.outlineLabel, Math.max(x, textLeft - width - 4), baseline);
  }

  private paintWord(
    draw: Draw,
    word: Word,
    line: Line,
    x: number,
    top: number,
    pageNumber?: number,
    paintedFields?: Set<Block>,
    fields?: FieldValues,
  ): void {
    if (word.kind === "drawing" && word.drawing) {
      this.paintDrawing(draw, word.drawing, x + word.left, top + line.beforeHeight + line.contentOffsetY);
      return;
    }
    if (word.kind !== "text" || word.isEnterChar() || word.char === "\t") {
      return;
    }
    const style = word.getStyle();
    const left = x + word.left;
    const boxTop = top + line.beforeHeight + line.contentOffsetY;
    const height = Math.max(line.maxCharHeight, 14);
    const fill = style?.backgroundColor ?? style?.highlight;
    if (fill) {
      draw.setFill(fill);
      draw.fillRect(left, boxTop, Math.max(word.kernedWidth, 1), height);
    }
    this.applyStyle(draw, word);
    const baseline = boxTop + height * 0.85;
    const field = word.block?.field;
    if (field && word.block) {
      if (paintedFields?.has(word.block)) {
        return;
      }
      paintedFields?.add(word.block);
      const text = fields?.[field] ?? (field === "PAGE" && pageNumber != null ? String(pageNumber) : word.block.text);
      draw.fillText(text, left, baseline);
      return;
    }
    draw.fillText(word.char, left, baseline);
    const ink = fillColorOf(style);
    if (style?.underline && style.underline !== "none") {
      draw.setStroke(ink, 1);
      draw.beginPath();
      draw.moveTo(left, baseline + 2);
      draw.lineTo(left + word.kernedWidth, baseline + 2);
      draw.stroke();
    }
    if (style?.strike) {
      draw.setStroke(ink, 1);
      draw.beginPath();
      draw.moveTo(left, boxTop + height * 0.5);
      draw.lineTo(left + word.kernedWidth, boxTop + height * 0.5);
      draw.stroke();
    }
  }

  private paintBottomBorder(draw: Draw, line: Line, x: number, top: number): void {
    const border = line.paragraph?.attrs.borderBottom;
    const width = line.contentWidth;
    if (!border || border.val === "nil" || border.val === "none" || width <= 0) {
      return;
    }
    const eighths = Number(border.sz);
    const thickness = Number.isFinite(eighths) && eighths > 0 ? Math.max(1, (eighths / 8) * (96 / 72)) : 1;
    const color = !border.color || border.color === "auto" ? "#000000" : border.color.startsWith("#") ? border.color : `#${border.color}`;
    const y = top + line.height - thickness;
    draw.setStroke(color, thickness);
    draw.beginPath();
    draw.moveTo(x, y);
    draw.lineTo(x + width, y);
    draw.stroke();
  }

  private paintTocPage(draw: Draw, line: Line, x: number, top: number): void {
    const toc = line.paragraph?.toc;
    const width = line.contentWidth;
    if (!toc || width <= 0) {
      return;
    }
    const page = toc.page > 0 ? String(toc.page) : "";
    const word = line.startNode?.data;
    if (word) {
      this.applyStyle(draw, word);
    }
    const height = Math.max(line.maxCharHeight, 14);
    const baseline = top + line.beforeHeight + line.contentOffsetY + height * 0.85;
    const pageWidth = page ? draw.measureText(page) : 0;
    const pageLeft = x + width - pageWidth - 2;
    if (page) {
      draw.fillText(page, pageLeft, baseline);
    }
    const textRight = x + line.leftBlankWidth + line.totalCharWidth + 8;
    const dotsEnd = pageLeft - 8;
    if (dotsEnd <= textRight) {
      return;
    }
    draw.setFill("#8A8A8A");
    const dotWidth = Math.max(draw.measureText("·"), 4);
    for (let cursor = textRight; cursor + dotWidth <= dotsEnd; cursor += dotWidth) {
      draw.fillText("·", cursor, baseline);
    }
  }

  private paintTable(draw: Draw, line: Line, x: number, top: number): void {
    const table = line.startNode?.data.table;
    if (!table) {
      return;
    }
    const from = line.tableRowFrom;
    const to = line.tableRowTo || table.rows.length;
    const sliceH = line.height || this.tables.sliceHeight(table, from, to);
    const boxes = this.tables.boxesInSlice(table, from, to, x, top);

    draw.save();
    draw.beginPath();
    draw.rect(x - 0.5, top, this.tableWidth(table) + 1, sliceH);
    draw.clip();

    for (const box of boxes) {
      this.borders.paint(draw, box, table);
      const lines = box.cell.document.paragraphs.toArray().flatMap((paragraph) => paragraph.lines);
      this.paintCell(draw, lines, box);
    }
    draw.restore();
  }

  private paintCell(
    draw: Draw,
    lines: Line[],
    box: { x: number; y: number; width: number; height: number },
  ): void {
    draw.save();
    draw.beginPath();
    draw.rect(box.x, box.y, box.width, box.height);
    draw.clip();
    for (const line of lines) {
      this.paintLine(draw, line, box.x + CELL_PAD, box.y + CELL_PAD + line.top);
    }
    draw.restore();
  }

  private tableWidth(table: { columnWidths: number[] }): number {
    return table.columnWidths.reduce((sum, width) => sum + width, 0);
  }

  private applyStyle(draw: Draw, word: Word): void {
    const style = word.getStyle();
    draw.setFont(fontCss(style, word.intChar));
    draw.setFill(fillColorOf(style));
  }
}

