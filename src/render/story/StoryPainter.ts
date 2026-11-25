import type { FieldView } from "../../model/field/FieldDisplay";
import type { DocNote } from "../../model/review/Review";
import { Draw } from "../canvas/Draw";
import { Line } from "../../model/line/Line";
import type { Drawing } from "../../model/inline/Drawing";
import type { Block } from "../../model/block/Block";
import type { Word } from "../../model/inline/Word";
import { cellContentHeight, cellContentOrigin } from "../../layout/table/TableMetrics";
import { fillColorOf, fontCss } from "../../layout/measure/FontSpec";
import { paintShape } from "../graphic/ShapePainter";
import type { MathView } from "../../model/math/MathExpr";
import type { ParagraphBorder, ParagraphShading } from "../../model/style/ParagraphAttrs";
import { ptToPx } from "../../shared/units";
import { imageCache, type ImageCache } from "../image/ImageCache";
import type { Table } from "../../model/table/Table";
import { TableBorderPainter } from "../table/TableBorderPainter";
import { cellVisibleRect, TableGeometry, type TableCellBox } from "../table/TableGeometry";

/** 画正文行、行内图和表格切片。 */

export class StoryPainter {
  private readonly tables = new TableGeometry();
  private readonly borders = new TableBorderPainter();

  constructor(private readonly images: ImageCache = imageCache) {}

  paintLine(draw: Draw, line: Line, x: number, top: number, pageNumber?: number, fields?: FieldView): void {
    if (line.type === "table") {
      this.paintTable(draw, line, x, top, pageNumber, fields);
      return;
    }
    this.paintShading(draw, line, x, top);
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
    if (exact) {
      draw.restore();
    }
    this.paintParagraphBorders(draw, line, x, top);
  }

  paintFootnotes(draw: Draw, notes: DocNote[], lines: Line[], pageIndex: number, box: { x: number; y: number; pageH: number }): void {
    if (!notes.length || box.pageH <= 0) {
      return;
    }
    const pageOf = new Map<string, number>();
    for (const line of lines) {
      const page = Math.floor(line.top / box.pageH);
      let node = line.startNode;
      for (let i = 0; i < line.length && node; i += 1) {
        const id = node.data.block?.footnoteId;
        if (id && !pageOf.has(id)) {
          pageOf.set(id, page);
        }
        node = node.next;
      }
    }
    const here = notes.filter((note) => pageOf.get(note.id) === pageIndex);
    if (!here.length) {
      return;
    }
    draw.setStroke("#1F4E79", 1);
    draw.beginPath();
    draw.moveTo(box.x, box.y);
    draw.lineTo(box.x + 120, box.y);
    draw.stroke();
    let y = box.y + 16;
    here.forEach((note) => {
      const index = notes.findIndex((item) => item.id === note.id) + 1;
      draw.setFill("#1F4E79");
      draw.setFont(fontCss({ fontSizePx: 12, color: "#1F4E79" }, 0));
      draw.fillText(`${index} ${note.text}`, box.x, y);
      y += 18;
    });
  }

  paintDrawing(draw: Draw, drawing: Drawing, x: number, y: number): void {
    if (drawing.shape) {
      paintShape(draw, drawing, x, y);
      this.paintTextBox(draw, drawing, x, y);
      return;
    }
    const { width, height, url } = drawing;
    const img = this.images.ensure(url);
    const boxW = Math.max(width, 24);
    const boxH = Math.max(height, 16);
    if (img && width > 0 && height > 0) {
      draw.drawImage(img, x, y, width, height);
      return;
    }
    draw.setFill("#e6e6e6");
    draw.fillRect(x, y, boxW, boxH);
    const label = formatLabel(drawing.sourceUrl);
    if (label && boxW >= 36 && boxH >= 16) {
      draw.setFill("#666666");
      draw.setFont("12px sans-serif");
      draw.fillText(label, x + 4, y + 14);
    }
  }

