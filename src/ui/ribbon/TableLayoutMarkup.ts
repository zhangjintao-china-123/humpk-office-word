import type { CellHorizontal, CellVertical, TableAutoFit, TableCommandName, TableLayoutAction, TableSelection } from "../../edit/TableLayout";
import type { TableDirection, TableFunction } from "../../model/table/TableFormula";
import { cmToPx } from "../../shared/units";
import { RibbonIcons } from "./RibbonIcons";

const groups = {
  cell: grid('<rect x="3" y="4" width="6" height="5" fill="#c9e8ff" stroke="none"/>'),
  row: grid('<rect x="3" y="9" width="18" height="6" fill="#c9e8ff" stroke="none"/>'),
  column: grid('<rect x="9" y="4" width="6" height="16" fill="#c9e8ff" stroke="none"/>'),
  table: grid('<rect x="3" y="4" width="18" height="16" fill="#dcefff" stroke="none"/>'),
};

const icons = {
  grid: grid(),
  select: svg('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M9 8v11l3-3 2 4 2-1-2-4h5Z" fill="white"/>'),
  properties: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 9h12M6 15h12"/><circle cx="9" cy="9" r="2" fill="#c9e8ff" stroke="#187eae"/><circle cx="15" cy="15" r="2" fill="#c9e8ff" stroke="#187eae"/>'),
  draw: grid("", '<path d="m9 16 2.5-.6 9.3-9.3a1.8 1.8 0 0 0-2.5-2.5L9 13Z" fill="#deeffc" stroke="#187eae"/><path d="m17 5 2.5 2.5" stroke="#187eae"/>'),
  erase: grid("", '<path d="m8 14 7.6-9a1.5 1.5 0 0 1 2.1-.2l3.5 3a1.5 1.5 0 0 1 .2 2.1L14 19h-2.4Z" fill="#f1e3f5" stroke="#8c529c"/><path d="m10.4 11.3 6.3 5.1" stroke="#8c529c"/>'),
  delete: grid("", '<circle cx="17.5" cy="17.5" r="5.3" fill="#fff4f3" stroke="none"/><path d="m15 15 5 5m0-5-5 5" stroke="#b33b3b"/>'),
  above: insertion("M12 9V2m-3 3 3-3 3 3", "M4 7h4m8 0h4"),
  below: insertion("M12 15v7m-3-3 3 3 3-3", "M4 17h4m8 0h4"),
  left: insertion("M9 12H2m3-3-3 3 3 3", "M7 4v4m0 8v4"),
  right: insertion("M15 12h7m-3-3 3 3-3 3", "M17 4v4m0 8v4"),
  merge: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18v6H3Z" fill="#dcefff" stroke="#187eae"/><path d="M12 4v5m0 6v5m-4-8h8" stroke="#187eae"/>'),
  split: grid("", '<path d="M12 5v14" stroke="#187eae" stroke-dasharray="2 2"/>'),
  splitTable: svg('<rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="15" width="18" height="6" rx="1"/><path d="M9 3v6m6-6v6M9 15v6m6-6v6"/><path d="M3 12h18" stroke="#187eae" stroke-dasharray="2 2"/>'),
  fit: svg('<rect x="3" y="10" width="18" height="10" rx="1"/><path d="M9 10v10m6-10v10M3 15h18"/><path d="M4 5h16M7 2 4 5l3 3m10-6 3 3-3 3" stroke="#187eae"/>'),
  margins: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 7h10v10H7Z" stroke="#187eae" stroke-dasharray="2 2"/><path d="M10 12h4"/>'),
  direction: svg('<path d="M3 13 8 3l5 10m-8-3h6m5-5v13m-3-3 3 3 3-3M3 19h8" stroke="#187eae"/>'),
  header: grid('<path d="M3 4h18v5H3Z" fill="#c9e8ff" stroke="none"/>', '<path d="M5 6.5h7m2 0h4" stroke="#187eae"/>'),
  convert: svg('<path d="M3 3h14v9H3Zm7 0v9M3 7.5h14m1 8h4m-7 4h7m-7 3h7"/><path d="M5 15v4h6m-2-2 2 2-2 2" stroke="#187eae"/>'),
  formula: svg('<path d="M13 4c-1.4-2.3-4.6-1-5.2 2.3L5.7 17c-.4 2.3-1.7 3.2-3.7 2.2M4 9h8"/><path d="m13 12 7 7m0-7-7 7" stroke="#187eae"/>'),
  more: svg('<circle cx="5" cy="12" r="1.25" fill="currentColor"/><circle cx="12" cy="12" r="1.25" fill="currentColor"/><circle cx="19" cy="12" r="1.25" fill="currentColor"/>'),
};

