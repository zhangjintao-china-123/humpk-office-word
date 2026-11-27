import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import { Document } from "../model/document/Document";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import { TableCell, TableColumn, TableRow, type Table } from "../model/table/Table";

export class TableStructure {
  insertRow(table: Table, index: number): void {
    const at = clamp(index, 0, table.rows.length);
    const covered = new Set<number>();
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (cell.rowIndex < at && cell.rowIndex + cell.rowSpan > at) {
          cell.rowSpan += 1;
          for (let col = cell.colIndex; col < cell.colIndex + cell.colSpan; col += 1) {
            covered.add(col);
          }
        } else if (cell.rowIndex >= at) {
          cell.rowIndex += 1;
        }
      }
    }
    const row = new TableRow();
    const count = columnCount(table);
    for (let col = 0; col < count; col += 1) {
      if (covered.has(col)) {
        continue;
      }
      row.cells.push(blankCell(at, col));
    }
    table.rows.splice(at, 0, row);
  }

  deleteRow(table: Table, index: number): boolean {
    if (table.rows.length <= 1 || index < 0 || index >= table.rows.length) {
      return false;
    }
    const next = table.rows[index + 1];
    const carried: TableCell[] = [];
    for (const cell of table.rows[index].cells) {
      if (cell.rowSpan > 1 && next) {
        cell.rowSpan -= 1;
        cell.rowIndex = index + 1;
        carried.push(cell);
      }
    }
    if (next && carried.length) {
      next.cells.push(...carried);
      next.cells.sort((a, b) => a.colIndex - b.colIndex);
    }
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (cell.rowIndex < index && cell.rowIndex + cell.rowSpan > index) {
          cell.rowSpan -= 1;
        }
      }
    }
    table.rows.splice(index, 1);
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (cell.rowIndex > index) {
          cell.rowIndex -= 1;
        }
      }
    }
    return true;
  }

  insertColumn(table: Table, index: number): void {
    const count = columnCount(table);
    const at = clamp(index, 0, count);
    ensureColumns(table, count);
    const column = new TableColumn();
    column.width = table.columns[Math.max(0, at - 1)]?.width || 80;
    table.columns.splice(at, 0, column);

    const expanded = new Set<TableCell>();
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (cell.colIndex < at && cell.colIndex + cell.colSpan > at) {
          expanded.add(cell);
        }
      }
    }
    for (const cell of expanded) {
      cell.colSpan += 1;
    }
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (!expanded.has(cell) && cell.colIndex >= at) {
          cell.colIndex += 1;
        }
      }
    }
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      if (coverAt(table, rowIndex, at)) {
        continue;
      }
      const row = table.rows[rowIndex];
      row.cells.push(blankCell(rowIndex, at));
      row.cells.sort((a, b) => a.colIndex - b.colIndex);
    }
  }

  deleteColumn(table: Table, index: number): boolean {
    const count = columnCount(table);
    if (count <= 1 || index < 0 || index >= count) {
      return false;
    }
    for (const row of table.rows) {
      const next: TableCell[] = [];
      for (const cell of row.cells) {
        const end = cell.colIndex + cell.colSpan;
        if (cell.colIndex <= index && end > index) {
          cell.colSpan -= 1;
          if (cell.colSpan <= 0) {
            continue;
          }
          if (cell.colIndex === index) {
            cell.colIndex = index;
          }
        }
        if (cell.colIndex > index) {
          cell.colIndex -= 1;
        }
        next.push(cell);
      }
      row.cells = next;
    }
    if (table.columns.length > index) {
      table.columns.splice(index, 1);
    }
    return true;
  }

  merge(table: Table, cells: TableCell[]): boolean {
    if (cells.length < 2) {
      return false;
    }
    const top = Math.min(...cells.map((cell) => cell.rowIndex));
    const left = Math.min(...cells.map((cell) => cell.colIndex));
    const bottom = Math.max(...cells.map((cell) => cell.rowIndex + cell.rowSpan - 1));
    const right = Math.max(...cells.map((cell) => cell.colIndex + cell.colSpan - 1));
    const origin = cells.find((cell) => cell.rowIndex === top && cell.colIndex === left);
    if (!origin) {
      return false;
    }
    const selected = new Set(cells);
    for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
      for (let col = left; col <= right; col += 1) {
        const cover = coverAt(table, rowIndex, col);
        if (!cover || !selected.has(cover)) {
          return false;
        }
        if (cover.rowIndex < top || cover.colIndex < left || cover.rowIndex + cover.rowSpan - 1 > bottom || cover.colIndex + cover.colSpan - 1 > right) {
          return false;
        }
      }
    }
    for (const row of table.rows) {
      row.cells = row.cells.filter((cell) => cell === origin || !selected.has(cell));
    }
    origin.rowSpan = bottom - top + 1;
    origin.colSpan = right - left + 1;
    return true;
  }

  split(table: Table, cell: TableCell): boolean {
    if (cell.colSpan <= 1 && cell.rowSpan <= 1) {
      return false;
    }
    const rowSpan = cell.rowSpan;
    const colSpan = cell.colSpan;
    cell.rowSpan = 1;
    cell.colSpan = 1;
    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      const row = table.rows[cell.rowIndex + rowOffset];
      if (!row) {
        continue;
      }
      for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
        if (rowOffset === 0 && colOffset === 0) {
          continue;
        }
        row.cells.push(blankCell(cell.rowIndex + rowOffset, cell.colIndex + colOffset));
      }
      row.cells.sort((a, b) => a.colIndex - b.colIndex);
    }
    return true;
  }

  splitInto(table: Table, target: TableCell, rowParts: number, colParts: number, fraction?: number): void {
    const originalRows = table.rows.slice();
    const originalCells = originalRows.flatMap((row) => row.cells);
    const originalWidths = table.columnWidths.slice();
    const originalRules = originalRows.map((row) => row.heightRule);
    const rowGrid = subdividedGrid(originalRows.length, target.rowIndex, target.rowSpan, rowParts, fraction);
    const colGrid = subdividedGrid(originalWidths.length, target.colIndex, target.colSpan, colParts, fraction);
    const originalHeights = originalRows.map((row) => row.height);

    table.rows = rowGrid.edges.slice(0, -1).map((position, index) => {
      const source = originalRows[Math.floor(position)];
      const row = Number.isInteger(position) ? source : Object.assign(new TableRow(), source);
      row.cells = [];
      const i = Math.floor(position);
      const share = rowGrid.edges[index + 1] - position;
      if (fraction !== undefined && share < 1) {
        row.height = (table.rowHeights[i] ?? originalHeights[i]) * share;
        row.heightRule = originalRules[i] === "exact" ? "exact" : "atLeast";
      } else {
        row.height = originalHeights[i] * share;
        row.heightRule = originalRules[i];
      }
      return row;
    });
    const widths = colGrid.edges.slice(0, -1).map((position, index) => originalWidths[Math.floor(position)] * (colGrid.edges[index + 1] - position));
    if (widths.length !== originalWidths.length) {
      table.columns = widths.map((width) => Object.assign(new TableColumn(), { width }));
    }

    for (const cell of originalCells) {
      if (cell === target) continue;
      const row = rowGrid.originalIndexes[cell.rowIndex];
      const col = colGrid.originalIndexes[cell.colIndex];
      cell.rowSpan = rowGrid.originalIndexes[cell.rowIndex + cell.rowSpan] - row;
      cell.colSpan = colGrid.originalIndexes[cell.colIndex + cell.colSpan] - col;
      cell.rowIndex = row;
      cell.colIndex = col;
      table.rows[row].cells.push(cell);
    }
    for (let r = 0; r < rowParts; r += 1) {
      for (let c = 0; c < colParts; c += 1) {
        const row = rowGrid.partIndexes[r];
        const col = colGrid.partIndexes[c];
        const cell = r === 0 && c === 0 ? target : blankCell(row, col);
        cell.rowSpan = rowGrid.partIndexes[r + 1] - row;
        cell.colSpan = colGrid.partIndexes[c + 1] - col;
        cell.width = { type: "dxa", value: widths.slice(col, col + cell.colSpan).reduce((sum, width) => sum + width, 0) };
        cell.vAlign = target.vAlign;
        cell.textDirection = target.textDirection;
        cell.margin = target.margin;
        cell.fill = target.fill;
        table.rows[row].cells.push(cell);
      }
    }
    for (const row of table.rows) row.cells.sort((a, b) => a.colIndex - b.colIndex);
  }
}

