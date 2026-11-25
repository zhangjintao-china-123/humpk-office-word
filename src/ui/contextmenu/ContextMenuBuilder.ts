import type { PictureWrap } from "../../edit/PictureTransform";
import { RibbonIcons } from "../ribbon/RibbonIcons";
import { MenuIcons } from "./ContextMenuIcons";
import type {
  ContextMenuAction,
  ContextMenuEntry,
  ContextMenuKind,
  ContextMenuState,
  TableMenuState,
  TextMenuState,
} from "./ContextMenuItem";

const WRAPS: Array<{ wrap: PictureWrap; label: string }> = [
  { wrap: "inline", label: "嵌入型" },
  { wrap: "square", label: "四周型" },
  { wrap: "tight", label: "紧密型" },
  { wrap: "through", label: "穿越型" },
  { wrap: "topBottom", label: "上下型" },
  { wrap: "behind", label: "衬于文字下方" },
  { wrap: "front", label: "浮于文字上方" },
];

interface ItemExtra {
  checked?: boolean;
  icon?: string;
  glyph?: string;
  glyphClass?: string;
  shortcut?: string;
}

function item(action: ContextMenuAction, label: string, enabled: boolean, extra: ItemExtra = {}): ContextMenuEntry {
  return { kind: "item", action, label, enabled, ...extra };
}

function clipboard(canEdit: boolean, includeDelete: boolean): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [
    item("cut", "剪切", canEdit, { icon: RibbonIcons.cut, shortcut: "Ctrl+X" }),
    item("copy", "复制", canEdit, { icon: RibbonIcons.copy, shortcut: "Ctrl+C" }),
    item("paste", "粘贴", true, { icon: RibbonIcons.paste, shortcut: "Ctrl+V" }),
  ];
  if (includeDelete) {
    entries.push(item("delete", "删除", canEdit, { icon: MenuIcons.trash, shortcut: "Del" }));
  }
  return entries;
}

function alignOn(align: string, value: string): boolean {
  if (value === "left") {
    return align === "left" || align === "start" || align === "";
  }
  if (value === "right") {
    return align === "right" || align === "end";
  }
  if (value === "both") {
    return align === "both" || align === "justify";
  }
  return align === value;
}

export class ContextMenuBuilder {
  build(kind: ContextMenuKind, state: ContextMenuState | boolean): ContextMenuEntry[] {
    const options: ContextMenuState = typeof state === "boolean" ? { canEdit: state } : state;
    if (kind === "picture") {
      return [...clipboard(true, true), { kind: "separator" }, this.wrapMenu(options.pictureWrap ?? null)];
    }
    if (kind === "table") {
      return [...clipboard(options.canEdit, false), { kind: "separator" }, ...this.tableMenus(options.table)];
    }
    return [...clipboard(options.canEdit, true), { kind: "separator" }, ...this.textMenus(options.text)];
  }

  private textMenus(text: TextMenuState | undefined): ContextMenuEntry[] {
    const state: TextMenuState = text ?? {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      superscript: false,
      subscript: false,
      align: "left",
      lineSpacing: "1",
      style: "normal",
      canIndentLess: true,
      hasLink: false,
      hasList: false,
    };
    return [
      this.fontMenu(state),
      this.paragraphMenu(state),
      this.listMenu(state),
      { kind: "separator" },
      item("link", "超链接", true, { icon: RibbonIcons.link }),
      item("clearLink", "取消超链接", state.hasLink, { icon: RibbonIcons.link }),
      { kind: "separator" },
      item("find", "查找", true, { icon: RibbonIcons.find, shortcut: "Ctrl+F" }),
      item("replace", "替换", true, { icon: RibbonIcons.replace, shortcut: "Ctrl+H" }),
      item("comment", "新建批注", true, { icon: RibbonIcons.comment }),
    ];
  }

