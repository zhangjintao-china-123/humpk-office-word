import { describe, expect, it } from "vitest";
import { Block } from "../../src/model/block/Block";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Document } from "../../src/model/document/Document";
import { WordStreamBuilder } from "../../src/model/flatten/WordStreamBuilder";
import { Table, TableCell, TableRow } from "../../src/model/table/Table";
import { CaretPos } from "../../src/selection/CaretPos";
import { SelRange } from "../../src/selection/SelRange";
import { Selection } from "../../src/selection/Selection";
import type { StoryRef } from "../../src/selection/StoryRef";
import { ContextMenuBuilder } from "../../src/ui/contextmenu/ContextMenuBuilder";
import { ContextMenuController } from "../../src/ui/contextmenu/ContextMenuController";
import type { ContextMenuEntry } from "../../src/ui/contextmenu/ContextMenuItem";

const body: StoryRef = { slot: "body" };

function doc(value: string): Document {
  const document = new Document();
  const paragraph = new Paragraph(1);
  const block = new Block();
  block.text = value;
  paragraph.addBlock(block);
  document.addParagraph(paragraph);
  new WordStreamBuilder().buildStoryOnly(document);
  return document;
}

function labels(entries: ContextMenuEntry[]): string[] {
  return entries.flatMap((entry) => {
    if (entry.kind === "separator") {
      return ["—"];
    }
    if (entry.kind === "submenu") {
      return [entry.label, ...labels(entry.children)];
    }
    return [entry.label];
  });
}

