import { afterEach, describe, expect, it } from "vitest";
import type { EnclosedAction, EnclosedStateInfo } from "../../src/edit/EnclosedCommand";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("功能区字符底纹与带圈字符", () => {
  it("点击字符底纹按钮触发 shading 动作，并随 state.shading 高亮", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    document.body.append(host);

    const state = baseState();
    state.shading = true;
    const ribbon = new Ribbon(
      host,
      stub(state, (name, arg) => {
        calls.push(`${name}:${String(arg ?? "")}`);
      }),
    );

    const shadingBtn = host.querySelector<HTMLButtonElement>("[data-act='shading']")!;
    expect(shadingBtn.classList.contains("is-on")).toBe(true);
    shadingBtn.click();
    expect(calls).toContain('applyFormat:{"type":"shading"}');

    ribbon.destroy();
  });

  it("点击带圈字符按钮打开弹窗，支持切换样式与形状、实时预览并提交 apply 或 remove", () => {
    const actions: EnclosedAction[] = [];
    const host = document.createElement("div");
    document.body.append(host);

    const state = baseState();
    state.enclosed = true;
    const ribbon = new Ribbon(
      host,
      stub(state, undefined, {
        inspectEnclosed: (): EnclosedStateInfo => ({
          text: "字",
          shape: "circle",
          mode: "shrink",
          active: true,
        }),
        applyEnclosed: (action) => {
          actions.push(action);
        },
      }),
    );

    const enclosedBtn = host.querySelector<HTMLButtonElement>("[data-act='enclosed']")!;
    expect(enclosedBtn.classList.contains("is-on")).toBe(true);

    enclosedBtn.click();
    const dialog = document.querySelector<HTMLElement>(".ho-word-enclosed-dialog")!;
    expect(dialog.hidden).toBe(false);

    const textInput = dialog.querySelector<HTMLInputElement>("[data-enclosed-text]")!;
    expect(textInput.value).toBe("字");
    textInput.value = "12";
    textInput.dispatchEvent(new Event("input", { bubbles: true }));

    dialog.querySelector<HTMLButtonElement>("[data-enclosed-style='enlarge']")!.click();
    dialog.querySelector<HTMLButtonElement>("[data-enclosed-shape='triangle']")!.click();
    const preview = dialog.querySelector<HTMLElement>("[data-enclosed-preview]")!;
    expect(preview.textContent).toContain("12");
    expect(preview.querySelector(".ho-word-enclosed-preview-badge")?.classList.contains("is-triangle")).toBe(true);
    expect(preview.querySelector(".ho-word-enclosed-preview-badge")?.classList.contains("is-enlarge")).toBe(true);

    dialog.querySelector<HTMLButtonElement>("[data-enclosed-ok]")!.click();
    expect(dialog.hidden).toBe(true);
    expect(actions[0]).toEqual({ type: "apply", text: "12", shape: "triangle", mode: "enlarge" });

    // 再次打开选择「无」提交 remove
    enclosedBtn.click();
    dialog.querySelector<HTMLButtonElement>("[data-enclosed-style='none']")!.click();
    dialog.querySelector<HTMLButtonElement>("[data-enclosed-ok]")!.click();
    expect(actions[1]).toEqual({ type: "remove" });

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