  private fontMenu(state: TextMenuState): ContextMenuEntry {
    return {
      kind: "submenu",
      label: "字体",
      enabled: true,
      icon: MenuIcons.font,
      children: [
        item("bold", "加粗", true, { glyph: "B", glyphClass: "is-bold", shortcut: "Ctrl+B", checked: state.bold }),
        item("italic", "倾斜", true, { glyph: "I", glyphClass: "is-italic", shortcut: "Ctrl+I", checked: state.italic }),
        item("underline", "下划线", true, { glyph: "U", glyphClass: "is-underline", shortcut: "Ctrl+U", checked: state.underline }),
        item("strike", "删除线", true, { glyph: "S", glyphClass: "is-strike", checked: state.strike }),
        item("superscript", "上标", true, { glyph: "x²", checked: state.superscript }),
        item("subscript", "下标", true, { glyph: "x₂", checked: state.subscript }),
        { kind: "separator" },
        item("clearFormat", "清除格式", true, { glyph: "Aa" }),
      ],
    };
  }

  private paragraphMenu(state: TextMenuState): ContextMenuEntry {
    return {
      kind: "submenu",
      label: "段落",
      enabled: true,
      icon: RibbonIcons.alignLeft,
      children: [
        item("alignLeft", "左对齐", true, { icon: RibbonIcons.alignLeft, checked: alignOn(state.align, "left") }),
        item("alignCenter", "居中", true, { icon: RibbonIcons.alignCenter, checked: alignOn(state.align, "center") }),
        item("alignRight", "右对齐", true, { icon: RibbonIcons.alignRight, checked: alignOn(state.align, "right") }),
        item("alignBoth", "两端对齐", true, { icon: RibbonIcons.alignBoth, checked: alignOn(state.align, "both") }),
        { kind: "separator" },
        item("indentMore", "增加缩进", true, { icon: RibbonIcons.indentMore }),
        item("indentLess", "减少缩进", state.canIndentLess, { icon: RibbonIcons.indentLess }),
        { kind: "separator" },
        item("spacing1", "单倍行距", true, { checked: state.lineSpacing === "1" }),
        item("spacing15", "1.5 倍行距", true, { checked: state.lineSpacing === "1.5" }),
        item("spacing2", "2 倍行距", true, { checked: state.lineSpacing === "2" }),
        { kind: "separator" },
        item("styleNormal", "正文", true, { checked: state.style === "normal" }),
        item("styleHeading1", "标题 1", true, { checked: state.style === "heading1" }),
        item("styleHeading2", "标题 2", true, { checked: state.style === "heading2" }),
        item("styleHeading3", "标题 3", true, { checked: state.style === "heading3" }),
      ],
    };
  }

  private listMenu(state: TextMenuState): ContextMenuEntry {
    return {
      kind: "submenu",
      label: "编号",
      enabled: true,
      icon: RibbonIcons.list,
      children: [
        item("outlineApply", "套用大纲", true),
        item("outlinePromote", "提升一级", state.hasList),
        item("outlineDemote", "降低一级", state.hasList),
        item("outlineClear", "取消编号", state.hasList),
      ],
    };
  }

  private tableMenus(table: TableMenuState | undefined): ContextMenuEntry[] {
    const state = table ?? { canMerge: false, canSplit: false, canDeleteRow: true, canDeleteCol: true };
    return [
      {
        kind: "submenu",
        label: "插入",
        enabled: true,
        icon: RibbonIcons.table,
        children: [
          item("insertRowAbove", "在上方插入行", true, { icon: MenuIcons.row }),
          item("insertRowBelow", "在下方插入行", true, { icon: MenuIcons.row }),
          item("insertColLeft", "在左侧插入列", true, { icon: MenuIcons.col }),
          item("insertColRight", "在右侧插入列", true, { icon: MenuIcons.col }),
        ],
      },
      {
        kind: "submenu",
        label: "删除",
        enabled: state.canDeleteRow || state.canDeleteCol,
        icon: MenuIcons.trash,
        children: [
          item("deleteRow", "删除行", state.canDeleteRow, { icon: MenuIcons.row }),
          item("deleteCol", "删除列", state.canDeleteCol, { icon: MenuIcons.col }),
        ],
      },
      { kind: "separator" },
      item("mergeCells", "合并单元格", state.canMerge, { icon: MenuIcons.merge }),
      item("splitCell", "拆分单元格", state.canSplit, { icon: MenuIcons.split }),
    ];
  }

  private wrapMenu(current: PictureWrap | null): ContextMenuEntry {
    return {
      kind: "submenu",
      label: "环绕文字",
      enabled: true,
      icon: RibbonIcons.wrap,
      children: WRAPS.map((entry) => item(`wrap:${entry.wrap}`, entry.label, true, { checked: entry.wrap === current })),
    };
  }
}