describe("ContextMenuBuilder", () => {
  const builder = new ContextMenuBuilder();

  it("折叠光标只启用粘贴，文字菜单带快捷键", () => {
    const entries = builder.build("text", false);
    const items = entries.filter((entry) => entry.kind === "item");
    expect(items.slice(0, 4).map((item) => [item.action, item.enabled, item.shortcut])).toEqual([
      ["cut", false, "Ctrl+X"],
      ["copy", false, "Ctrl+C"],
      ["paste", true, "Ctrl+V"],
      ["delete", false, "Del"],
    ]);
    expect(items.every((item) => item.icon)).toBe(true);
    expect(labels(entries)).toEqual([
      "剪切",
      "复制",
      "粘贴",
      "删除",
      "—",
      "字体",
      "加粗",
      "倾斜",
      "下划线",
      "删除线",
      "上标",
      "下标",
      "—",
      "清除格式",
      "段落",
      "左对齐",
      "居中",
      "右对齐",
      "两端对齐",
      "—",
      "增加缩进",
      "减少缩进",
      "—",
      "单倍行距",
      "1.5 倍行距",
      "2 倍行距",
      "—",
      "正文",
      "标题 1",
      "标题 2",
      "标题 3",
      "编号",
      "项目符号",
      "编号列表",
      "套用大纲",
      "提升一级",
      "降低一级",
      "取消编号",
      "—",
      "超链接",
      "取消超链接",
      "—",
      "查找",
      "替换",
      "新建批注",
    ]);
  });

  it("文字菜单标出当前字体和段落", () => {
    const entries = builder.build("text", {
      canEdit: true,
      text: {
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        superscript: false,
        subscript: false,
        align: "center",
        lineSpacing: "1.5",
        style: "heading1",
        canIndentLess: false,
        hasLink: false,
        hasList: false,
      },
    });
    const font = entries.find((entry) => entry.kind === "submenu" && entry.label === "字体");
    const paragraph = entries.find((entry) => entry.kind === "submenu" && entry.label === "段落");
    const bold = font?.kind === "submenu" ? font.children.find((entry) => entry.kind === "item" && entry.action === "bold") : undefined;
    const center = paragraph?.kind === "submenu" ? paragraph.children.find((entry) => entry.kind === "item" && entry.action === "alignCenter") : undefined;
    const indent = paragraph?.kind === "submenu" ? paragraph.children.find((entry) => entry.kind === "item" && entry.action === "indentLess") : undefined;
    expect(bold?.kind === "item" && bold.checked && bold.shortcut).toBe("Ctrl+B");
    expect(center?.kind === "item" && center.checked).toBe(true);
    expect(indent?.kind === "item" && indent.enabled).toBe(false);
  });

  it("表格菜单按 Word 分组插入、删除、合并和拆分", () => {
    const entries = builder.build("table", {
      canEdit: false,
      table: { canMerge: false, canSplit: true, canDeleteRow: true, canDeleteCol: false },
    });
    expect(labels(entries)).toEqual([
      "剪切",
      "复制",
      "粘贴",
      "—",
      "插入",
      "在上方插入行",
      "在下方插入行",
      "在左侧插入列",
      "在右侧插入列",
      "删除",
      "删除行",
      "删除列",
      "删除表格",
      "—",
      "合并单元格",
      "拆分单元格",
    ]);
    const merge = entries.find((entry) => entry.kind === "item" && entry.action === "mergeCells");
    const split = entries.find((entry) => entry.kind === "item" && entry.action === "splitCell");
    const remove = entries.find((entry) => entry.kind === "submenu" && entry.label === "删除");
    expect(merge?.kind === "item" && merge.enabled).toBe(false);
    expect(split?.kind === "item" && split.enabled).toBe(true);
    expect(remove?.kind === "submenu" && remove.children.map((child) => child.kind === "item" && child.enabled)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("图片菜单标出当前环绕方式", () => {
    const entries = builder.build("picture", { canEdit: true, pictureWrap: "square" });
    const wrap = entries.find((entry) => entry.kind === "submenu");
    expect(wrap?.kind === "submenu" && wrap.label).toBe("环绕文字");
    expect(wrap?.kind === "submenu" && wrap.children.filter((child) => child.kind === "item" && child.checked).map((child) => child.kind === "item" && child.action)).toEqual([
      "wrap:square",
    ]);
  });
});

describe("ContextMenuController", () => {
  it("右键阻止默认菜单，选区外先折叠再弹出", () => {
    const model = doc("abcd");
    const selection = new Selection();
    const start = new CaretPos(body, model.words.head, false);
    const end = new CaretPos(body, model.words.head!.next!.next, true);
    selection.setRange(new SelRange(body, start, end));

    const outside = new CaretPos(body, model.words.tail, false);
    let changed = 0;
    const host = globalThis.document.createElement("div");
    const scroll = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(host);
    const controller = new ContextMenuController({
      selection,
      hitClient: () => outside,
      onSelectionChange: () => {
        changed += 1;
      },
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteSelection: () => undefined,
    });
    controller.attach(host, scroll);

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 });
    scroll.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(selection.isCollapsed()).toBe(true);
    expect(selection.caret()?.equals(outside)).toBe(true);
    expect(changed).toBe(1);
    expect(controller.menu.isOpen()).toBe(true);
    const labels = [...controller.menu.el.querySelectorAll(".ho-word-context-label")].map((node) => node.textContent);
    expect(labels).toContain("字体");
    expect(labels).toContain("查找");
    const cut = [...controller.menu.el.querySelectorAll("button")].find((button) => button.querySelector(".ho-word-context-label")?.textContent === "剪切");
    expect(cut?.disabled).toBe(true);
    expect(cut?.querySelector(".ho-word-context-key")?.textContent).toBe("Ctrl+X");
    expect(cut?.querySelector(".ho-word-context-icon svg")).toBeTruthy();

    globalThis.document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(controller.menu.isOpen()).toBe(false);
    controller.detach();
    host.remove();
  });

  it("命中当前整格选区不改选区，弹出表格菜单", () => {
    const cell = new TableCell(doc("x"));
    const story: StoryRef = { slot: "cell", cell };
    const selection = new Selection();
    const pos = new CaretPos(story, cell.document.words.head, false);
    selection.setRange(new SelRange(story, pos, pos, "cell"));

    const host = document.createElement("div");
    const scroll = document.createElement("div");
    const controller = new ContextMenuController({
      selection,
      hitClient: () => new CaretPos(story, cell.document.words.tail, true),
      onSelectionChange: () => {
        throw new Error("should keep cell selection");
      },
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteSelection: () => undefined,
    });
    controller.attach(host, scroll);
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    expect(selection.primaryRange()?.mode).toBe("cell");
    expect(controller.menu.isOpen()).toBe(true);
    controller.detach();
  });

  it("右键点中图片时选中图片并弹出图片菜单", () => {
    const model = doc("ab");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, model.words.head, false));
    const picture = {
      drawing: { width: 40, height: 24 } as never,
      paragraph: model.paragraphs.head!.data,
      story: body,
      x: 0,
      y: 0,
      width: 40,
      height: 24,
      behind: false,
    };
    let selected = 0;
    const calls: string[] = [];
    const host = document.createElement("div");
    const scroll = document.createElement("div");
    const controller = new ContextMenuController({
      selection,
      hitClient: () => new CaretPos(body, model.words.head, false),
      pictureAtClient: () => picture,
      selectPicture: () => {
        selected += 1;
      },
      onSelectionChange: () => {
        throw new Error("picture menu should not collapse caret");
      },
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteSelection: () => undefined,
      pictureWrap: () => "square",
      applyPictureWrap: (wrap) => calls.push(wrap),
    });
    controller.attach(host, scroll);
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    expect(selected).toBe(1);
    expect(selection.isCollapsed()).toBe(true);
    expect(controller.menu.isOpen()).toBe(true);
    expect([...controller.menu.el.querySelectorAll(".ho-word-context-label")].map((node) => node.textContent)).toEqual([
      "剪切",
      "复制",
      "粘贴",
      "删除",
      "环绕文字",
      "嵌入型",
      "四周型",
      "紧密型",
      "穿越型",
      "上下型",
      "衬于文字下方",
      "浮于文字上方",
    ]);
    const checked = controller.menu.el.querySelector("button.is-checked");
    expect(checked?.querySelector(".ho-word-context-label")?.textContent).toBe("四周型");
    expect(checked?.querySelector(".ho-word-context-icon")?.textContent).toBe("✓");
    checked?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual(["square"]);
    controller.detach();
  });

  it("表格菜单把插入交给对应命令，未选中多格时不合并", () => {
    const cell = new TableCell(doc("x"));
    const story: StoryRef = { slot: "cell", cell };
    const selection = new Selection();
    const pos = new CaretPos(story, cell.document.words.head, false);
    selection.collapse(pos);
    const calls: string[] = [];
    const host = document.createElement("div");
    const scroll = document.createElement("div");
    const controller = new ContextMenuController({
      selection,
      hitClient: () => pos,
      onSelectionChange: () => undefined,
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteSelection: () => undefined,
      tableMenuState: () => ({ canMerge: false, canSplit: false, canDeleteRow: true, canDeleteCol: true }),
      insertTableRow: (where) => calls.push(`row:${where}`),
      mergeTableCells: () => calls.push("merge"),
    });
    controller.attach(host, scroll);
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    const below = [...controller.menu.el.querySelectorAll("button")].find((button) => button.textContent?.includes("在下方插入行"));
    below?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual(["row:below"]);
    expect(controller.menu.isOpen()).toBe(false);

    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    const merge = [...controller.menu.el.querySelectorAll("button")].find((button) => button.textContent?.includes("合并单元格"));
    merge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual(["row:below"]);
    controller.detach();
  });

  it("文字菜单把加粗和查找交给对应命令", async () => {
    const model = doc("ab");
    const selection = new Selection();
    selection.collapse(new CaretPos(body, model.words.head, false));
    const calls: string[] = [];
    const host = document.createElement("div");
    const scroll = document.createElement("div");
    const controller = new ContextMenuController({
      selection,
      hitClient: () => new CaretPos(body, model.words.head, false),
      onSelectionChange: () => undefined,
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteSelection: () => undefined,
      textMenuState: () => ({
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        superscript: false,
        subscript: false,
        align: "left",
        lineSpacing: "1",
        style: "normal",
        canIndentLess: false,
        hasLink: true,
        link: "https://example.com",
        hasList: false,
      }),
      applyFormat: (action) => calls.push(action.type),
      openFind: (replace) => calls.push(replace ? "replace" : "find"),
      applyLink: (raw) => calls.push(`link:${raw}`),
    });
    controller.attach(host, scroll);
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    const bold = [...controller.menu.el.querySelectorAll("button")].find((button) => button.querySelector(".ho-word-context-label")?.textContent === "加粗");
    expect(bold?.classList.contains("is-checked")).toBe(true);
    bold?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const find = () => [...controller.menu.el.querySelectorAll("button")].find((button) => button.querySelector(".ho-word-context-label")?.textContent === "查找");
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    find()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    const link = [...controller.menu.el.querySelectorAll("button")].find((button) => button.querySelector(".ho-word-context-label")?.textContent === "超链接");
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const input = document.querySelector<HTMLInputElement>(".ho-word-context-dialog input");
    expect(input?.value).toBe("https://example.com");
    if (input) {
      input.value = "https://word.test";
    }
    document.querySelector<HTMLButtonElement>(".ho-word-context-dialog .is-primary")?.click();
    await Promise.resolve();
    expect(calls).toEqual(["bold", "find", "link:https://word.test"]);
    controller.detach();
  });

  it("右键点表格左上控点会选中整张表并弹出表格菜单；已选中整表时右键格内不收起选区", () => {
    const a = new TableCell(doc("a"));
    a.rowIndex = 0;
    a.colIndex = 0;
    const b = new TableCell(doc("b"));
    b.rowIndex = 0;
    b.colIndex = 1;
    const table = new Table();
    const row = new TableRow();
    row.cells = [a, b];
    table.rows = [row];

    const document = new Document();
    const tablePara = new Paragraph(1);
    tablePara.isTable = true;
    tablePara.table = table;
    document.addParagraph(tablePara);
    const tailPara = new Paragraph(2);
    tailPara.addBlock(new Block());
    document.addParagraph(tailPara);
    new WordStreamBuilder().buildStoryOnly(document);

    const tableNode = document.words.head!;
    const selection = new Selection();
    selection.collapse(new CaretPos(body, document.words.tail, false));

    let hitPos = new CaretPos(body, tableNode, false);
    let selectionChanges = 0;
    const calls: string[] = [];
    const host = globalThis.document.createElement("div");
    const scroll = globalThis.document.createElement("div");
    const controller = new ContextMenuController({
      selection,
      hitClient: () => hitPos,
      flowOwner: () => ({ document, story: body }),
      onSelectionChange: () => {
        selectionChanges += 1;
      },
      copy: () => undefined,
      cut: () => undefined,
      paste: () => undefined,
      deleteSelection: () => undefined,
      tableMenuState: () => ({ canMerge: true, canSplit: false, canDeleteRow: false, canDeleteCol: true }),
      deleteTable: () => calls.push("deleteTable"),
    });
    controller.attach(host, scroll);

    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 6, clientY: 6 }));
    expect(selectionChanges).toBe(1);
    expect(selection.flow?.anchor.node).toBe(tableNode);
    expect(selection.flow?.anchor.after).toBe(false);
    expect(selection.flow?.focus.node).toBe(tableNode);
    expect(selection.flow?.focus.after).toBe(true);
    expect(controller.menu.isOpen()).toBe(true);
    const cut = [...controller.menu.el.querySelectorAll("button")].find((button) => button.dataset.act === "cut");
    const merge = [...controller.menu.el.querySelectorAll("button")].find((button) => button.dataset.act === "mergeCells");
    expect(cut?.disabled).toBe(false);
    expect(merge?.disabled).toBe(false);

    hitPos = new CaretPos({ slot: "cell", cell: b }, b.document.words.head, false);
    scroll.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 20 }));
    expect(selectionChanges).toBe(1);
    expect(selection.flow?.anchor.node).toBe(tableNode);

    const delTable = [...controller.menu.el.querySelectorAll("button")].find((button) => button.dataset.act === "deleteTable");
    delTable?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual(["deleteTable"]);
    controller.detach();
  });
});
