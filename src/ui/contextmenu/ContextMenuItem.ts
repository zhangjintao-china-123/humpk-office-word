export type ContextMenuAction = "cut" | "copy" | "paste" | "delete";

export type ContextMenuKind = "text" | "table";

export interface ContextMenuItem {
  action: ContextMenuAction;
  label: string;
  enabled: boolean;
}
