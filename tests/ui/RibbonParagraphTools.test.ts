import { afterEach, describe, expect, it } from "vitest";
import type { AsianLayoutAction, AsianLayoutStateInfo } from "../../src/edit/AsianLayoutCommand";
import type { SortOptions, SortTargetInfo } from "../../src/edit/SortCommand";
import type { TableBorderMode } from "../../src/edit/TableBorderApplier";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("功能区段落工具：中文版式、排序、编辑标记、底纹、边框", () => {
  it("中文版式菜单打开对应弹窗，实时预览并提交 apply 与 remove", () => {
    const actions: AsianLayoutAction[] = [];
    const host = document.createElement("div");
    document.body.append(host);

    const state = baseState();
    state.asianLayout = true;
    const ribbon = new Ribbon(
      host,
      stub(state, undefined, {
        inspectAsianLayout: (kind): AsianLayoutStateInfo => ({
          text: "中文版式",
          spec: { kind: kind ?? "twoInOne", brackets: "round", fitWidthPx: 48, compress: true },
          active: true,
        }),
        applyAsianLayout: (action) => actions.push(action),
      }),
    );

    const asianDrop = host.querySelector<HTMLElement>(".ho-word-asian-drop")!;
    const trigger = asianDrop.querySelector<HTMLButtonElement>("[data-drop-toggle]")!;
    expect(trigger.classList.contains("is-on")).toBe(true);

    trigger.click();
    expect(asianDrop.classList.contains("is-open")).toBe(true);

    asianDrop.querySelector<HTMLButtonElement>("[data-asian-layout='twoInOne']")!.click();
    const dialog = document.querySelector<HTMLElement>(".ho-word-asian-dialog")!;
    expect(dialog.hidden).toBe(false);

    const select = dialog.querySelector<HTMLSelectElement>("[data-asian-brackets]")!;
    select.value = "square";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(dialog.querySelector("[data-asian-preview]")?.textContent).toContain("[");

    dialog.querySelector<HTMLButtonElement>("[data-asian-ok]")!.click();
    expect(actions[0]).toEqual({
      type: "apply",
      text: "中文版式",
      spec: { kind: "twoInOne", brackets: "square" },
    });

    // 快捷清除中文版式
    trigger.click();
    asianDrop.querySelector<HTMLButtonElement>("[data-asian-layout='remove']")!.click();
    expect(actions[1]).toEqual({ type: "remove" });

    ribbon.destroy();
  });

  it("排序按钮打开弹窗并提交排序参数，显示/隐藏编辑标记按钮切换并同步状态", () => {
    const sortCalls: SortOptions[] = [];
    let toggledMarks = 0;
    const host = document.createElement("div");
    document.body.append(host);

    const state = baseState();
    state.showMarks = true;
    const ribbon = new Ribbon(
      host,
      stub(state, undefined, {
        inspectSort: (): SortTargetInfo => ({ mode: "paragraphs", count: 5, columnCount: 1, activeColumn: 0 }),
        applySort: (opts) => sortCalls.push(opts),
        toggleShowMarks: () => {
          toggledMarks += 1;
        },
      }),
    );

    const marksBtn = host.querySelector<HTMLButtonElement>("[data-act='show-marks']")!;
    expect(marksBtn.classList.contains("is-on")).toBe(true);
    marksBtn.click();
    expect(toggledMarks).toBe(1);

    host.querySelector<HTMLButtonElement>("[data-act='sort']")!.click();
    const sortDialog = document.querySelector<HTMLElement>(".ho-word-sort-dialog")!;
    expect(sortDialog.hidden).toBe(false);

    const kindSelect = sortDialog.querySelector<HTMLSelectElement>("[data-sort-kind]")!;
    kindSelect.value = "number";
    const descRadio = sortDialog.querySelector<HTMLInputElement>('input[name="ho-word-sort-order"][value="desc"]')!;
    descRadio.checked = true;
    descRadio.dispatchEvent(new Event("change", { bubbles: true }));

    sortDialog.querySelector<HTMLButtonElement>("[data-sort-ok]")!.click();
    expect(sortCalls[0]).toEqual({ order: "desc", kind: "number", hasHeader: false, columnIndex: 0 });

    ribbon.destroy();
  });

  it("底纹调色板和段落边框在非表格段落中也能启用并触发动作", () => {
    const shades: string[] = [];
    const borders: TableBorderMode[] = [];
    const host = document.createElement("div");
    document.body.append(host);

    const state = baseState();
    state.inTable = false;
    state.hasDoc = true;
    state.paraShading = "#FFC000";
    const ribbon = new Ribbon(
      host,
      stub(state, undefined, {
        applyShading: (color) => shades.push(color),
        applyTableBorder: (mode) => borders.push(mode),
      }),
    );

    const swatch = host.querySelector<HTMLElement>("[data-swatch='para-shading']")!;
    expect(swatch.style.background).toBeTruthy();

    host.querySelector<HTMLButtonElement>("[data-para-shade='#E7E6E6']")!.click();
    expect(shades[0]).toBe("#E7E6E6");

    host.querySelector<HTMLButtonElement>("[data-para-shade='none']")!.click();
    expect(shades[1]).toBe("none");

    const borderDrop = host.querySelector<HTMLElement>(".ho-word-para .ho-word-border-drop")!;
    expect(borderDrop.classList.contains("is-disabled")).toBe(false);
    borderDrop.querySelector<HTMLButtonElement>("[data-border='outside']")!.click();
    expect(borders[0]).toBe("outside");

    ribbon.destroy();
  });
});

function baseState(): RibbonState {
  return {
    fontFamily: "宋体",
    fontSizePt: 11,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: "auto",
    highlight: "none",
    shading: false,
    enclosed: false,
    asianLayout: false,
    showMarks: false,
    paraShading: "none",
    align: "left",
    indent: "none",
    canIndentLess: false,
    lineSpacing: "1",
    paraGap: "0",
    paragraphStyle: "normal",
    canUndo: false,
    canRedo: false,
    hasDoc: true,
    caption: "未命名文档",
    inTable: false,
    inPicture: false,
    borderPen: { type: "single", size: "8", color: "000000" },
    titlePg: false,
    evenAndOdd: false,
    zoom: 1,
  };
}

function stub(
  state: RibbonState,
  onAct?: (name: string, arg: unknown) => void,
  overrides?: Partial<RibbonHost>,
): RibbonHost {
  return new Proxy({} as RibbonHost, {
    get(_target, prop) {
      if (overrides && prop in overrides) {
        return overrides[prop as keyof RibbonHost];
      }
      if (prop === "formatState") {
        return () => state;
      }
      return (arg: unknown) => onAct?.(String(prop), typeof arg === "object" && arg !== null ? JSON.stringify(arg) : arg);
    },
  });
}