  private paintTextBox(draw: Draw, drawing: Drawing, x: number, y: number): void {
    const story = drawing.shape?.text;
    const insets = drawing.shape?.insets;
    if (!story || !insets) {
      return;
    }
    draw.save();
    draw.beginPath();
    draw.rect(x, y, Math.max(drawing.width, 1), Math.max(drawing.height, 1));
    draw.clip();
    story.paragraphs.each((node) => {
      for (const line of node.data.lines) {
        this.paintLine(draw, line, x + insets.left, y + insets.top + line.top);
      }
    });
    draw.restore();
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
    fields?: FieldView,
  ): void {
    if (word.kind === "drawing" && word.drawing) {
      const left = x + word.left;
      const boxTop = top + line.beforeHeight + line.contentOffsetY;
      if (word.block?.mathView) {
        paintMath(draw, word.block.mathView, left, boxTop);
        return;
      }
      this.paintDrawing(draw, word.drawing, left, boxTop);
      return;
    }
    if (word.kind !== "text" || word.isEnterChar()) {
      return;
    }
    if (word.char === "\t") {
      this.paintTabLeader(draw, word, line, x, top);
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
    const align = style?.vertAlign;
    if (word.block?.footnoteId || word.block?.commentRef) {
      const raised = { ...style, vertAlign: undefined, fontSizePx: Math.max(8, (style?.fontSizePx ?? 16) * 0.72) };
      draw.setFont(fontCss(raised, word.intChar));
      draw.fillText(word.char, left, baseline - height * 0.28);
      return;
    }
    if (align === "superscript" || align === "subscript") {
      const shrunk = { ...style, vertAlign: undefined, fontSizePx: Math.max(8, (style?.fontSizePx ?? 16) * 0.65) };
      draw.setFont(fontCss(shrunk, word.intChar));
      const shift = align === "subscript" ? -height * 0.12 : height * 0.32;
      draw.fillText(word.char, left, baseline - shift);
      return;
    }
    const field = word.block?.field;
    if (field && word.block) {
      if (paintedFields?.has(word.block)) {
        return;
      }
      paintedFields?.add(word.block);
      const text =
        fields?.text.get(word.block) ??
        (field === "PAGE" || field === "NUMPAGES" || field === "SECTIONPAGES" ? fields?.values[field] : undefined) ??
        (field === "PAGE" && pageNumber != null ? String(pageNumber) : word.block.text);
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

  private paintShading(draw: Draw, line: Line, x: number, top: number): void {
    const color = shadeColor(line.paragraph?.attrs.shading);
    const width = line.contentWidth;
    if (!color || width <= 0 || line.type) {
      return;
    }
    const y = top + line.beforeHeight;
    const height = Math.max(1, line.height - line.beforeHeight - line.afterHeight);
    draw.setFill(color);
    draw.fillRect(x, y, width, height);
  }

  private paintTabLeader(draw: Draw, word: Word, line: Line, x: number, top: number): void {
    const leader = tabLeader(line, word.left + word.kernedWidth);
    if (!leader || word.kernedWidth < 4) {
      return;
    }
    const mark = leaderMark(leader);
    if (!mark) {
      return;
    }
    this.applyStyle(draw, word);
    const height = Math.max(line.maxCharHeight, 14);
    const baseline = top + line.beforeHeight + line.contentOffsetY + height * 0.85;
    const markWidth = Math.max(1, draw.measureText(mark));
    let cursor = x + word.left;
    const end = cursor + word.kernedWidth - markWidth * 0.25;
    while (cursor + markWidth <= end) {
      draw.fillText(mark, cursor, baseline);
      cursor += markWidth;
    }
  }

  private paintParagraphBorders(draw: Draw, line: Line, x: number, top: number): void {
    const attrs = line.paragraph?.attrs;
    const width = line.contentWidth;
    if (!attrs || width <= 0 || line.type) {
      return;
    }
    const contentTop = top + line.beforeHeight;
    const contentBottom = top + line.height - line.afterHeight;
    if (line.isFirst) {
      this.strokeBorder(draw, attrs.borderTop, x, contentTop, x + width, contentTop, -1);
    }
    if (line.isLast) {
      this.strokeBorder(draw, attrs.borderBottom, x, contentBottom, x + width, contentBottom, 1);
      this.strokeBorder(draw, attrs.borderBetween, x, contentBottom, x + width, contentBottom, 1);
    }
    this.strokeBorder(draw, attrs.borderLeft, x, contentTop, x, contentBottom, -1);
    this.strokeBorder(draw, attrs.borderRight, x + width, contentTop, x + width, contentBottom, 1);
  }

  private strokeBorder(
    draw: Draw,
    border: ParagraphBorder | undefined,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    outward: number,
  ): void {
    if (!border || border.val === "nil" || border.val === "none") {
      return;
    }
    const eighths = Number(border.sz);
    const thickness = Number.isFinite(eighths) && eighths > 0 ? Math.max(1, (eighths / 8) * (96 / 72)) : 1;
    const color = !border.color || border.color === "auto" ? "#000000" : border.color.startsWith("#") ? border.color : `#${border.color}`;
    const space = Number(border.space);
    const pad = Number.isFinite(space) && space > 0 ? ptToPx(space) : 0;
    const horizontal = Math.abs(y1 - y2) < 0.5;
    const dx = horizontal ? 0 : outward * pad;
    const dy = horizontal ? outward * pad : 0;
    draw.setStroke(color, thickness);
    draw.beginPath();
    draw.moveTo(x1 + dx, y1 + dy);
    draw.lineTo(x2 + dx, y2 + dy);
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

  private paintTable(draw: Draw, line: Line, x: number, top: number, pageNumber?: number, fields?: FieldView): void {
    const table = line.startNode?.data.table;
    if (!table) {
      return;
    }
    const from = line.tableRowFrom;
    const to = line.tableRowTo || table.rows.length;
    const sliceH = line.height || this.tables.sliceHeight(table, from, to);
    const originX = x + line.leftBlankWidth;
    const boxes = this.tables.boxesForSlice(
      table,
      from,
      to,
      line.tableHeaderRows,
      originX,
      top,
      line.tableClipTop,
      sliceH,
    );

    draw.save();
    draw.beginPath();
    draw.rect(originX - 0.5, top, this.tableWidth(table) + 1, sliceH);
    draw.clip();

    for (const box of boxes) {
      this.borders.paintFill(draw, box);
      const lines = box.cell.document.paragraphs.toArray().flatMap((paragraph) => paragraph.lines);
      this.paintCell(draw, table, lines, box, pageNumber, fields);
      this.borders.paintEdges(draw, box, table);
    }
    draw.restore();
  }

  private paintCell(
    draw: Draw,
    table: Table,
    lines: Line[],
    box: TableCellBox,
    pageNumber?: number,
    fields?: FieldView,
  ): void {
    const origin = cellContentOrigin(table, box, cellContentHeight(lines));
    const vis = cellVisibleRect(box);
    draw.save();
    draw.beginPath();
    draw.rect(vis.x, vis.y, vis.width, vis.height);
    draw.clip();
    for (const line of lines) {
      this.paintLine(draw, line, origin.x, origin.y + line.top, pageNumber, fields);
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

function shadeColor(shading: ParagraphShading | undefined): string | null {
  if (!shading || shading.val === "nil" || shading.val === "none") {
    return null;
  }
  const fill = shading.fill;
  if (!fill || fill === "auto") {
    return null;
  }
  return fill.startsWith("#") ? fill : `#${fill}`;
}

function tabLeader(line: Line, stopX: number): string | undefined {
  const stops = line.paragraph?.attrs.tabs ?? [];
  let leader: string | undefined;
  for (const stop of stops) {
    if (stop.posPx <= stopX + 0.5) {
      leader = stop.leader;
    }
  }
  return leader;
}

function leaderMark(leader: string): string {
  if (leader === "dot" || leader === "middleDot") {
    return "·";
  }
  if (leader === "hyphen") {
    return "-";
  }
  if (leader === "underscore" || leader === "heavy") {
    return "_";
  }
  return "";
}

function paintMath(draw: Draw, view: MathView, x: number, y: number): void {
  for (const glyph of view.glyphs) {
    if (glyph.kind === "line") {
      draw.setStroke("#111111", glyph.width || 1);
      draw.beginPath();
      draw.moveTo(x + glyph.x, y + glyph.y);
      draw.lineTo(x + (glyph.x2 ?? glyph.x), y + (glyph.y2 ?? glyph.y));
      draw.stroke();
      continue;
    }
    if (!glyph.text) {
      continue;
    }
    draw.setFill("#111111");
    draw.setFont(`italic ${glyph.size ?? 16}px "Cambria Math", "Times New Roman", serif`);
    draw.fillText(glyph.text, x + glyph.x, y + glyph.y);
  }
}

function formatLabel(url: string | undefined): string {
  const match = /^data:image\/([a-zA-Z0-9.+-]+)/.exec(url ?? "");
  if (!match) {
    return "";
  }
  const subtype = match[1].toLowerCase();
  if (subtype === "png" || subtype === "jpeg" || subtype === "gif" || subtype === "bmp" || subtype === "webp" || subtype === "svg+xml") {
    return "";
  }
  if (subtype === "tiff" || subtype === "tif") {
    return "TIFF";
  }
  return subtype.replace(/^x-/, "").toUpperCase();
}

