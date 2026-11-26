import { afterEach, describe, expect, it } from "vitest";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("功能区编号列表", () => {
  it("支持开关按钮、编号库选择、记住最近使用和文档编号格式展示", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const state = baseState();
    state.documentNumberings = [
      { numFmt: "decimal", lvlText: "%1.", start: 1 },
      { numFmt: "chineseCounting", lvlText: "%1、", start: 1 },
    ];
    const actions = stub(state, (name, arg) => calls.push(`${name}:${JSON.stringify(arg)}`));
    const ribbon = new Ribbon(host, actions);

    const docWrap = host.querySelector<HTMLElement>("[data-num-doc-wrap]");
    expect(docWrap?.hidden).toBe(false);
    expect(host.querySelectorAll("[data-num-doc] [data-num-fmt]")).toHaveLength(2);

    // 直接点主按钮开关编号
    host.querySelector<HTMLButtonElement>("[data-act=numbering-toggle]")?.click();
    expect(calls[0]).toBe('applyOutline:{"type":"toggleNumbering","numFmt":"decimal","lvlText":"%1.","start":1}');

    // 从编号库选 一、 二、 三、 后记住到最近使用，再点主按钮沿用
    host
      .querySelector<HTMLButtonElement>("[data-num-library] [data-num-fmt='chineseCounting'][data-num-text='%1、']")
      ?.click();
    expect(calls[1]).toBe('applyOutline:{"type":"numbering","numFmt":"chineseCounting","lvlText":"%1、","start":1}');
    expect(host.querySelector("[data-num-recent] [data-num-fmt='chineseCounting'][data-num-text='%1、']")).toBeTruthy();

    host.querySelector<HTMLButtonElement>("[data-act=numbering-toggle]")?.click();
    expect(calls[2]).toBe('applyOutline:{"type":"toggleNumbering","numFmt":"chineseCounting","lvlText":"%1、","start":1}');

    // 同步高亮当前编号格式，大纲按钮不误亮
    state.numberingFormat = { numFmt: "chineseCounting", lvlText: "%1、", start: 1 };
    state.listLevel = 0;
    ribbon.sync();
    expect(host.querySelector("[data-act=numbering-toggle]")?.classList.contains("is-on")).toBe(true);
    expect(
      host
        .querySelector("[data-num-library] [data-num-fmt='chineseCounting'][data-num-text='%1、']")
        ?.classList.contains("is-on"),
    ).toBe(true);
    expect(host.querySelector(".ho-word-outline-drop > [data-drop-toggle]")?.classList.contains("is-on")).toBe(false);

    ribbon.destroy();
  });

  it("定义新的编号格式弹窗可自定义样式、模板和起始编号并应用", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const ribbon = new Ribbon(host, stub(baseState(), (name, arg) => calls.push(`${name}:${JSON.stringify(arg)}`)));

    host.querySelector<HTMLButtonElement>("[data-num-custom]")?.click();
    const dialog = document.querySelector<HTMLElement>(".ho-word-numbering-dialog");
    expect(dialog?.hidden).toBe(false);

    const fmt = dialog?.querySelector<HTMLSelectElement>("[data-num-fmt]");
    const pattern = dialog?.querySelector<HTMLInputElement>("[data-num-pattern]");
    const start = dialog?.querySelector<HTMLInputElement>("[data-num-start]");
    if (fmt && pattern && start) {
      fmt.value = "upperRoman";
      fmt.dispatchEvent(new Event("change", { bubbles: true }));
      pattern.value = "第%1章";
      pattern.dispatchEvent(new Event("input", { bubbles: true }));
      start.value = "3";
      start.dispatchEvent(new Event("input", { bubbles: true }));
    }
    expect(dialog?.querySelector("[data-num-preview]")?.textContent).toContain("第III章");
    dialog?.querySelector<HTMLButtonElement>("[data-num-ok]")?.click();
    expect(dialog?.hidden).toBe(true);
    expect(calls).toEqual(['applyOutline:{"type":"numbering","numFmt":"upperRoman","lvlText":"第%1章","start":3}']);

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