function subdividedGrid(size: number, start: number, span: number, parts: number, fraction?: number) {
  const partEdges = Array.from({ length: parts + 1 }, (_, i) =>
    start + span * (parts === 2 && i === 1 && fraction !== undefined ? fraction : i / parts));
  const originals = Array.from({ length: size + 1 }, (_, i) => i);
  const edges = [...new Set([...originals, ...partEdges])].sort((a, b) => a - b);
  const indexes = new Map(edges.map((edge, index) => [edge, index]));
  return { edges, partIndexes: partEdges.map((edge) => indexes.get(edge)!), originalIndexes: originals.map((edge) => indexes.get(edge)!) };
}

function columnCount(table: Table): number {
  const spanned = table.rows.reduce((max, row) => {
    const end = row.cells.reduce((col, cell) => Math.max(col, cell.colIndex + cell.colSpan), 0);
    return Math.max(max, end);
  }, 0);
  return Math.max(table.columns.length, spanned, 1);
}

function ensureColumns(table: Table, count: number): void {
  while (table.columns.length < count) {
    const column = new TableColumn();
    column.width = 80;
    table.columns.push(column);
  }
}

function blankCell(rowIndex: number, colIndex: number): TableCell {
  const document = new Document();
  document.kind = "cell";
  const paragraph = new Paragraph(1);
  paragraph.addBlock(new Block());
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  const cell = new TableCell(document);
  cell.rowIndex = rowIndex;
  cell.colIndex = colIndex;
  return cell;
}

function coverAt(table: Table, rowIndex: number, col: number): TableCell | undefined {
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (
        rowIndex >= cell.rowIndex &&
        rowIndex < cell.rowIndex + cell.rowSpan &&
        col >= cell.colIndex &&
        col < cell.colIndex + cell.colSpan
      ) {
        return cell;
      }
    }
  }
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
