import type { ContextMenuItem, ContextMenuKind } from "./ContextMenuItem";

const TEXT_ITEMS: Array<Pick<ContextMenuItem, "action" | "label">> = [
  { action: "cut", label: "剪切" },
  { action: "copy", label: "复制" },
  { action: "paste", label: "粘贴" },
  { action: "delete", label: "删除" },
];

const TABLE_ITEMS: Array<Pick<ContextMenuItem, "action" | "label">> = [
  { action: "cut", label: "剪切" },
  { action: "copy", label: "复制" },
  { action: "paste", label: "粘贴" },
  { action: "delete", label: "删除" },
];

export class ContextMenuBuilder {
  build(kind: ContextMenuKind, canEdit: boolean): ContextMenuItem[] {
    const source = kind === "table" ? TABLE_ITEMS : TEXT_ITEMS;
    return source.map((item) => ({
      action: item.action,
      label: item.label,
      enabled: item.action === "paste" ? true : canEdit,
    }));
  }
}
