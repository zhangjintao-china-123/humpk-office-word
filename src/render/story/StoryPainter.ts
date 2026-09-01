import { Draw } from "../canvas/Draw";
import { Line } from "../../model/line/Line";
import type { Drawing } from "../../model/inline/Drawing";
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

  paintLine(draw: Draw, line: Line, x: number, top: number): void {
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
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      this.paintWord(draw, node.data, line, x, top);
      node = node.next;
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

  private paintWord(draw: Draw, word: Word, line: Line, x: number, top: number): void {
    if (word.kind === "drawing" && word.drawing) {
      this.paintDrawing(draw, word.drawing, x + word.left, top + line.beforeHeight + line.contentOffsetY);
      return;
    }
    if (word.kind !== "text" || word.isEnterChar()) {
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