export function tableLayoutMarkup(borderMenu: string): string {
  return `
    <div class="ho-word-ribbon-page ho-word-table-layout" data-page="table" hidden>
      ${group("选择与行列", `
        ${drop("选择", icons.select, `
          ${item("选择单元格", "select:cell", groups.cell)}
          ${item("选择行", "select:row", groups.row)}
          ${item("选择列", "select:column", groups.column)}
          ${item("选择整张表格", "select:table", groups.table)}
        `)}
        ${drop("删除", icons.delete, `
          ${item("删除所选行", "delete-row", groups.row)}
          ${item("删除所选列", "delete-column", groups.column)}
          ${item("删除整张表格", "delete-table", icons.delete)}
        `)}
        <div class="ho-table-insert" aria-label="插入行或列">
          ${button("上方插行", "insert-above", icons.above)}
          ${button("下方插行", "insert-below", icons.below)}
          ${button("左侧插列", "insert-left", icons.left)}
          ${button("右侧插列", "insert-right", icons.right)}
        </div>
      `)}
      ${group("单元格", `
        ${button("合并单元格", "merge", icons.merge, 'title="合并矩形选区中的单元格"')}
        ${drop("拆分单元格", icons.split, splitForm(), "split-selection")}
      `)}
      ${group("尺寸", `
        ${drop("自动调整", icons.fit, `
          ${item("根据内容调整列宽", "autofit:contents", icons.fit)}
          ${item("适应版心宽度", "autofit:window", groups.table)}
          ${item("固定当前列宽", "autofit:fixed", groups.column)}
        `)}
        <div class="ho-table-dimensions">
          ${dimension("行高", "height")}
          ${dimension("列宽", "width")}
        </div>
        <div class="ho-table-distribute">
          ${button("平均分布行", "distribute-rows", groups.row)}
          ${button("平均分布列", "distribute-columns", groups.column)}
        </div>
      `)}
      ${group("对齐与边框", `
        <div class="ho-table-alignment" role="group" aria-label="单元格对齐">
          ${alignments()}
        </div>
        ${borderMenu}
      `)}
      ${group("表格", `
        ${button("重复标题行", "repeat-header", icons.header, 'aria-pressed="false" title="从第一行开始选择需要在后续页面重复的标题行"')}
        ${drop("更多", icons.more, moreCommands(), undefined, 'data-table-more')}
      `)}
    </div>`;
}

export function readTableAction(button: HTMLButtonElement): TableLayoutAction | undefined {
  const [type, first, second] = button.dataset.tableTool!.split(":");
  const form = button.form;
  const field = (name: string) => form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  const input = (name: string): string => field(name)?.value ?? "";
  const pixels = (name: string) => cmToPx(Number(input(name)));
  if (type === "select") return { type, scope: first as TableSelection };
  if (type === "autofit") return { type, mode: first as TableAutoFit };
  if (type === "align") return { type, horizontal: first as CellHorizontal, vertical: second as CellVertical };
  if (type === "direction") return { type, vertical: first === "vertical" };
  if (type === "convert") return { type, separator: first === "tab" ? "\t" : first === "comma" ? "，" : "\n" };
  if (type === "properties" || type === "margins" || type === "split-selection" || type === "formula") {
    if (!form?.reportValidity()) return undefined;
    if (type === "margins") {
      return { type, insets: { top: pixels("top"), right: pixels("right"), bottom: pixels("bottom"), left: pixels("left") } };
    }
    if (type === "split-selection") return { type, rows: Number(input("rows")), columns: Number(input("columns")) };
    if (type === "formula") return { type, operation: input("operation") as TableFunction, direction: input("direction") as TableDirection };
    const changed = (name: string): boolean => field(name)?.dataset.initial !== input(name);
    return {
      type,
      align: changed("align") ? input("align") as CellHorizontal : undefined,
      width: changed("width") ? (input("width") ? pixels("width") : null) : undefined,
      heightRule: changed("rule") || changed("height") ? input("rule") as "auto" | "atLeast" | "exact" : undefined,
      height: pixels("height"),
    };
  }
  return { type: type as TableCommandName };
}

function group(label: string, body: string): string {
  return `<section class="ho-word-group ho-table-group"><div class="ho-word-group-body">${body}</div><span>${label}</span></section>`;
}

function button(label: string, action: string, icon: string, extra = ""): string {
  return `<button type="button" class="ho-table-tool" data-table-tool="${action}" ${extra}>${icon}<span>${label}</span></button>`;
}

function drop(label: string, icon: string, content: string, availability?: string, attributes = ""): string {
  return `<div class="ho-word-drop ho-table-drop" ${attributes}>
    <button type="button" class="ho-table-tool" data-drop-toggle aria-expanded="false"${availability ? ` data-table-availability="${availability}"` : ""}>
      ${icon}<span>${label}<svg class="ho-table-chevron" viewBox="0 0 10 6" aria-hidden="true"><path d="m1 1 4 4 4-4"/></svg></span>
    </button>
    <div class="ho-word-outline-menu ho-table-menu">${content}</div>
  </div>`;
}

function item(label: string, action: string, icon = "", attributes = ""): string {
  const type = ["properties", "margins", "split-selection", "formula"].includes(action) ? "submit" : "button";
  return `<button type="${type}" data-table-tool="${action}" ${attributes}>${icon}${label}</button>`;
}

