import type { Document } from "../../model/document/Document";
import type { Line } from "../../model/line/Line";
import type { Table, TableCell, TableInsets, TableLength } from "../../model/table/Table";
import { twipToPx } from "../../shared/units";

/** 默认单元格内边距：左右 0.08 英寸（108 dxa），上下留 3pt（60 dxa）避免文字贴住边框。 */
export const DEFAULT_CELL_INSETS: TableInsets = {
  top: twipToPx(60),
  right: twipToPx(108),
  bottom: twipToPx(60),
  left: twipToPx(108),
};

export function cellInsets(table: Table | undefined, cell: TableCell): TableInsets {
  return cell.margin ?? table?.cellMargin ?? DEFAULT_CELL_INSETS;
}

export function cellContentHeight(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + (line.sharesBand ? 0 : line.height), 0);
}

export function cellDocumentHeight(document: Document): number {
  const text = cellContentHeight(document.paragraphs.toArray().flatMap((paragraph) => paragraph.lines));
  const float = document.anchors.reduce((max, anchor) => Math.max(max, anchor.y + anchor.height), 0);
  return Math.max(text, float);
}

/** 单元格内容区左上角。垂直对齐在上下边距之间挪动。 */
export function cellContentOrigin(
  table: Table | undefined,
  box: { x: number; y: number; height: number; cell: TableCell },
  contentHeight: number,
): { x: number; y: number } {
  const margin = cellInsets(table, box.cell);
  const inner = Math.max(0, box.height - margin.top - margin.bottom);
  let y = box.y + margin.top;
  if (box.cell.vAlign === "center") {
    y += Math.max(0, (inner - contentHeight) / 2);
  } else if (box.cell.vAlign === "bottom") {
    y += Math.max(0, inner - contentHeight);
  }
  return { x: box.x + margin.left, y };
}

export function tableOffset(table: Table, contentWidth: number): number {
  const width = table.columnWidths.reduce((sum, column) => sum + column, 0);
  const indent = lengthPx(table.indent, contentWidth);
  if (table.align === "center") {
    return Math.max(0, (contentWidth - width) / 2);
  }
  if (table.align === "right" || table.align === "end") {
    return Math.max(0, contentWidth - width);
  }
  return Math.max(0, indent);
}

export function headerRowCount(table: Table): number {
  let count = 0;
  for (const row of table.rows) {
    if (!row.header) {
      break;
    }
    count += 1;
  }
  return count;
}

export function resolveColumnWidths(table: Table, contentWidth: number): number[] {
  const spanned = table.rows.reduce((max, row) => {
    const end = row.cells.reduce((col, cell) => Math.max(col, cell.colIndex + cell.colSpan), 0);
    return Math.max(max, end);
  }, 0);
  const count = Math.max(table.columns.length, spanned, 1);
  const raw = Array.from({ length: count }, (_, index) => table.columns[index]?.width || 0);
  const target = tableWidthPx(table.width, contentWidth);
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.colSpan !== 1 || cell.colIndex >= count || !cell.width) {
        continue;
      }
      if (cell.width.type === "dxa") {
        raw[cell.colIndex] = cell.width.value;
      } else if (cell.width.type === "pct") {
        raw[cell.colIndex] = ((target ?? contentWidth) * cell.width.value) / 100;
      }
    }
  }
  const total = raw.reduce((sum, width) => sum + width, 0);
  const goal = target ?? (total > contentWidth ? contentWidth : total);
  if (total <= 0) {
    const each = (goal > 0 ? goal : contentWidth) / count;
    return Array.from({ length: count }, () => each);
  }
  if (goal > 0 && Math.abs(goal - total) > 0.5) {
    const scale = goal / total;
    return raw.map((width) => width * scale);
  }
  return raw;
}

function tableWidthPx(width: TableLength | undefined, contentWidth: number): number | null {
  if (!width || width.type === "auto") {
    return null;
  }
  if (width.type === "pct") {
    return (contentWidth * width.value) / 100;
  }
  return width.value > 0 ? width.value : null;
}

function lengthPx(length: TableLength | undefined, contentWidth: number): number {
  if (!length || length.type === "auto") {
    return 0;
  }
  if (length.type === "pct") {
    return (contentWidth * length.value) / 100;
  }
  return length.value;
}
