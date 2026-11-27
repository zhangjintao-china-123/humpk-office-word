import type { Table, TableCell } from "./Table";

export const TABLE_FUNCTIONS = ["SUM", "AVERAGE", "COUNT", "MIN", "MAX"] as const;
export const TABLE_DIRECTIONS = ["ABOVE", "LEFT", "BELOW", "RIGHT"] as const;
export type TableFunction = typeof TABLE_FUNCTIONS[number];
export type TableDirection = typeof TABLE_DIRECTIONS[number];

export function tableFormula(table: Table, target: TableCell, operation: TableFunction, direction: TableDirection): string {
  const column = target.colIndex;
  const row = target.rowIndex;
  const vertical = direction === "ABOVE" || direction === "BELOW";
  const before = direction === "ABOVE" || direction === "LEFT";
  const axis = vertical ? row : column;
  const numbers: number[] = [];
  for (const item of table.rows) {
    for (const cell of item.cells) {
      const crossStart = vertical ? cell.colIndex : cell.rowIndex;
      const crossSpan = vertical ? cell.colSpan : cell.rowSpan;
      const cross = vertical ? column : row;
      const start = vertical ? cell.rowIndex : cell.colIndex;
      if (cross < crossStart || cross >= crossStart + crossSpan || (before ? start >= axis : start <= axis)) continue;
      const raw = cell.document.paragraphText().join(" ").trim();
      if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(raw)) continue;
      const value = Number(raw.replace(/,/g, ""));
      if (Number.isFinite(value)) numbers.push(value);
    }
  }
  if (operation === "COUNT") return String(numbers.length);
  if (!numbers.length) return operation === "AVERAGE" ? "#DIV/0!" : "0";
  let value = 0;
  if (operation === "SUM" || operation === "AVERAGE") {
    value = numbers.reduce((sum, number) => sum + number, 0);
    if (operation === "AVERAGE") value /= numbers.length;
  } else {
    const extreme = operation === "MIN" ? Math.min : Math.max;
    value = numbers.reduce((first, next) => extreme(first, next));
  }
  return Number.isFinite(value) ? String(Number(value.toPrecision(12))) : "#NUM!";
}
