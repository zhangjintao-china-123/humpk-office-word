import { afterEach, describe, expect, it, vi } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { CaretPos } from "../../src/selection/CaretPos";
import { Ribbon, type RibbonHost, type RibbonState } from "../../src/ui/ribbon/Ribbon";
import { Workspace } from "../../src/ui/workspace/Workspace";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("功能区格式刷按钮", () => {
  it("单击进入单次模式、再次点击退出，双击进入连续模式并高亮锁定", () => {
    const calls: string[] = [];
    const host = document.createElement("div");
    const state = baseState();
    const ribbon = new Ribbon(
      host,
      stub(state, (name, arg) => {
        calls.push(`${name}:${String(arg ?? "")}`);
        if (name === "startFormatPainter") {
          state.formatPainter = arg ? "locked" : "once";
        } else if (name === "cancelFormatPainter") {
          state.formatPainter = "off";
        }
      }),
    );

    const btn = host.querySelector<HTMLButtonElement>("[data-act='format-painter']")!;
    expect(btn).toBeTruthy();

    // 单击启动单次模式
    btn.click();
    expect(calls[0]).toBe("startFormatPainter:false");
    expect(btn.classList.contains("is-on")).toBe(true);
    expect(btn.classList.contains("is-locked")).toBe(false);

    // 再次单击取消
    btn.click();
    expect(calls[1]).toBe("cancelFormatPainter:");
    expect(btn.classList.contains("is-on")).toBe(false);

    // 双击进入连续锁定模式
    btn.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
    expect(calls[2]).toBe("startFormatPainter:true");
    expect(btn.classList.contains("is-on")).toBe(true);
    expect(btn.classList.contains("is-locked")).toBe(true);

    ribbon.destroy();
  });
});

describe("Workspace 格式刷交互", () => {
  function stubCanvas2d() {
    const ctx = {
      canvas: { width: 800, height: 600 },
      save() {},
      restore() {},
      scale() {},
      translate() {},
      setTransform() {},
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fill() {},
      ellipse() {},
      rect() {},
      clip() {},
      setLineDash() {},
      fillText() {},
      measureText: (text: string) => ({ width: text.length * 8 }),
      drawImage() {},
      font: "",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      textBaseline: "alphabetic",
    } as unknown as CanvasRenderingContext2D;
    return vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx);
  }

  function makeThreeParagraphDoc(): Document {
    const document = new Document();
    const p1 = new Paragraph(1);
    const b1 = new Block();
    b1.text = "源文";
    b1.style = { bold: true, color: "#C00000" };
    p1.attrs = { textAlign: "center" };
    p1.addBlock(b1);

    const p2 = new Paragraph(2);
    const b2 = new Block();
    b2.text = "目标一";
    p2.addBlock(b2);

    const p3 = new Paragraph(3);
    const b3 = new Block();
    b3.text = "目标二";
    p3.addBlock(b3);

    document.addParagraph(p1);
    document.addParagraph(p2);
    document.addParagraph(p3);
    new WordStreamBuilder().buildStoryOnly(document);
    return document;
  }

  it("单次模式点击目标段落应用格式后自动退出；连续模式可连续应用直到按 Esc", () => {
    const spy = stubCanvas2d();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 900, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 700, configurable: true });
    document.body.appendChild(host);

    const workspace = new Workspace(host);
    const doc = makeThreeParagraphDoc();
    workspace.load(doc);

    const [p1, p2, p3] = doc.paragraphs.toArray();
    const firstWordOf = (paragraph: Paragraph) => {
      let node = doc.words.head;
      while (node && node.data.paragraph !== paragraph) {
        node = node.next;
      }
      return node!;
    };

    const w1 = firstWordOf(p1);
    const w2 = firstWordOf(p2);
    const w3 = firstWordOf(p3);
    const scroll = host.querySelector<HTMLElement>(".ho-word-scroll")!;

    // 选中第一段并开启单次格式刷
    workspace.selection.collapse(new CaretPos({ slot: "body" }, w1, false));
    workspace.startFormatPainter(false);
    expect(workspace.formatPainterState()).toBe("once");
    expect(host.classList.contains("is-format-painter")).toBe(true);

    // 模拟点击第二段
    const hitSpy = vi.spyOn(workspace, "hitClient").mockImplementation(() => new CaretPos({ slot: "body" }, w2, false));
    scroll.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 50, clientY: 50, pointerId: 1 }));
    scroll.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 50, clientY: 50, pointerId: 1 }));

    expect(w2.data.getStyle()?.bold).toBe(true);
    expect(w2.data.getStyle()?.color).toBe("#C00000");
    expect(p2.attrs.textAlign).toBe("center");
    // 单次模式已自动退出
    expect(workspace.formatPainterState()).toBe("off");
    expect(host.classList.contains("is-format-painter")).toBe(false);

    // 撤销恢复第二段，切回第一段并开启连续模式
    workspace.history.undo();
    expect(w2.data.getStyle()?.bold).toBeFalsy();
    workspace.selection.collapse(new CaretPos({ slot: "body" }, w1, false));
    workspace.startFormatPainter(true);
    expect(workspace.formatPainterState()).toBe("locked");

    // 连续刷第二段与第三段
    scroll.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 50, clientY: 50, pointerId: 1 }));
    scroll.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 50, clientY: 50, pointerId: 1 }));
    expect(workspace.formatPainterState()).toBe("locked");
    expect(w2.data.getStyle()?.bold).toBe(true);

    hitSpy.mockImplementation(() => new CaretPos({ slot: "body" }, w3, false));
    scroll.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 50, clientY: 80, pointerId: 1 }));
    scroll.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 50, clientY: 80, pointerId: 1 }));
    expect(workspace.formatPainterState()).toBe("locked");
    expect(w3.data.getStyle()?.bold).toBe(true);
    expect(p3.attrs.textAlign).toBe("center");

    // Esc 退出连续格式刷
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(workspace.formatPainterState()).toBe("off");
    expect(host.classList.contains("is-format-painter")).toBe(false);

    hitSpy.mockRestore();
    workspace.dispose();
    spy.mockRestore();
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
