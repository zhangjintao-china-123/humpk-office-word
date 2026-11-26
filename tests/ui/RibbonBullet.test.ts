import { afterEach, describe, expect, it } from "vitest";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("功能区项目符号", () => {
  it("支持开关按钮、符号库选择、记住最近使用和文档项目符号展示", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const state = baseState();
    state.documentBullets = ["●", "▪"];
    const actions = stub(state, (name, arg) => calls.push(`${name}:${JSON.stringify(arg)}`));
    const ribbon = new Ribbon(host, actions);

    const docWrap = host.querySelector<HTMLElement>("[data-bullet-doc-wrap]");
    expect(docWrap?.hidden).toBe(false);
    expect(host.querySelectorAll("[data-bullet-doc] [data-bullet-symbol]")).toHaveLength(2);

    // 直接点主按钮开关项目符号
    host.querySelector<HTMLButtonElement>("[data-act=bullet-toggle]")?.click();
    expect(calls[0]).toBe('applyOutline:{"type":"toggleBullet","symbol":"●"}');

    // 从项目符号库选 ■ 后，记住到最近使用，再点主按钮使用 ■
    host.querySelector<HTMLButtonElement>("[data-bullet-library] [data-bullet-symbol='■']")?.click();
    expect(calls[1]).toBe('applyOutline:{"type":"bullet","symbol":"■"}');
    expect(host.querySelector("[data-bullet-recent] [data-bullet-symbol='■']")).toBeTruthy();

    host.querySelector<HTMLButtonElement>("[data-act=bullet-toggle]")?.click();
    expect(calls[2]).toBe('applyOutline:{"type":"toggleBullet","symbol":"■"}');

    // 同步高亮当前项目符号
    state.bulletGlyph = "■";
    state.listLevel = 0;
    ribbon.sync();
    expect(host.querySelector("[data-act=bullet-toggle]")?.classList.contains("is-on")).toBe(true);
    expect(host.querySelector("[data-bullet-library] [data-bullet-symbol='■']")?.classList.contains("is-on")).toBe(true);
  });

  it("定义新项目符号弹窗可选择或输入自定义符号并应用", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const state = baseState();
    new Ribbon(host, stub(state, (name, arg) => calls.push(`${name}:${JSON.stringify(arg)}`)));

    host.querySelector<HTMLButtonElement>("[data-bullet-custom]")?.click();
    const dialog = document.querySelector<HTMLElement>(".ho-word-bullet-dialog");
    expect(dialog?.hidden).toBe(false);

    const input = dialog?.querySelector<HTMLInputElement>("[data-bullet-input]");
    if (input) {
      input.value = "★";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    dialog?.querySelector<HTMLButtonElement>("[data-bullet-ok]")?.click();
    expect(dialog?.hidden).toBe(true);
    expect(calls).toEqual(['applyOutline:{"type":"bullet","symbol":"★"}']);
    dialog?.remove();
  });

  it("展开菜单后点击外部或按 Escape 会收起菜单", () => {
    const host = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(host, outside);
    const ribbon = new Ribbon(host, stub(baseState(), () => undefined));

    const drop = host.querySelector<HTMLElement>(".ho-word-bullet-drop")!;
    const arrow = drop.querySelector<HTMLButtonElement>("[data-drop-toggle]")!;
    arrow.click();
    expect(drop.classList.contains("is-open")).toBe(true);

    // 点菜单外部区域收起
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(drop.classList.contains("is-open")).toBe(false);

    // 再次展开并按 Escape 收起
    arrow.click();
    expect(drop.classList.contains("is-open")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(drop.classList.contains("is-open")).toBe(false);

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