function moreCommands(): string {
  return `
    ${section("表格属性", icons.properties, propertiesForm())}
    ${section("单元格边距", icons.margins, marginsForm())}
    ${section("文字方向", icons.direction, `
      ${item("横排", "direction:horizontal", "", 'aria-pressed="false"')}
      ${item("竖排", "direction:vertical", "", 'aria-pressed="false" title="适用于文字单元格"')}
    `)}
    <div class="ho-word-border-split" role="separator"></div>
    ${item("查看网格线", "gridlines", icons.grid, 'aria-pressed="false" title="显示或隐藏辅助网格线"')}
    ${item("绘制表格", "draw-table", icons.draw, 'aria-pressed="false" title="在已有单元格内画分隔线"')}
    ${item("橡皮擦", "erase-table", icons.erase, 'aria-pressed="false" title="擦除相邻单元格之间的分隔线"')}
    ${item("拆分表格", "split-table", icons.splitTable, 'title="在所选行之前拆分表格"')}
    <div class="ho-word-border-split" role="separator"></div>
    <button type="button" data-act="sort" data-table-availability="sort">${RibbonIcons.sort}排序</button>
    ${section("转换为文本", icons.convert, `
      ${item("用制表符分隔", "convert:tab")}
      ${item("用逗号分隔", "convert:comma")}
      ${item("每个单元格换行", "convert:paragraph")}
    `, "convert")}
    ${section("公式", icons.formula, formulaForm(), "formula")}
  `;
}

function section(label: string, icon: string, content: string, availability?: string): string {
  return `
    <button type="button" data-table-more-section aria-expanded="false"${availability ? ` data-table-availability="${availability}"` : ""}>
      ${icon}${label}<svg class="ho-table-chevron" viewBox="0 0 10 6" aria-hidden="true"><path d="m1 1 4 4 4-4"/></svg>
    </button>
    <div class="ho-table-more-panel" hidden>${content}</div>`;
}

function dimension(label: string, name: string): string {
  return `<label>${label}<input type="number" data-table-dimension="${name}" aria-label="${label}（厘米）" min="0.01" step="0.01" /> cm</label>`;
}

function alignments(): string {
  return (["top", "center", "bottom"] as const).map((v, row) =>
    (["left", "center", "right"] as const).map((h, col) => {
      const label = ["顶端", "垂直居中", "底端"][row] + ["左对齐", "水平居中", "右对齐"][col];
      const x = 5 + col * 3;
      const y = 7 + row * 4;
      return `<button type="button" aria-pressed="false" aria-label="${label}" title="${label}" data-table-tool="align:${h}:${v}">
        ${svg(`<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M${x} ${y}h8m-8 2.8h6" stroke="#187eae"/>`)}
      </button>`;
    }).join("")).join("");
}

function propertiesForm(): string {
  return `<form class="ho-table-form" data-table-form="properties" aria-label="表格属性">
    <label>表格对齐<select name="align"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
    <label>表格宽度<input name="width" type="number" min="0.01" step="any" aria-label="表格宽度（厘米）" /><span>cm</span></label>
    <label>行高规则<select name="rule"><option value="auto">自动</option><option value="atLeast">最小值</option><option value="exact">固定值</option></select></label>
    <label>指定行高<input name="height" type="number" min="0.01" step="any" aria-label="指定行高（厘米）" /><span>cm</span></label>
    ${item("应用", "properties")}
  </form>`;
}

function marginsForm(): string {
  return `<form class="ho-table-form" data-table-form="margins" aria-label="单元格边距">
    ${Object.entries({ top: "上边距", bottom: "下边距", left: "左边距", right: "右边距" }).map(([name, label]) =>
      `<label>${label}<input name="${name}" type="number" min="0" step="any" required aria-label="${label}（厘米）" /><span>cm</span></label>`).join("")}
    ${item("应用", "margins")}
  </form>`;
}

function splitForm(): string {
  return `<form class="ho-table-form" data-table-form="split" aria-label="拆分单元格">
    <label>拆成几行<input name="rows" type="number" min="1" max="12" step="1" required /></label>
    <label>拆成几列<input name="columns" type="number" min="1" max="12" step="1" required /></label>
    ${item("拆分", "split-selection")}
  </form>`;
}

function formulaForm(): string {
  const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, name]) =>
    `<option value="${value}">${name}</option>`).join("");
  return `<form class="ho-table-form" data-table-form="formula" aria-label="表格公式">
    <label>函数<select name="operation">${options({ SUM: "求和", AVERAGE: "平均值", COUNT: "计数", MIN: "最小值", MAX: "最大值" })}</select></label>
    <label>取值范围<select name="direction">${options({ ABOVE: "上方", BELOW: "下方", LEFT: "左侧", RIGHT: "右侧" })}</select></label>
    ${item("计算并插入", "formula")}
  </form>`;
}

function grid(fill = "", extra = ""): string {
  return svg(`${fill}<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16m6-16v16M3 9h18M3 15h18"/>${extra}`);
}

function insertion(arrow: string, divider: string): string {
  return svg(`<rect x="4" y="4" width="16" height="16" rx="2" fill="#e7f4fe"/><path d="${divider}"/><path d="${arrow}" stroke="#187eae" stroke-width="1.7"/>`);
}

function svg(content: string): string {
  return `<svg class="ho-table-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
}
