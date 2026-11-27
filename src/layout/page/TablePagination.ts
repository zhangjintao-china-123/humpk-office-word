import type { Table } from "../../model/table/Table";
import { cellContentOrigin, cellDocumentHeight, cellInsets, cellLineBand, headerRowCount } from "../table/TableMetrics";

export interface TablePageSlice {
  from: number;
  to: number;
  clipTop: number;
  height: number;
  headerRows: number;
  top: number;
}

type Band = { top: number; bottom: number };
const EPS = 0.01;

/** 优先整行分页。必须切开一行时，退到可见文字之间的最近断点。 */
export function paginateTableRows(table: Table, startY: number, pageHeight: number, firstPage?: number): { slices: TablePageSlice[]; y: number } {
  const heights = table.rowHeights;
  const offsets = rowOffsets(heights);
  const headerCount = headerRowCount(table);
  const headerHeight = offsets[headerCount] ?? 0;
  const page = Math.max(1, pageHeight);
  const slices: TablePageSlice[] = [];
  const total = offsets.at(-1)!;
  let bands: Band[] | undefined;
  let row = 0;
  let source = 0;
  let y = startY;

  while (row < heights.length && source < total - EPS) {
    const firstPageTop = firstPage === undefined ? undefined : firstPage * page;
    const aboveFirstContent = firstPageTop !== undefined && y < firstPageTop;
    let room = aboveFirstContent ? firstPageTop + page - y : page - (y % page);
    if (room <= EPS) {
      y += room;
      room = page;
    }
    const atTop = room >= page - EPS;
    const header = row >= headerCount && headerHeight > EPS && headerHeight < page - EPS ? headerHeight : 0;
    const prefix = atTop ? header : 0;
    const rowLeft = offsets[row + 1] - source;
    const clipTop = source - offsets[row];
    if (clipTop <= EPS && !atTop && rowLeft <= page - header + EPS && rowLeft > room + EPS) {
      y += room;
      continue;
    }

    const limit = source + room - prefix;
    let next = row;
    while (next < heights.length && offsets[next + 1] <= limit + EPS) {
      next += 1;
    }
    const ideal = next > row ? Math.min(offsets[next], limit) : Math.min(offsets[row + 1], limit);
    if (ideal <= source + EPS) {
      y += room;
      continue;
    }
    let end = ideal;
    if (ideal < total - EPS) {
      bands ??= breakBands(table, offsets, total);
      const safe = safeBreak(bands, ideal);
      if (safe > source + EPS) {
        end = safe;
      } else if (!atTop) {
        y += room;
        continue;
      }
    }

    const from = row;
    while (row < heights.length && offsets[row + 1] <= end + EPS) {
      row += 1;
    }
    const partial = row < heights.length && end > offsets[row] + EPS;
    const height = prefix + end - source;
    slices.push({ from, to: partial ? row + 1 : row, clipTop, height, headerRows: prefix ? headerCount : 0, top: y });
    source = partial ? end : offsets[row];
    y += partial || end < ideal - EPS ? room : height;
  }

  return { slices, y };
}

function rowOffsets(heights: number[]): number[] {
  const offsets = [0];
  for (const height of heights) {
    offsets.push(offsets.at(-1)! + height);
  }
  return offsets;
}

function breakBands(table: Table, offsets: number[], bottom: number): Band[] {
  const bands: Band[] = [];
  collectBands(table, offsets, 0, { top: 0, bottom }, bands);
  bands.sort((a, b) => a.top - b.top);
  const merged: Band[] = [];
  for (const band of bands) {
    const previous = merged.at(-1);
    if (previous && band.top < previous.bottom - EPS) {
      previous.bottom = Math.max(previous.bottom, band.bottom);
    } else {
      merged.push(band);
    }
  }
  return merged;
}

function collectBands(table: Table, offsets: number[], tableTop: number, visible: Band, found: Band[]): void {
  for (const row of table.rows) {
    for (const cell of row.cells) {
      const y = tableTop + offsets[cell.rowIndex];
      const height = offsets[Math.min(table.rows.length, cell.rowIndex + Math.max(1, cell.rowSpan))] - offsets[cell.rowIndex];
      const origin = cellContentOrigin(table, { x: 0, y, height, cell }, cellDocumentHeight(cell.document));
      const cellTop = Math.max(y, visible.top);
      const cellBottom = Math.min(y + height, visible.bottom);
      for (const paragraph of cell.document.paragraphs.toArray()) {
        for (const line of paragraph.lines) {
          if (cell.textDirection) {
            const start = y + cellInsets(table, cell).top;
            let node = line.startNode;
            for (let i = 0; node && i < line.length; i += 1, node = node.next) {
              const word = node.data;
              if (word.isEnterChar()) continue;
              const top = Math.max(start + word.left, cellTop);
              const bottom = Math.min(start + word.left + word.kernedWidth, cellBottom);
              if (bottom > top + EPS) found.push({ top, bottom });
            }
            continue;
          }
          const nested = line.type === "table" ? line.startNode?.data.table : undefined;
          if (nested) {
            collectBands(nested, rowOffsets(nested.rowHeights), origin.y + line.top, { top: cellTop, bottom: cellBottom }, found);
            continue;
          }
          const band = cellLineBand(line);
          const top = Math.max(origin.y + band.top, cellTop);
          const bottom = Math.min(origin.y + band.bottom, cellBottom);
          if (bottom > top + EPS) {
            found.push({ top, bottom });
          }
        }
      }
    }
  }
}

function safeBreak(bands: Band[], limit: number): number {
  let lower = 0;
  let upper = bands.length;
  while (lower < upper) {
    const middle = (lower + upper) >>> 1;
    if (bands[middle].top < limit - EPS) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  const band = bands[lower - 1];
  return band && band.bottom > limit + EPS ? band.top : limit;
}
