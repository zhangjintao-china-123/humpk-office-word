import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import { Document } from "../model/document/Document";
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
