import { afterEach, describe, expect, it } from "vitest";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("功能区更改大小写菜单", () => {
  it("展开 Aa 下拉菜单包含 7 种大小写/半全角选项并触发 applyCase，点击外部或 Esc 收起", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(host, outside);

    const ribbon = new Ribbon(
      host,
      stub(baseState(), (name, arg) => {
        calls.push(`${name}:${String(arg ?? "")}`);
      }),
    );

    const drop = host.querySelector<HTMLElement>(".ho-word-case-drop")!;
    const trigger = drop.querySelector<HTMLButtonElement>("[data-drop-toggle]")!;
    const items = [...drop.querySelectorAll<HTMLButtonElement>("[data-case]")];
    expect(items.map((item) => item.textContent)).toEqual([
      "句首字母大写",
      "小写",
      "大写",
      "每个单词首字母大写",
      "切换大小写",
      "半角",
      "全角",
    ]);

    trigger.click();
    expect(drop.classList.contains("is-open")).toBe(true);

    items[2].click();
    expect(calls[0]).toBe("applyCase:upper");
    expect(drop.classList.contains("is-open")).toBe(false);

    trigger.click();
    expect(drop.classList.contains("is-open")).toBe(true);
    items[5].click();
    expect(calls[1]).toBe("applyCase:halfwidth");
    expect(drop.classList.contains("is-open")).toBe(false);

    // 外部点击与 Escape 自动收起
    trigger.click();
    expect(drop.classList.contains("is-open")).toBe(true);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(drop.classList.contains("is-open")).toBe(false);

    trigger.click();
    expect(drop.classList.contains("is-open")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(drop.classList.contains("is-open")).toBe(false);

    // 清除格式按钮仍然保留
    host.querySelector<HTMLButtonElement>("[data-act='clear']")?.click();
    expect(calls[2]).toBe('applyFormat:{"type":"clear"}');

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
      return (arg: unknown) => onAct(String(prop), typeof arg === "object" && arg !== null ? JSON.stringify(arg) : arg);
    },
  });
}
