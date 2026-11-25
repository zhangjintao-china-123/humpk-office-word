import { describe, expect, it } from "vitest";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";

describe("插入功能区", () => {
  it("空白页和图片按钮会调用对应动作", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const ribbon = new Ribbon(host, stub((name) => calls.push(name)));
    expect(host.querySelector("[data-act=insert-blank-page]")?.textContent).toContain("空白页");
    expect(host.querySelector("[data-act=insert-picture]")?.textContent).toContain("图片");
    host.querySelector<HTMLButtonElement>("[data-tab=insert]")?.click();
    host.querySelector<HTMLButtonElement>("[data-act=insert-blank-page]")?.click();
    host.querySelector<HTMLButtonElement>("[data-act=insert-picture]")?.click();
    expect(calls).toEqual(["insertBlankPage", "insertPicture"]);
    expect(ribbon.el.querySelector("[data-page=insert]")?.hasAttribute("hidden")).toBe(false);
  });

  it("选中图片后出现图片工具，环绕和位置会调用动作", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const actions = stub((name, ...args) => calls.push([name, ...args].join(":")));
    const state = actions.formatState();
    state.inPicture = true;
    state.pictureWrap = "inline";
    new Ribbon(host, actions);
    host.querySelector<HTMLButtonElement>("[data-tab=picture]")?.click();
    host.querySelector<HTMLButtonElement>("[data-picture-wrap=square]")?.click();
    host.querySelector<HTMLButtonElement>("[data-picture-place=top-right]")?.click();
    expect(calls).toContain("applyPictureWrap:square");
    expect(calls).toContain("applyPicturePlace:top-right");
    expect(host.querySelector("[data-tab=picture]")?.hasAttribute("hidden")).toBe(false);
  });
});

function stub(onAct: (name: string, ...args: string[]) => void): RibbonHost {
  const state: RibbonState = {
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
  return new Proxy({} as RibbonHost, {
    get(_target, prop) {
      if (prop === "formatState") {
        return () => state;
      }
      return (...args: unknown[]) => onAct(String(prop), ...args.map(String));
    },
  });
}
