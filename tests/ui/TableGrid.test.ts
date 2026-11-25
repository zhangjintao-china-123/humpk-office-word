import { describe, expect, it } from "vitest";
import { paintTableGrid, TABLE_GRID_SIZE, tableGridMarkup } from "../../src/ui/ribbon/TableGrid";

describe("TableGrid", () => {
  it("插入表格是 8×8 格子盘", () => {
    const markup = tableGridMarkup();
    expect(markup).toContain("表格");
    expect(markup).toContain('data-table-rows="1"');
    expect(markup).toContain(`data-table-rows="${TABLE_GRID_SIZE}"`);
    expect(markup).toContain(`data-table-cols="${TABLE_GRID_SIZE}"`);
    expect(markup.match(/data-table-rows=/g)?.length).toBe(TABLE_GRID_SIZE * TABLE_GRID_SIZE);
  });

  it("悬停时点亮左上角的行列", () => {
    const root = document.createElement("div");
    root.innerHTML = tableGridMarkup();
    const grid = root.querySelector(".ho-word-table-grid") as HTMLElement;
    paintTableGrid(grid, 2, 3);
    const on = [...grid.querySelectorAll(".is-on")];
    expect(on).toHaveLength(6);
    expect(on.every((cell) => Number((cell as HTMLElement).dataset.tableRows) <= 2 && Number((cell as HTMLElement).dataset.tableCols) <= 3)).toBe(true);
  });
});
