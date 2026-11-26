import { RibbonIcons } from "./RibbonIcons";

export const TABLE_GRID_SIZE = 8;

export function tableGridMarkup(): string {
  const cells: string[] = [];
  for (let row = 1; row <= TABLE_GRID_SIZE; row += 1) {
    for (let col = 1; col <= TABLE_GRID_SIZE; col += 1) {
      cells.push(`<button type="button" data-table-rows="${row}" data-table-cols="${col}" title="${row} × ${col}"></button>`);
    }
  }
  return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="插入表格">${RibbonIcons.table}<span>表格${RibbonIcons.chevronDown}</span></button>
      <div class="ho-word-outline-menu ho-word-table-menu" data-keep-drop>
        <div class="ho-word-table-size" data-table-size>插入表格</div>
        <div class="ho-word-table-grid">${cells.join("")}</div>
      </div>
    </div>`;
}

export function paintTableGrid(grid: HTMLElement, rows: number, cols: number): void {
  grid.querySelectorAll<HTMLElement>("[data-table-rows]").forEach((cell) => {
    const row = Number(cell.dataset.tableRows);
    const col = Number(cell.dataset.tableCols);
    cell.classList.toggle("is-on", row <= rows && col <= cols);
  });
}
