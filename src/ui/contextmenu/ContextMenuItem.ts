import type { PictureWrap } from "../../edit/PictureTransform";
import type { GalleryStyleKey } from "../../model/style/StyleGallery";

export type ContextMenuAction =
  | "cut"
  | "copy"
  | "paste"
  | "delete"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "superscript"
  | "subscript"
  | "clearFormat"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignBoth"
  | "indentMore"
  | "indentLess"
  | "spacing1"
  | "spacing15"
  | "spacing2"
  | "styleNormal"
  | "styleHeading1"
  | "styleHeading2"
  | "styleHeading3"
  | "outlineApply"
  | "bulletToggle"
  | "numberingToggle"
  | "outlinePromote"
  | "outlineDemote"
  | "outlineClear"
  | "link"
  | "clearLink"
  | "find"
  | "replace"
  | "comment"
  | "insertRowAbove"
  | "insertRowBelow"
  | "insertColLeft"
  | "insertColRight"
  | "deleteRow"
  | "deleteCol"
  | "deleteTable"
  | "mergeCells"
  | "splitCell"
  | `wrap:${PictureWrap}`;

export type ContextMenuKind = "text" | "table" | "picture";

export interface ContextMenuItem {
  kind: "item";
  action: ContextMenuAction;
  label: string;
  enabled: boolean;
  checked?: boolean;
  icon?: string;
  glyph?: string;
  glyphClass?: string;
  shortcut?: string;
}

export interface ContextMenuSeparator {
  kind: "separator";
}

export interface ContextMenuSubmenu {
  kind: "submenu";
  label: string;
  enabled: boolean;
  icon?: string;
  children: ContextMenuEntry[];
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator | ContextMenuSubmenu;

export interface TableMenuState {
  canMerge: boolean;
  canSplit: boolean;
  canDeleteRow: boolean;
  canDeleteCol: boolean;
}

export interface TextMenuState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  superscript: boolean;
  subscript: boolean;
  align: string;
  lineSpacing: "1" | "1.5" | "2" | "exact28";
  style?: GalleryStyleKey;
  canIndentLess: boolean;
  hasLink: boolean;
  link?: string;
  hasList: boolean;
}

export interface ContextMenuState {
  canEdit: boolean;
  table?: TableMenuState;
  text?: TextMenuState;
  pictureWrap?: PictureWrap | null;
}
