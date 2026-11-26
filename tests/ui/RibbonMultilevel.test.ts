import { afterEach, describe, expect, it } from "vitest";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("功能区多级列表", () => {
  it("展示当前列表与 7 种预设列表库，支持点击预设和更改级别", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const state = baseState();
    state.currentList = [
      { ilvl: 0, label: "●" },
      { ilvl: 1, label: "■" },
      { ilvl: 2, label: "◆" },
    ];
    state.listLevel = 0;
    const ribbon = new Ribbon(host, stub(state, (name, arg) => calls.push(`${name}:${JSON.stringify(arg)}`)));

    expect(host.querySelector<HTMLElement>("[data-ml-current-wrap]")?.hidden).toBe(false);
    expect(host.querySelector("[data-ml-current]")?.textContent).toContain("●");
    expect(host.querySelectorAll("[data-ml-library] [data-ml-preset]")).toHaveLength(7);

    // 点击「第 I 条 标题 1」预设
    host.querySelector<HTMLButtonElement>("[data-ml-preset='article-heading']")?.click();
    expect(calls[0]).toBe('applyOutline:{"type":"multilevel","presetId":"article-heading"}');

    // 点击级别 3
    host.querySelector<HTMLButtonElement>("[data-outline='level'][data-ilvl='2']")?.click();
    expect(calls[1]).toBe('applyOutline:{"type":"level","ilvl":2}');

    // 命中预设后对应卡片高亮
    state.multilevelId = "article-heading";
    state.listLevel = 2;
    ribbon.sync();
    expect(host.querySelector("[data-ml-preset='article-heading']")?.classList.contains("is-on")).toBe(true);
    expect(host.querySelector("[data-outline='level'][data-ilvl='2']")?.classList.contains("is-on")).toBe(true);

    ribbon.destroy();
  });

  it("定义新的多级列表 / 列表样式弹窗可分级别配置并应用", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const ribbon = new Ribbon(host, stub(baseState(), (name, arg) => calls.push(`${name}:${JSON.stringify(arg)}`)));

    host.querySelector<HTMLButtonElement>("[data-ml-custom='list']")?.click();
    const dialog = document.querySelector<HTMLElement>(".ho-word-multilevel-dialog");
    expect(dialog?.hidden).toBe(false);

    // 切换到第 2 级并修改编号格式
    dialog?.querySelector<HTMLButtonElement>("[data-ml-level='1']")?.click();
    const pattern = dialog?.querySelector<HTMLInputElement>("[data-ml-pattern]");
    const heading = dialog?.querySelector<HTMLSelectElement>("[data-ml-heading]");
    if (pattern && heading) {
      pattern.value = "第%2节";
      pattern.dispatchEvent(new Event("input", { bubbles: true }));
      heading.value = "2";
      heading.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(dialog?.querySelector("[data-ml-preview]")?.textContent).toContain("第1节");
    dialog?.querySelector<HTMLButtonElement>("[data-ml-ok]")?.click();
    expect(dialog?.hidden).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('"type":"multilevel"');
    expect(calls[0]).toContain('"linkHeading":true');
    expect(calls[0]).toContain('"lvlText":"第%2节"');

    // 定义新的列表样式也可正常打开弹窗
    host.querySelector<HTMLButtonElement>("[data-ml-custom='style']")?.click();
    expect(dialog?.hidden).toBe(false);
    expect(dialog?.querySelector("[data-ml-title]")?.textContent).toBe("定义新的列表样式");

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

function stub(state: RibbonState, onAct: (name: string, arg: unknown) => void): RibbonHost {
  return new Proxy({} as RibbonHost, {
    get(_target, prop) {
      if (prop === "formatState") {
        return () => state;
      }
      return (arg: unknown) => onAct(String(prop), arg);
    },
  });
}
