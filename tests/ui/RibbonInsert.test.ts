import { describe, expect, it } from "vitest";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";

describe("插入功能区", () => {
  it("文本框菜单分别启动横排和竖排绘制", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const ribbon = new Ribbon(host, stub((name, ...args) => calls.push([name, ...args].join(":"))));
    const trigger = host.querySelector<HTMLButtonElement>(".ho-word-textbox-trigger")!;
    host.querySelector<HTMLButtonElement>("[data-tab=insert]")!.click();
    for (const direction of ["horizontal", "vertical"]) {
      trigger.click();
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      host.querySelector<HTMLButtonElement>(`[data-draw-textbox=${direction}]`)!.click();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    }
    expect(calls).toEqual(["drawTextBox:horizontal", "drawTextBox:vertical"]);
    ribbon.destroy();
    host.remove();
  });

  it("封面库可选内置模板，且仅在文档有封面时允许删除", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const actions = stub((name, ...args) => calls.push([name, ...args].join(":")));
    const ribbon = new Ribbon(host, actions);
    const trigger = host.querySelector<HTMLButtonElement>(".ho-word-cover-trigger")!;
    const card = host.querySelector<HTMLButtonElement>("[data-cover-template=grove]")!;
    const remove = host.querySelector<HTMLButtonElement>("[data-act=remove-cover]")!;
    host.querySelector<HTMLButtonElement>("[data-tab=insert]")!.click();
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelectorAll("[data-cover-template]")).toHaveLength(6);
    expect(remove.disabled).toBe(true);
    card.click();
    expect(calls).toEqual(["insertCoverPage:grove"]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    actions.formatState().coverTemplate = "grove";
    ribbon.sync();
    trigger.click();
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(remove.disabled).toBe(false);
    remove.click();
    expect(calls.at(-1)).toBe("removeCoverPage");
    ribbon.destroy();
    host.remove();
  });

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

  it("文本框工具回显方向、对齐和颜色，与图片工具分别显示", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const actions = stub((name) => calls.push(name));
    const state = actions.formatState();
    state.inPicture = true;
    const ribbon = new Ribbon(host, actions);
    const tools = [...host.querySelectorAll<HTMLElement>("[data-textbox-tools]")];
    expect(tools.every((group) => group.hidden)).toBe(true);

    state.pictureIsTextBox = true;
    state.textBoxFormat = { fill: "#FF0000", textDirection: "vertical", textAlign: "end" };
    ribbon.sync();
    expect(tools.every((group) => !group.hidden)).toBe(true);
    expect(host.querySelector("[data-tab=picture]")?.textContent).toBe("文本框工具");
    expect(host.querySelector("[data-textbox-direction=vertical]")?.getAttribute("aria-pressed")).toBe("true");
    const align = host.querySelector<HTMLButtonElement>("[data-textbox-align=end]")!;
    expect(align.textContent).toBe("靠左");
    expect(align.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-textbox-paint=fill] [data-textbox-color="#FF0000"]')?.getAttribute("aria-pressed")).toBe("true");

    const fill = host.querySelector<HTMLButtonElement>("[data-textbox-paint=fill] [data-drop-toggle]")!;
    fill.click();
    expect(fill.getAttribute("aria-expanded")).toBe("true");
    host.querySelector<HTMLButtonElement>("[data-textbox-paint=fill] [data-textbox-color=none]")!.click();
    expect(fill.getAttribute("aria-expanded")).toBe("false");
    expect(calls).toEqual(["applyTextBoxFormat"]);
    ribbon.destroy();
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
