import type { FormatAction } from "../../edit/FormatCommand";
import type {
  AlignAction,
  AlignReference,
  DistributeAction,
  LayerOrderAction,
  RotateAction,
} from "../../edit/ArrangeCommand";
import type { AsianLayoutAction, AsianLayoutStateInfo } from "../../edit/AsianLayoutCommand";
import type { EnclosedAction, EnclosedStateInfo } from "../../edit/EnclosedCommand";
import type { SortOptions, SortTargetInfo } from "../../edit/SortCommand";
import type { AsianLayoutKind } from "../../model/inline/AsianLayout";
import type { CaseMode } from "../../edit/ChangeCaseCommand";
import type { FormatPainterMode } from "../../edit/FormatPainter";
import type { FindQuery, FindStatus } from "../../edit/Find";
import type { OutlineAction } from "../../edit/OutlineCommand";
import {
  DEFAULT_BULLET,
  DEFAULT_NUMBERING,
  multilevelSamples,
  numberingPresetKey,
  numberingSamples,
  PRESET_BULLETS,
  PRESET_MULTILEVELS,
  PRESET_NUMBERINGS,
  type MultilevelLevelSpec,
  type MultilevelPreset,
  type MultilevelPreviewRow,
  type NumberingPreset,
} from "../../edit/OutlineNumbering";
import type { PicturePlace, PictureWrap } from "../../edit/PictureTransform";
import type { TableBorderFlags, TableBorderMode, TableBorderPen } from "../../edit/TableBorderApplier";
import { isGalleryStyle, STYLE_GALLERY, type GalleryStyleKey } from "../../model/style/StyleGallery";
import { isCoverTemplate, type CoverTemplateId } from "../../model/document/CoverPage";
import {
  DEFAULT_SHAPE_LINE_WIDTH,
  SHAPE_PRESET_ITEMS,
  SHAPE_STYLE_PRESETS,
  type ShapePreset,
  type TextBoxDirection,
  type TextBoxFormat,
} from "../../model/graphic/Shape";
import { cmToPx, ptToPx, pxToCm, pxToPt } from "../../shared/units";
import { cssFontStack } from "../../layout/measure/FontSpec";
import { ZOOM_LEVELS } from "../workspace/ZoomLevels";
import { AsianLayoutDialog } from "./AsianLayoutDialog";
import { BorderMenu } from "./BorderMenu";
import { BulletDialog } from "./BulletDialog";
import { ColorDialog } from "./ColorDialog";
import { coverGalleryMarkup } from "./CoverGalleryMarkup";
import { EnclosedDialog } from "./EnclosedDialog";
import { MultilevelDialog } from "./MultilevelDialog";
import { NumberingDialog } from "./NumberingDialog";
import { SortDialog } from "./SortDialog";
import { normalizeColor, shadingColorPaletteMarkup, textColorPaletteMarkup } from "./ColorPalette";
import { fontSelectMarkup, isListedFont } from "./FontList";
import { iconButton, RibbonIcons } from "./RibbonIcons";
import { styleGalleryMarkup } from "./StyleGalleryMarkup";
import { paintTableGrid, tableGridMarkup } from "./TableGrid";
import { textBoxToolsMarkup } from "./TextBoxToolsMarkup";

export interface RibbonHost {
  applyFormat(action: FormatAction): void;
  applyCase?(mode: CaseMode): void;
  applyEnclosed?(action: EnclosedAction): void;
  inspectEnclosed?(): EnclosedStateInfo;
  applyAsianLayout?(action: AsianLayoutAction): void;
  inspectAsianLayout?(kind?: AsianLayoutKind): AsianLayoutStateInfo;
  applySort?(options: SortOptions): void;
  inspectSort?(): SortTargetInfo;
  toggleShowMarks?(): void;
  applyShading?(color: string): void;
  applyOutline(action: OutlineAction): void;
  applyTableBorder(mode: TableBorderMode): void;
  setBorderPen(pen: Partial<TableBorderPen>): void;
  undo(): void;
  redo(): void;
  newBlank(): void;
  formatState(): RibbonState;
  openFile(): void;
  saveFile(): void;
  insertTable(rows?: number, cols?: number): void;
  insertCoverPage(template: CoverTemplateId): void;
  removeCoverPage(): void;
  drawTextBox(direction: TextBoxDirection): void;
  insertPageBreak(): void;
  insertBlankPage(): void;
  insertPicture(): void;
  applyPictureWrap(wrap: PictureWrap): void;
  applyPicturePlace(place: PicturePlace): void;
  applyPictureSize(widthPx: number, heightPx: number, lockAspect: boolean): void;
  applyTextBoxFormat(change: TextBoxFormat): void;
  applyLayerOrder?(action: LayerOrderAction): void;
  applyAlign?(action: AlignAction, reference: AlignReference): void;
  applyDistribute?(action: DistributeAction): void;
  applyRotate?(action: RotateAction): void;
  toggleSelectionPane?(): void;
  editHeader(): void;
  editFooter(): void;
  insertTableRow(): void;
  deleteTableRow(): void;
  insertTableColumn(): void;
  deleteTableColumn(): void;
  mergeTableCells(): void;
  splitTableCell(): void;
  insertToc(): void;
  insertPageNumber(): void;
  applyLink(raw: string): void;
  clearLink(): void;
  addComment(text: string): void;
  addFootnote(text: string): void;
  showComment(id: string): void;
  showNote(id: string): void;
  acceptRevision(): void;
  rejectRevision(): void;
  toggleTitlePage(): void;
  toggleEvenOdd(): void;
  setZoom(zoom: number): void;
  print(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  startFormatPainter?(locked: boolean): void;
  cancelFormatPainter?(): void;
  findNext(query: FindQuery): FindStatus;
  findPrev(query: FindQuery): FindStatus;
  replaceMatch(query: FindQuery, replacement: string): FindStatus;
  replaceAllMatches(query: FindQuery, replacement: string): FindStatus;
  closeFind(): void;
}

export interface RibbonState {
  fontFamily: string;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  highlight: string;
  shading?: boolean;
  enclosed?: boolean;
  asianLayout?: boolean;
  showMarks?: boolean;
  paraShading?: string;
  align: string;
  indent: "none" | "first2" | "hang2" | "left2" | "right2";
  canIndentLess: boolean;
  lineSpacing: "1" | "1.5" | "2" | "exact28";
  paraGap: "0" | "before6" | "after6" | "both6";
  vertAlign?: "superscript" | "subscript" | "baseline";
  paragraphStyle?: GalleryStyleKey;
  characterStyle?: GalleryStyleKey;
  canUndo: boolean;
  canRedo: boolean;
  hasDoc: boolean;
  coverTemplate?: CoverTemplateId;
  drawingTextBox?: TextBoxDirection;
  caption: string;
  inTable: boolean;
  inPicture: boolean;
  pictureIsTextBox?: boolean;
  textBoxFormat?: TextBoxFormat;
  pictureWrap?: PictureWrap;
  picturePlace?: PicturePlace | "custom";
  pictureWidth?: number;
  pictureHeight?: number;
  pictureLock?: boolean;
  selectionPaneOpen?: boolean;
  pictureCanDistribute?: boolean;
  pictureRotation?: number;
  pictureFlipH?: boolean;
  pictureFlipV?: boolean;
  borderPen: TableBorderPen;
  borderFlags?: TableBorderFlags;
  titlePg: boolean;
  evenAndOdd: boolean;
  /** 当前段的编号级别，从 0 起。没有编号时缺省。 */
  listLevel?: number;
  /** 当前段的项目符号字符。不是项目符号时缺省。 */
  bulletGlyph?: string;
  /** 当前文档中已使用或定义的项目符号字符列表。 */
  documentBullets?: string[];
  /** 当前段的编号格式。不是普通编号列表时缺省。 */
  numberingFormat?: NumberingPreset;
  /** 当前文档中已使用或定义的编号格式列表。 */
  documentNumberings?: NumberingPreset[];
  /** 当前列表的 1~3 级预览行。不在列表中时缺省。 */
  currentList?: MultilevelPreviewRow[];
  /** 当前命中的多级列表预设 ID。 */
  multilevelId?: string;
  link?: string;
  comments?: { id: string; author: string; text: string }[];
  notes?: { id: string; text: string }[];
  revision?: "ins" | "del";
  formatPainter?: FormatPainterMode;
  zoom: number;
}

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const HIGHLIGHTS = ["#FFFF00", "#00FF00", "#00FFFF", "#FF00FF", "#0000FF", "#FF0000", "#000080", "#008080", "#008000", "#800080", "#800000", "#808000", "#808080", "#C0C0C0"];

type RibbonPage = "home" | "insert" | "table" | "picture";

let nextGalleryId = 0;

export class Ribbon {
  private readonly galleryId = ++nextGalleryId;
  readonly el: HTMLElement;
  private readonly asianDialog = new AsianLayoutDialog();
  private readonly borders = new BorderMenu();
  private readonly bulletDialog = new BulletDialog();
  private readonly colorDialog = new ColorDialog();
  private readonly enclosedDialog = new EnclosedDialog();
  private readonly multilevelDialog = new MultilevelDialog();
  private readonly numberingDialog = new NumberingDialog();
  private readonly sortDialog = new SortDialog();
  private lastParaShading = "#D9D9D9";
  private recentBullets: string[] = [DEFAULT_BULLET];
  private recentNumberings: NumberingPreset[] = [DEFAULT_NUMBERING];
  private customMultilevel?: MultilevelLevelSpec[];
  private page: RibbonPage = "home";
  private hadPicture = false;
  private alignReference: AlignReference = "margin";

  constructor(host: HTMLElement, private readonly actions: RibbonHost) {
    this.el = host;
    host.classList.add("ho-word-ribbon");
    host.innerHTML = this.markup();
    host.addEventListener("mousedown", this.onMouseDown);
    host.addEventListener("click", this.onClick);
    host.addEventListener("dblclick", this.onDoubleClick);
    host.addEventListener("mouseover", this.onTableGridHover);
    host.addEventListener("change", this.onChange);
    host.addEventListener("keydown", this.onKeyDown);
    host.addEventListener("scroll", this.onRibbonScroll, true);
    window.addEventListener("resize", this.placeGallery);
    document.addEventListener("pointerdown", this.onDocumentDown, true);
    document.addEventListener("mousedown", this.onDocumentDown, true);
    document.addEventListener("keydown", this.onDocumentKeyDown, true);
    this.sync();
  }

  destroy(): void {
    this.el.removeEventListener("mousedown", this.onMouseDown);
    this.el.removeEventListener("click", this.onClick);
    this.el.removeEventListener("dblclick", this.onDoubleClick);
    this.el.removeEventListener("mouseover", this.onTableGridHover);
    this.el.removeEventListener("change", this.onChange);
    this.el.removeEventListener("keydown", this.onKeyDown);
    this.el.removeEventListener("scroll", this.onRibbonScroll, true);
    window.removeEventListener("resize", this.placeGallery);
    document.removeEventListener("pointerdown", this.onDocumentDown, true);
    document.removeEventListener("mousedown", this.onDocumentDown, true);
    document.removeEventListener("keydown", this.onDocumentKeyDown, true);
  }

  private onDocumentDown = (event: Event): void => {
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (target instanceof Element && target.closest(".ho-word-color-dialog")) {
      return;
    }
    const open = this.el.querySelectorAll<HTMLElement>(".ho-word-drop.is-open");
    if (!open.length) {
      return;
    }
    for (const drop of open) {
      if (drop.contains(target)) {
        return;
      }
    }
    this.closeDrops();
    if (document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  };

  private onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.el.querySelector(".ho-word-drop.is-open")) {
      const gallery = this.el.querySelector(".ho-word-drop.is-open:has(> [data-ribbon-gallery])");
      if (gallery?.contains(document.activeElement)) {
        gallery.querySelector<HTMLButtonElement>("[data-drop-toggle]")?.focus();
        event.preventDefault();
      }
      this.closeDrops();
    }
  };

  private onMouseDown = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest("select, option, input, textarea, .ho-word-color-dialog")) {
      return;
    }
    event.preventDefault();
  };

  sync(): void {
    const state = this.actions.formatState();
    this.toggle("bold", state.bold);
    this.toggle("italic", state.italic);
    this.toggle("underline", state.underline);
    this.toggle("strike", state.strike);
    this.toggle("superscript", state.vertAlign === "superscript");
    this.toggle("subscript", state.vertAlign === "subscript");
    this.toggle("shading", !!state.shading);
    this.toggle("enclosed", !!state.enclosed);
    this.toggle("show-marks", !!state.showMarks);
    this.el.querySelector(".ho-word-asian-drop > [data-drop-toggle]")?.classList.toggle("is-on", !!state.asianLayout);
    this.toggle("align-left", state.align === "left" || state.align === "start" || !state.align);
    this.toggle("align-center", state.align === "center");
    this.toggle("align-right", state.align === "right" || state.align === "end");
    this.toggle("align-both", state.align === "both" || state.align === "justify");
    this.toggle("title-page", state.titlePg);
    this.toggle("even-odd", state.evenAndOdd);
    const painter = state.formatPainter ?? "off";
    const painterBtn = this.el.querySelector<HTMLButtonElement>("[data-act='format-painter']");
    if (painterBtn) {
      painterBtn.classList.toggle("is-on", painter !== "off");
      painterBtn.classList.toggle("is-locked", painter === "locked");
      painterBtn.title =
        painter === "locked"
          ? "格式刷（连续模式）：再次点击或按 Esc 退出"
          : painter === "once"
            ? "格式刷（单次模式）：在目标处单击或拖选以应用格式，按 Esc 退出"
            : "格式刷：单击刷一次，双击连续刷 (Ctrl+Shift+C / Ctrl+Shift+V)";
    }
    this.setDisabled("undo", !state.canUndo);
    this.setDisabled("redo", !state.canRedo);
    const font = this.el.querySelector<HTMLSelectElement>("[data-select=font]");
    const size = this.el.querySelector<HTMLSelectElement>("[data-select=size]");
    if (font) {
      if (state.fontFamily && !isListedFont(state.fontFamily)) {
        this.ensureDocFont(font, state.fontFamily);
      }
      font.value = state.fontFamily || "宋体";
    }
    if (size) {
      const nearest = SIZES.reduce((best, item) =>
        Math.abs(item - state.fontSizePt) < Math.abs(best - state.fontSizePt) ? item : best,
      );
      size.value = String(nearest);
    }
    const caption = this.el.querySelector("[data-caption]");
    if (caption) {
      caption.textContent = state.caption;
    }
    const color = this.el.querySelector<HTMLElement>("[data-swatch=color]");
    if (color) {
      color.style.background = state.color && state.color !== "auto" ? state.color : "#111111";
    }
    const current = normalizeColor(state.color);
    this.el.querySelectorAll<HTMLElement>(".ho-word-palette-text [data-color]").forEach((button) => {
      button.classList.toggle("is-on", normalizeColor(button.dataset.color) === current);
    });
    const fill = this.el.querySelector<HTMLElement>("[data-swatch=highlight]");
    if (fill) {
      fill.style.background = state.highlight && state.highlight !== "none" ? state.highlight : "#ffffff";
    }
    const paraShadeSwatch = this.el.querySelector<HTMLElement>("[data-swatch=para-shading]");
    if (paraShadeSwatch) {
      paraShadeSwatch.style.background =
        state.paraShading && state.paraShading !== "none" ? state.paraShading : this.lastParaShading;
    }
    const shadeCurrent = state.paraShading && state.paraShading !== "none" ? normalizeColor(state.paraShading) : "none";
    this.el.querySelectorAll<HTMLElement>(".ho-word-palette-shading [data-para-shade]").forEach((button) => {
      button.classList.toggle("is-on", normalizeColor(button.dataset.paraShade) === shadeCurrent);
    });
    this.borders.sync(this.el, state.borderFlags, state.borderPen.size, state.borderPen.color, state.hasDoc);
    this.el.querySelectorAll<HTMLElement>("[data-outline='level']").forEach((button) => {
      button.classList.toggle(
        "is-on",
        !state.bulletGlyph && !state.numberingFormat && state.listLevel != null && Number(button.dataset.ilvl) === state.listLevel,
      );
    });
    this.syncBullets(state);
    this.syncNumberings(state);
    this.syncMultilevel(state);
    const link = this.el.querySelector<HTMLInputElement>("[data-link-url]");
    if (link && document.activeElement !== link) {
      link.value = state.link ?? "";
    }
    const comments = this.el.querySelector("[data-comment-list]");
    if (comments) {
      comments.innerHTML = reviewList(state.comments ?? [], "comment");
    }
    const notes = this.el.querySelector("[data-note-list]");
    if (notes) {
      notes.innerHTML = reviewList(
        (state.notes ?? []).map((note, index) => ({ id: note.id, author: String(index + 1), text: note.text })),
        "note",
      );
    }
    this.toggle("accept-revision", state.revision === "ins");
    this.toggle("reject-revision", state.revision === "del");
    const tableTab = this.el.querySelector<HTMLButtonElement>("[data-tab=table]");
    if (tableTab) {
      tableTab.hidden = !state.inTable;
    }
    const pictureTab = this.el.querySelector<HTMLButtonElement>("[data-tab=picture]");
    if (pictureTab) {
      pictureTab.hidden = !state.inPicture;
      pictureTab.textContent = state.pictureIsTextBox ? "文本框工具" : "图片工具";
    }
    if (state.inPicture && !this.hadPicture) {
      this.showPage("picture");
    } else if (!state.inPicture && this.page === "picture") {
      this.showPage("home");
    }
    this.hadPicture = state.inPicture;
    if (!state.inTable && this.page === "table") {
      this.showPage("home");
    }
    this.el.querySelectorAll<HTMLElement>("[data-picture-wrap]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.pictureWrap === state.pictureWrap);
    });
    this.el.querySelectorAll<HTMLElement>("[data-picture-place]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.picturePlace === state.picturePlace);
    });
    const width = this.el.querySelector<HTMLInputElement>("[data-picture-size=width]");
    const height = this.el.querySelector<HTMLInputElement>("[data-picture-size=height]");
    if (width && document.activeElement !== width) {
      width.value = cmText(state.pictureWidth);
    }
    if (height && document.activeElement !== height) {
      height.value = cmText(state.pictureHeight);
    }
    const lock = this.el.querySelector<HTMLInputElement>("[data-picture-lock]");
    if (lock) {
      lock.checked = state.pictureLock !== false;
    }
    this.toggle("selection-pane", !!state.selectionPaneOpen);
    this.el.querySelectorAll<HTMLElement>("[data-act=selection-pane]").forEach((button) => {
      button.classList.toggle("is-on", !!state.selectionPaneOpen);
      button.setAttribute("aria-pressed", String(!!state.selectionPaneOpen));
    });
    this.el.querySelectorAll<HTMLElement>("[data-align-ref]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.alignRef === this.alignReference);
    });
    this.el.querySelectorAll<HTMLButtonElement>("[data-picture-distribute]").forEach((button) => {
      button.disabled = !state.pictureCanDistribute;
    });
    this.el.querySelectorAll<HTMLElement>("[data-picture-rotate=flipH]").forEach((button) => {
      button.classList.toggle("is-on", !!state.pictureFlipH);
    });
    this.el.querySelectorAll<HTMLElement>("[data-picture-rotate=flipV]").forEach((button) => {
      button.classList.toggle("is-on", !!state.pictureFlipV);
    });
    this.syncTextBoxTools(state.textBoxFormat);
    const zoom = this.el.querySelector<HTMLSelectElement>("[data-select=zoom]");
    if (zoom) {
      const nearest = ZOOM_LEVELS.reduce((best, item) =>
        Math.abs(item - state.zoom) < Math.abs(best - state.zoom) ? item : best,
      );
      const fit = zoom.querySelector<HTMLOptionElement>("option[data-fit]");
      if (Math.abs(nearest - state.zoom) < 0.011) {
        fit?.remove();
        zoom.value = String(nearest);
      } else {
        const option = fit ?? document.createElement("option");
        option.dataset.fit = "1";
        option.value = String(state.zoom);
        option.textContent = `${Math.round(state.zoom * 100)}%`;
        if (!fit) {
          zoom.append(option);
        }
        zoom.value = option.value;
      }
    }
    this.setDisabled("indent-less", !state.canIndentLess);
    this.markChoice("[data-indent]", firstLineKind(state.indent));
    this.markChoice("[data-spacing]", state.lineSpacing);
    this.markChoice("[data-gap]", state.paraGap);
    this.el.querySelectorAll<HTMLButtonElement>("[data-style]").forEach((button) => {
      const key = button.dataset.style;
      if (key && isGalleryStyle(key)) {
        const active = key === (STYLE_GALLERY[key].type === "paragraph" ? state.paragraphStyle : state.characterStyle);
        button.classList.toggle("is-on", active);
        button.setAttribute("aria-pressed", String(active));
      }
      button.disabled = !state.hasDoc;
    });
    this.el.querySelectorAll<HTMLButtonElement>(".ho-word-style-trigger, .ho-word-style-clear").forEach((button) => {
      button.disabled = !state.hasDoc;
    });
    this.el.querySelectorAll<HTMLButtonElement>("[data-cover-template]").forEach((button) => {
      const active = button.dataset.coverTemplate === state.coverTemplate;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = !state.hasDoc;
    });
    const coverTrigger = this.el.querySelector<HTMLButtonElement>(".ho-word-cover-trigger");
    if (coverTrigger) {
      coverTrigger.disabled = !state.hasDoc;
    }
    this.setDisabled("remove-cover", !state.coverTemplate);
    const textBoxTrigger = this.el.querySelector<HTMLButtonElement>(".ho-word-textbox-trigger");
    if (textBoxTrigger) {
      textBoxTrigger.disabled = !state.hasDoc;
      textBoxTrigger.classList.toggle("is-on", !!state.drawingTextBox);
    }
  }

  private ensureDocFont(select: HTMLSelectElement, family: string): void {
    if ([...select.options].some((option) => option.value === family)) {
      return;
    }
    let group = select.querySelector<HTMLOptGroupElement>("optgroup[data-doc-fonts]");
    if (!group) {
      group = document.createElement("optgroup");
      group.label = "文档字体";
      group.dataset.docFonts = "1";
      select.append(group);
    }
    const extra = document.createElement("option");
    extra.value = family;
    extra.textContent = family;
    extra.style.fontFamily = cssFontStack(family);
    group.append(extra);
  }

  private markChoice(selector: string, value: string): void {
    this.el.querySelectorAll<HTMLElement>(selector).forEach((item) => {
      const key = item.dataset.indent ?? item.dataset.spacing ?? item.dataset.gap;
      item.classList.toggle("is-on", key === value);
    });
  }

  private syncTextBoxTools(format: TextBoxFormat | undefined): void {
    this.el.querySelectorAll<HTMLElement>("[data-textbox-tools]").forEach((group) => {
      group.hidden = !format;
    });
    if (!format) {
      return;
    }
    const direction = format.textDirection ?? "horizontal";
    const alignment = format.textAlign ?? "start";
    const preset = format.preset ?? "rect";
    const lineWidth = format.lineWidth || DEFAULT_SHAPE_LINE_WIDTH;
    const currentWidth = this.el.querySelector("[data-textbox-current-width]");
    if (currentWidth) {
      currentWidth.textContent = `${Number(pxToPt(lineWidth).toFixed(2))} 磅`;
    }
    const mark = (button: HTMLElement, active: boolean) => {
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    };
    this.el.querySelectorAll<HTMLElement>("[data-shape-preset]").forEach((button) => {
      mark(button, button.dataset.shapePreset === preset);
    });
    this.el.querySelectorAll<HTMLElement>("[data-shape-style]").forEach((button) => {
      const style = SHAPE_STYLE_PRESETS.find((item) => item.id === button.dataset.shapeStyle);
      const sameFill = style ? normalizeColor(style.fill) === normalizeColor(format.fill) : false;
      const sameLine = style ? normalizeColor(style.line) === normalizeColor(format.line) : false;
      const sameWidth = style ? Math.abs((style.lineWidth ?? DEFAULT_SHAPE_LINE_WIDTH) - lineWidth) < 0.05 : false;
      mark(button, !!style && sameFill && sameLine && (!style.line || sameWidth));
    });
    this.el.querySelectorAll<HTMLElement>("[data-textbox-direction]").forEach((button) => {
      mark(button, button.dataset.textboxDirection === direction);
    });
    this.el.querySelectorAll<HTMLElement>("[data-textbox-align]").forEach((button) => {
      const value = button.dataset.textboxAlign;
      if (value === "start") {
        button.textContent = direction === "vertical" ? "靠右" : "顶端";
      } else if (value === "end") {
        button.textContent = direction === "vertical" ? "靠左" : "底端";
      }
      mark(button, value === alignment);
    });
    this.el.querySelectorAll<HTMLElement>("[data-textbox-line-width]").forEach((button) => {
      mark(button, Math.abs(ptToPx(Number(button.dataset.textboxLineWidth)) - lineWidth) < 0.01);
    });
    for (const target of ["fill", "line"] as const) {
      const drop = this.el.querySelector(`[data-textbox-paint=${target}]`);
      const swatch = drop?.querySelector<HTMLElement>("[data-textbox-swatch]");
      const color = format[target];
      if (swatch) {
        swatch.style.backgroundColor = color ?? "";
        swatch.classList.toggle("is-none", !color);
      }
      drop?.querySelectorAll<HTMLElement>("[data-textbox-color]").forEach((button) => {
        const value = button.dataset.textboxColor;
        mark(button, color ? value !== "none" && normalizeColor(value) === normalizeColor(color) : value === "none");
      });
    }
  }

  private onTextBoxFormatClick(el: HTMLElement): boolean {
    if (!el.closest("[data-textbox-tools]")) {
      return false;
    }
    const target = el.closest<HTMLElement>("[data-textbox-paint]")?.dataset.textboxPaint;
    if ((target === "fill" || target === "line") && el.closest("[data-textbox-custom-color]")) {
      this.closeDrops();
      const current = this.actions.formatState().textBoxFormat?.[target];
      this.colorDialog.open(current ?? (target === "fill" ? "#FFFFFF" : "#41566C"), (hex) => {
        this.actions.applyTextBoxFormat({ [target]: hex });
        this.sync();
      });
      return true;
    }
    const preset = el.closest<HTMLElement>("[data-shape-preset]")?.dataset.shapePreset;
    const styleId = el.closest<HTMLElement>("[data-shape-style]")?.dataset.shapeStyle;
    const color = el.closest<HTMLElement>("[data-textbox-color]")?.dataset.textboxColor;
    const lineWidth = Number(el.closest<HTMLElement>("[data-textbox-line-width]")?.dataset.textboxLineWidth);
    const direction = el.closest<HTMLElement>("[data-textbox-direction]")?.dataset.textboxDirection;
    const alignment = el.closest<HTMLElement>("[data-textbox-align]")?.dataset.textboxAlign;
    let change: TextBoxFormat;
    if (preset && SHAPE_PRESET_ITEMS.some((item) => item.preset === preset)) {
      change = { preset: preset as ShapePreset };
    } else if (styleId) {
      const style = SHAPE_STYLE_PRESETS.find((item) => item.id === styleId);
      if (!style) {
        return false;
      }
      change = {
        fill: style.fill,
        line: style.line,
        lineWidth: style.lineWidth ?? DEFAULT_SHAPE_LINE_WIDTH,
      };
    } else if (color && (target === "fill" || target === "line")) {
      change = { [target]: color === "none" ? undefined : color };
    } else if (lineWidth > 0) {
      change = { lineWidth: ptToPx(lineWidth) };
    } else if (direction === "horizontal" || direction === "vertical") {
      change = { textDirection: direction };
    } else if (alignment === "start" || alignment === "center" || alignment === "end") {
      change = { textAlign: alignment };
    } else {
      return false;
    }
    this.closeDrops();
    this.actions.applyTextBoxFormat(change);
    this.sync();
    return true;
  }

  private onClick = (event: Event): void => {
    const el = event.target as HTMLElement;
    if (this.onTextBoxFormatClick(el)) {
      return;
    }
    const chip = el.closest<HTMLElement>("[data-color], [data-fill], [data-border-color], [data-border]");
    if (chip?.dataset.borderColor) {
      this.actions.setBorderPen({ color: chip.dataset.borderColor });
      this.sync();
      return;
    }
    if (chip?.dataset.border) {
      this.actions.applyTableBorder(chip.dataset.border as TableBorderMode);
      this.closeDrops();
      this.sync();
      return;
    }
    const bulletSymbol = el.closest<HTMLElement>("[data-bullet-symbol]")?.dataset.bulletSymbol;
    if (bulletSymbol) {
      const symbol = this.rememberBullet(bulletSymbol);
      this.actions.applyOutline({ type: "bullet", symbol });
      this.closeDrops();
      this.sync();
      return;
    }
    if (el.closest("[data-bullet-custom]")) {
      this.closeDrops();
      const current = this.actions.formatState().bulletGlyph ?? this.recentBullets[0] ?? DEFAULT_BULLET;
      this.bulletDialog.open(current, (symbol) => {
        const picked = this.rememberBullet(symbol);
        this.actions.applyOutline({ type: "bullet", symbol: picked });
        this.sync();
      });
      return;
    }
    const numCard = el.closest<HTMLElement>("[data-num-fmt]");
    if (numCard?.dataset.numFmt) {
      const preset = this.rememberNumbering({
        numFmt: numCard.dataset.numFmt,
        lvlText: numCard.dataset.numText ?? "%1.",
        start: Number(numCard.dataset.numStart ?? "1") || 1,
      });
      this.actions.applyOutline({ type: "numbering", ...preset });
      this.closeDrops();
      this.sync();
      return;
    }
    if (el.closest("[data-num-custom]")) {
      this.closeDrops();
      const current = this.actions.formatState().numberingFormat ?? this.recentNumberings[0] ?? DEFAULT_NUMBERING;
      this.numberingDialog.open(current, (preset) => {
        const picked = this.rememberNumbering(preset);
        this.actions.applyOutline({ type: "numbering", ...picked });
        this.sync();
      });
      return;
    }
    const multilevelId = el.closest<HTMLElement>("[data-ml-preset]")?.dataset.mlPreset;
    if (multilevelId) {
      this.actions.applyOutline({ type: "multilevel", presetId: multilevelId });
      this.closeDrops();
      this.sync();
      return;
    }
    const mlCustom = el.closest<HTMLElement>("[data-ml-custom]")?.dataset.mlCustom;
    if (mlCustom) {
      this.closeDrops();
      const title = mlCustom === "style" ? "定义新的列表样式" : "定义新的多级列表";
      this.multilevelDialog.open(title, this.customMultilevel, (levels, linkHeading) => {
        this.customMultilevel = levels;
        this.actions.applyOutline({ type: "multilevel", levels, linkHeading });
        this.sync();
      });
      return;
    }
    const outline = el.closest<HTMLElement>("[data-outline]");
    if (outline?.dataset.outline) {
      const kind = outline.dataset.outline;
      if (kind === "level") {
        this.actions.applyOutline({ type: "level", ilvl: Number(outline.dataset.ilvl) });
      } else if (kind === "apply" || kind === "promote" || kind === "demote" || kind === "clear") {
        this.actions.applyOutline({ type: kind });
      }
      this.closeDrops();
      this.sync();
      return;
    }
    if (chip?.dataset.color) {
      this.actions.applyFormat({ type: "color", value: chip.dataset.color });
      this.closeDrops();
      this.sync();
      return;
    }
    if (chip?.dataset.fill) {
      this.actions.applyFormat({ type: "highlight", value: chip.dataset.fill });
      this.closeDrops();
      this.sync();
      return;
    }
    const paraShade = el.closest<HTMLElement>("[data-para-shade]")?.dataset.paraShade;
    if (paraShade) {
      if (paraShade !== "none") {
        this.lastParaShading = paraShade;
      }
      this.actions.applyShading?.(paraShade);
      this.closeDrops();
      this.sync();
      return;
    }
    const asianKind = el.closest<HTMLElement>("[data-asian-layout]")?.dataset.asianLayout;
    if (asianKind) {
      this.closeDrops();
      if (asianKind === "remove") {
        this.actions.applyAsianLayout?.({ type: "remove" });
        this.sync();
        return;
      }
      if (isAsianKind(asianKind)) {
        const initial = this.actions.inspectAsianLayout?.(asianKind) ?? {
          text: "",
          spec: { kind: asianKind, brackets: "round", fitWidthPx: 48, compress: true },
          active: false,
        };
        this.asianDialog.open(asianKind, initial, (action) => {
          this.actions.applyAsianLayout?.(action);
          this.sync();
        });
      }
      return;
    }
    const caseMode = el.closest<HTMLElement>("[data-case]")?.dataset.case;
    if (caseMode && isCaseMode(caseMode)) {
      this.actions.applyCase?.(caseMode);
      this.closeDrops();
      this.sync();
      return;
    }
    const indent = el.closest<HTMLElement>("[data-indent]")?.dataset.indent;
    if (indent && isIndent(indent)) {
      this.actions.applyFormat({ type: "indent", value: indent });
      this.closeDrops();
      this.sync();
      return;
    }
    const spacing = el.closest<HTMLElement>("[data-spacing]")?.dataset.spacing;
    if (spacing && isSpacing(spacing)) {
      this.actions.applyFormat({ type: "lineSpacing", value: spacing });
      this.closeDrops();
      this.sync();
      return;
    }
    const gap = el.closest<HTMLElement>("[data-gap]")?.dataset.gap;
    if (gap && isGap(gap)) {
      this.actions.applyFormat({ type: "paraGap", value: gap });
      this.closeDrops();
      this.sync();
      return;
    }
    const style = el.closest<HTMLElement>("[data-style]")?.dataset.style;
    if (style && isGalleryStyle(style)) {
      this.actions.applyFormat({ type: "style", value: style });
      this.closeDrops();
      this.sync();
      return;
    }
    const cover = el.closest<HTMLElement>("[data-cover-template]")?.dataset.coverTemplate;
    if (cover && isCoverTemplate(cover)) {
      this.closeDrops();
      this.actions.insertCoverPage(cover);
      this.sync();
      return;
    }
    const textBox = el.closest<HTMLElement>("[data-draw-textbox]")?.dataset.drawTextbox;
    if (textBox === "horizontal" || textBox === "vertical") {
      this.closeDrops();
      this.actions.drawTextBox(textBox);
      this.sync();
      return;
    }
    const tableCell = el.closest<HTMLElement>("[data-table-rows]");
    if (tableCell?.dataset.tableRows && tableCell.dataset.tableCols) {
      this.actions.insertTable(Number(tableCell.dataset.tableRows), Number(tableCell.dataset.tableCols));
      this.closeDrops();
      this.sync();
      return;
    }
    const custom = el.closest<HTMLElement>("[data-custom-color]");
    if (custom?.dataset.customColor === "text" || custom?.dataset.customColor === "fill" || custom?.dataset.customColor === "para-shading") {
      const kind = custom.dataset.customColor;
      this.closeDrops();
      const state = this.actions.formatState();
      const initial = kind === "text" ? state.color : kind === "fill" ? state.highlight : state.paraShading;
      this.colorDialog.open(initial && initial !== "none" && initial !== "auto" ? initial : "#000000", (hex) => {
        if (kind === "para-shading") {
          this.lastParaShading = hex;
          this.actions.applyShading?.(hex);
        } else {
          this.actions.applyFormat(kind === "text" ? { type: "color", value: hex } : { type: "highlight", value: hex });
        }
        this.sync();
      });
      return;
    }
    const commentId = el.closest<HTMLElement>("[data-comment-id]")?.dataset.commentId;
    if (commentId) {
      this.actions.showComment(commentId);
      this.closeDrops();
      this.sync();
      return;
    }
    const noteId = el.closest<HTMLElement>("[data-note-id]")?.dataset.noteId;
    if (noteId) {
      this.actions.showNote(noteId);
      this.closeDrops();
      this.sync();
      return;
    }
    if (el.closest("[data-keep-drop], .ho-word-color-dialog")) {
      return;
    }
    const toggle = el.closest<HTMLElement>("[data-drop-toggle]");
    if (toggle) {
      if (toggle.closest(".ho-word-border-drop")?.classList.contains("is-disabled")) {
        return;
      }
      const drop = toggle.closest<HTMLElement>(".ho-word-drop");
      const open = drop?.classList.contains("is-open");
      this.closeDrops();
      drop?.classList.toggle("is-open", !open);
      if (drop && !open) {
        const gallery = drop.querySelector("[data-ribbon-gallery]");
        if (gallery || toggle.hasAttribute("aria-expanded")) {
          toggle.setAttribute("aria-expanded", "true");
        }
        if (gallery) {
          this.placeGallery();
          if (event instanceof MouseEvent && event.detail === 0 && document.activeElement === toggle) {
            const selected = gallery.querySelector<HTMLButtonElement>("button.is-on") ?? gallery.querySelector<HTMLButtonElement>("button");
            selected?.focus();
          }
        } else {
          requestAnimationFrame(() => this.placeOpenDrop(drop));
        }
      }
      return;
    }
    const wrap = el.closest<HTMLElement>("[data-picture-wrap]")?.dataset.pictureWrap;
    if (wrap && isPictureWrap(wrap)) {
      this.actions.applyPictureWrap(wrap);
      this.closeDrops();
      this.sync();
      return;
    }
    const place = el.closest<HTMLElement>("[data-picture-place]")?.dataset.picturePlace;
    if (place && isPicturePlace(place)) {
      this.actions.applyPicturePlace(place);
      this.closeDrops();
      this.sync();
      return;
    }
    const layer = el.closest<HTMLElement>("[data-picture-layer]")?.dataset.pictureLayer;
    if (layer && isLayerOrderAction(layer)) {
      this.actions.applyLayerOrder?.(layer);
      this.closeDrops();
      this.sync();
      return;
    }
    const alignRef = el.closest<HTMLElement>("[data-align-ref]")?.dataset.alignRef;
    if (alignRef === "margin" || alignRef === "page") {
      this.alignReference = alignRef;
      this.sync();
      return;
    }
    const align = el.closest<HTMLElement>("[data-picture-align]")?.dataset.pictureAlign;
    if (align && isAlignAction(align)) {
      this.actions.applyAlign?.(align, this.alignReference);
      this.closeDrops();
      this.sync();
      return;
    }
    const distribute = el.closest<HTMLElement>("[data-picture-distribute]")?.dataset.pictureDistribute;
    if (distribute === "distributeH" || distribute === "distributeV") {
      this.actions.applyDistribute?.(distribute);
      this.closeDrops();
      this.sync();
      return;
    }
    const rotate = el.closest<HTMLElement>("[data-picture-rotate]")?.dataset.pictureRotate;
    if (rotate && isRotateAction(rotate)) {
      this.actions.applyRotate?.(rotate);
      this.closeDrops();
      this.sync();
      return;
    }
    const tab = el.closest<HTMLElement>("[data-tab]");
    if (tab?.dataset.tab === "home" || tab?.dataset.tab === "insert" || tab?.dataset.tab === "table" || tab?.dataset.tab === "picture") {
      this.closeDrops();
      this.showPage(tab.dataset.tab);
      return;
    }
    this.closeDrops();
    const target = el.closest<HTMLElement>("[data-act]");
    if (!target) {
      return;
    }
    const act = target.dataset.act;
    if (act === "undo") {
      this.actions.undo();
    } else if (act === "redo") {
      this.actions.redo();
    } else if (act === "new") {
      this.actions.newBlank();
    } else if (act === "open") {
      this.actions.openFile();
    } else if (act === "save") {
      this.actions.saveFile();
    } else if (act === "cut") {
      this.actions.cut();
    } else if (act === "copy") {
      this.actions.copy();
    } else if (act === "paste") {
      this.actions.paste();
    } else if (act === "format-painter") {
      const mode = this.actions.formatState().formatPainter ?? "off";
      if (event instanceof MouseEvent && event.detail >= 2) {
        this.actions.startFormatPainter?.(true);
      } else if (mode === "off") {
        this.actions.startFormatPainter?.(false);
      } else {
        this.actions.cancelFormatPainter?.();
      }
    } else if (act === "insert-table") {
      this.actions.insertTable();
    } else if (act === "insert-page-break") {
      this.actions.insertPageBreak();
    } else if (act === "remove-cover") {
      this.actions.removeCoverPage();
    } else if (act === "insert-blank-page") {
      this.actions.insertBlankPage();
    } else if (act === "insert-picture") {
      this.actions.insertPicture();
    } else if (act === "edit-header") {
      this.actions.editHeader();
    } else if (act === "edit-footer") {
      this.actions.editFooter();
    } else if (act === "insert-row") {
      this.actions.insertTableRow();
    } else if (act === "delete-row") {
      this.actions.deleteTableRow();
    } else if (act === "insert-col") {
      this.actions.insertTableColumn();
    } else if (act === "delete-col") {
      this.actions.deleteTableColumn();
    } else if (act === "merge-cells") {
      this.actions.mergeTableCells();
    } else if (act === "split-cell") {
      this.actions.splitTableCell();
    } else if (act === "apply-link") {
      const input = this.el.querySelector<HTMLInputElement>("[data-link-url]");
      this.actions.applyLink(input?.value ?? "");
    } else if (act === "clear-link") {
      this.actions.clearLink();
    } else if (act === "add-comment") {
      const input = this.el.querySelector<HTMLTextAreaElement>("[data-comment-text]");
      this.actions.addComment(input?.value ?? "");
      if (input) {
        input.value = "";
      }
    } else if (act === "add-note") {
      const input = this.el.querySelector<HTMLInputElement>("[data-note-text]");
      this.actions.addFootnote(input?.value ?? "");
      if (input) {
        input.value = "";
      }
    } else if (act === "accept-revision") {
      this.actions.acceptRevision();
    } else if (act === "reject-revision") {
      this.actions.rejectRevision();
    } else if (act === "insert-toc") {
      this.actions.insertToc();
    } else if (act === "page-number") {
      this.actions.insertPageNumber();
    } else if (act === "title-page") {
      this.actions.toggleTitlePage();
    } else if (act === "even-odd") {
      this.actions.toggleEvenOdd();
    } else if (act === "bullet-toggle") {
      this.actions.applyOutline({ type: "toggleBullet", symbol: this.recentBullets[0] ?? DEFAULT_BULLET });
    } else if (act === "numbering-toggle") {
      const latest = this.recentNumberings[0] ?? DEFAULT_NUMBERING;
      this.actions.applyOutline({ type: "toggleNumbering", ...latest });
    } else if (act === "bold" || act === "italic" || act === "underline" || act === "strike" || act === "clear" || act === "superscript" || act === "subscript" || act === "shading") {
      this.actions.applyFormat({ type: act });
    } else if (act === "enclosed") {
      const initial = this.actions.inspectEnclosed?.() ?? { text: "", shape: "circle", mode: "shrink", active: false };
      this.enclosedDialog.open(initial, (action) => {
        this.actions.applyEnclosed?.(action);
        this.sync();
      });
    } else if (act === "sort") {
      const info = this.actions.inspectSort?.() ?? { mode: "paragraphs", count: 0, columnCount: 1, activeColumn: 0 };
      this.sortDialog.open(info, (options) => {
        this.actions.applySort?.(options);
        this.sync();
      });
    } else if (act === "show-marks") {
      this.actions.toggleShowMarks?.();
    } else if (act === "selection-pane") {
      this.actions.toggleSelectionPane?.();
    } else if (act === "para-shading-toggle") {
      const current = this.actions.formatState().paraShading;
      const next =
        current && current !== "none" && normalizeColor(current) === normalizeColor(this.lastParaShading)
          ? "none"
          : this.lastParaShading;
      this.actions.applyShading?.(next);
    } else if (act === "align-left") {
      this.actions.applyFormat({ type: "align", value: "left" });
    } else if (act === "align-center") {
      this.actions.applyFormat({ type: "align", value: "center" });
    } else if (act === "align-right") {
      this.actions.applyFormat({ type: "align", value: "right" });
    } else if (act === "align-both") {
      this.actions.applyFormat({ type: "align", value: "both" });
    } else if (act === "indent-less") {
      this.actions.applyFormat({ type: "indentStep", value: -1 });
    } else if (act === "indent-more") {
      this.actions.applyFormat({ type: "indentStep", value: 1 });
    } else if (act === "find-open") {
      this.openFind();
    } else if (act === "find-replace") {
      this.openFind(true);
    } else if (act === "find-close") {
      this.closeFind();
    } else if (act === "find-next" || act === "find-prev") {
      this.runFind(act === "find-next" ? "next" : "prev");
    } else if (act === "replace-one" || act === "replace-all") {
      this.runReplace(act === "replace-all");
    } else if (act === "print") {
      this.actions.print();
    } else if (act === "size-up" || act === "size-down") {
      const current = this.actions.formatState().fontSizePt;
      const index = SIZES.findIndex((item) => item >= current);
      const at = index < 0 ? SIZES.length - 1 : index;
      const next = act === "size-up" ? SIZES[Math.min(SIZES.length - 1, at + 1)] : SIZES[Math.max(0, at - 1)];
      this.actions.applyFormat({ type: "fontSizePt", value: next });
    }
    this.sync();
  };

  private onDoubleClick = (event: MouseEvent): void => {
    const el = event.target as HTMLElement;
    if (!el.closest("[data-act='format-painter']")) {
      return;
    }
    this.actions.startFormatPainter?.(true);
    this.sync();
  };

  private closeDrops(): void {
    this.el.querySelectorAll<HTMLElement>(".ho-word-drop.is-open").forEach((drop) => {
      drop.classList.remove("is-open");
      drop.querySelector("[data-drop-toggle][aria-expanded]")?.setAttribute("aria-expanded", "false");
      this.clearDropPosition(drop);
    });
  }

  private onRibbonScroll = (event: Event): void => {
    if (event.target instanceof Element && event.target.matches(".ho-word-ribbon-page")) {
      this.placeGallery();
    }
  };

  private placeGallery = (): void => {
    const menu = this.el.querySelector<HTMLElement>(".ho-word-drop.is-open > [data-ribbon-gallery]");
    const anchor = menu?.parentElement?.querySelector("[data-drop-toggle]");
    if (!anchor || !menu) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    if (rect.width && (rect.right <= 0 || rect.left >= viewportWidth)) {
      this.closeDrops();
      return;
    }

    const inset = 8;
    const gap = 4;
    const below = window.innerHeight - rect.bottom - gap - inset;
    const above = rect.top - gap - inset;
    menu.style.maxHeight = "";
    const size = menu.getBoundingClientRect();
    const openAbove = size.height > below && above > below;
    const height = Math.max(0, openAbove ? above : below);
    menu.style.maxHeight = `${height}px`;
    menu.style.left = `${Math.max(inset, Math.min(rect.left, viewportWidth - size.width - inset))}px`;
    menu.style.top = `${openAbove ? rect.top - gap - Math.min(size.height, height) : rect.bottom + gap}px`;
  };

  /** 窄屏工具栏会横向滚动，菜单改成相对屏幕定位，避免被裁掉。 */
  private placeOpenDrop(drop: HTMLElement): void {
    const menu = drop.querySelector<HTMLElement>(".ho-word-outline-menu, .ho-word-border-menu, .ho-word-palette");
    if (!menu) {
      return;
    }
    if (window.innerWidth > 900) {
      this.clearDropPosition(drop);
      return;
    }
    const anchor = drop.querySelector("[data-drop-toggle]") ?? drop;
    const rect = anchor.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.zIndex = "40";
    menu.style.maxHeight = `${Math.max(160, window.innerHeight - rect.bottom - 12)}px`;
    const width = menu.offsetWidth || 220;
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    menu.style.top = `${rect.bottom + 4}px`;
  }

  private clearDropPosition(drop: HTMLElement): void {
    const menu = drop.querySelector<HTMLElement>("[data-ribbon-gallery], .ho-word-outline-menu, .ho-word-border-menu, .ho-word-palette");
    if (!menu) {
      return;
    }
    menu.style.position = "";
    menu.style.left = "";
    menu.style.top = "";
    menu.style.zIndex = "";
    menu.style.maxHeight = "";
  }

  private onChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    if (select.dataset.select === "font") {
      this.actions.applyFormat({ type: "fontFamily", value: select.value });
    }
    if (select.dataset.select === "size") {
      this.actions.applyFormat({ type: "fontSizePt", value: Number(select.value) });
    }
    if (select.dataset.borderSize) {
      this.actions.setBorderPen({ size: select.value });
    }
    if (select.dataset.select === "zoom") {
      this.actions.setZoom(Number(select.value));
    }
    const size = (event.target as HTMLElement).dataset.pictureSize;
    if (size === "width" || size === "height") {
      const width = Number(this.el.querySelector<HTMLInputElement>("[data-picture-size=width]")?.value);
      const height = Number(this.el.querySelector<HTMLInputElement>("[data-picture-size=height]")?.value);
      const lock = this.el.querySelector<HTMLInputElement>("[data-picture-lock]")?.checked !== false;
      this.actions.applyPictureSize(cmToPxSafe(width), cmToPxSafe(height), lock);
    }
    if ((event.target as HTMLElement).hasAttribute("data-picture-lock")) {
      const width = Number(this.el.querySelector<HTMLInputElement>("[data-picture-size=width]")?.value);
      const height = Number(this.el.querySelector<HTMLInputElement>("[data-picture-size=height]")?.value);
      const lock = (event.target as HTMLInputElement).checked;
      this.actions.applyPictureSize(cmToPxSafe(width), cmToPxSafe(height), lock);
    }
    this.sync();
  };

  private showPage(page: RibbonPage): void {
    this.page = page;
    this.el.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.tab === page);
    });
    this.el.querySelectorAll<HTMLElement>("[data-page]").forEach((panel) => {
      panel.hidden = panel.dataset.page !== page;
    });
  }

  openFind(focusReplace = false): void {
    const bar = this.el.querySelector<HTMLElement>("[data-findbar]");
    if (!bar) {
      return;
    }
    bar.hidden = false;
    const input = this.el.querySelector<HTMLInputElement>(focusReplace ? "[data-replace]" : "[data-find]");
    input?.focus();
    input?.select();
  }

  private closeFind(): void {
    const bar = this.el.querySelector<HTMLElement>("[data-findbar]");
    if (bar) {
      bar.hidden = true;
    }
    const status = this.el.querySelector("[data-find-status]");
    if (status) {
      status.textContent = "";
    }
    this.actions.closeFind();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("[data-findbar]")) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeFind();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.runFind(event.shiftKey ? "prev" : "next");
    }
  };

  private runFind(direction: "next" | "prev"): void {
    const query = this.findQuery();
    if (!query.text) {
      this.showFindStatus({ index: 0, total: 0 }, true);
      return;
    }
    const status = direction === "next" ? this.actions.findNext(query) : this.actions.findPrev(query);
    this.showFindStatus(status);
  }

  private runReplace(all: boolean): void {
    const query = this.findQuery();
    if (!query.text) {
      this.showFindStatus({ index: 0, total: 0 }, true);
      return;
    }
    const replacement = this.el.querySelector<HTMLInputElement>("[data-replace]")?.value ?? "";
    const status = all
      ? this.actions.replaceAllMatches(query, replacement)
      : this.actions.replaceMatch(query, replacement);
    this.showFindStatus(status);
  }

  private findQuery(): FindQuery {
    return {
      text: this.el.querySelector<HTMLInputElement>("[data-find]")?.value ?? "",
      matchCase: !!this.el.querySelector<HTMLInputElement>("[data-match-case]")?.checked,
    };
  }

  private showFindStatus(status: FindStatus, empty = false): void {
    const el = this.el.querySelector("[data-find-status]");
    if (!el) {
      return;
    }
    if (empty) {
      el.textContent = "输入查找内容";
      return;
    }
    if (status.replaced != null && status.index === 0) {
      el.textContent = status.total ? `已替换 ${status.replaced} 处，还有 ${status.total} 处` : `已替换 ${status.replaced} 处`;
      return;
    }
    el.textContent = status.total ? `${status.index}/${status.total}` : "未找到";
  }

  private toggle(act: string, on: boolean): void {
    this.el.querySelector(`[data-act="${act}"]`)?.classList.toggle("is-on", on);
  }

  private setDisabled(act: string, disabled: boolean): void {
    const button = this.el.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);
    if (button) {
      button.disabled = disabled;
    }
  }

  private onTableGridHover = (event: Event): void => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-table-rows]");
    const grid = this.el.querySelector<HTMLElement>(".ho-word-table-grid");
    if (!cell || !grid?.contains(cell)) {
      return;
    }
    const rows = Number(cell.dataset.tableRows);
    const cols = Number(cell.dataset.tableCols);
    paintTableGrid(grid, rows, cols);
    const label = this.el.querySelector("[data-table-size]");
    if (label) {
      label.textContent = `${rows} × ${cols} 表格`;
    }
  };

  private caseMarkup(): string {
    return `
      <div class="ho-word-drop ho-word-case-drop">
        <button type="button" class="ho-word-case-trigger" data-drop-toggle title="更改大小写">${RibbonIcons.changeCase}${RibbonIcons.chevronDown}</button>
        <div class="ho-word-outline-menu ho-word-case-menu">
          <button type="button" data-case="sentence">句首字母大写</button>
          <button type="button" data-case="lower">小写</button>
          <button type="button" data-case="upper">大写</button>
          <button type="button" data-case="title">每个单词首字母大写</button>
          <button type="button" data-case="toggle">切换大小写</button>
          <button type="button" data-case="halfwidth">半角</button>
          <button type="button" data-case="fullwidth">全角</button>
        </div>
      </div>
    `;
  }

  private asianLayoutMarkup(): string {
    return `
      <div class="ho-word-drop ho-word-asian-drop">
        <button type="button" class="ho-word-asian-trigger" data-drop-toggle title="中文版式">${RibbonIcons.asianLayout}${RibbonIcons.chevronDown}</button>
        <div class="ho-word-outline-menu ho-word-asian-menu">
          <button type="button" data-asian-layout="tatechuyoko">纵横混排...</button>
          <button type="button" data-asian-layout="combine">合并字符...</button>
          <button type="button" data-asian-layout="twoInOne">双行合一...</button>
          <button type="button" data-asian-layout="fitWidth">调整宽度...</button>
          <div class="ho-word-border-split"></div>
          <button type="button" data-asian-layout="remove">清除中文版式</button>
        </div>
      </div>
    `;
  }

  private paraShadingMarkup(): string {
    return `
      <div class="ho-word-drop ho-word-split ho-word-shading-drop">
        <button type="button" class="ho-word-color-cmd" data-act="para-shading-toggle" title="底纹">${RibbonIcons.paraShading}<span data-swatch="para-shading"></span></button>
        <button type="button" class="ho-word-split-arrow" data-drop-toggle title="底纹颜色">${RibbonIcons.chevronDown}</button>
        ${shadingColorPaletteMarkup()}
      </div>
    `;
  }

  private linkMarkup(): string {
    return `
      <div class="ho-word-drop">
        <button type="button" class="ho-word-big" data-drop-toggle title="插入或修改超链接">${RibbonIcons.link}<span>链接${RibbonIcons.chevronDown}</span></button>
        <div class="ho-word-outline-menu ho-word-link-menu">
          <label class="ho-word-link-row" data-keep-drop>
            <input data-link-url placeholder="https:// 或 #书签" />
          </label>
          <button type="button" data-act="apply-link">设置链接</button>
          <button type="button" data-act="clear-link">取消链接</button>
        </div>
      </div>`;
  }

  private commentMarkup(): string {
    return `
      <div class="ho-word-drop">
        <button type="button" class="ho-word-big" data-drop-toggle title="新建批注">${RibbonIcons.comment}<span>批注${RibbonIcons.chevronDown}</span></button>
        <div class="ho-word-outline-menu ho-word-review-menu">
          <textarea data-comment-text data-keep-drop placeholder="批注内容"></textarea>
          <button type="button" data-act="add-comment">插入批注</button>
          <div class="ho-word-review-list" data-comment-list></div>
        </div>
      </div>`;
  }

  private headerMarkup(): string {
    return `
      <div class="ho-word-drop">
        <button type="button" class="ho-word-big" data-drop-toggle title="页眉">${RibbonIcons.header}<span>页眉${RibbonIcons.chevronDown}</span></button>
        <div class="ho-word-outline-menu">
          <button type="button" data-act="edit-header">编辑页眉</button>
          <div class="ho-word-border-split"></div>
          <button type="button" data-act="title-page">首页不同</button>
          <button type="button" data-act="even-odd">奇偶页不同</button>
        </div>
      </div>`;
  }

  private textBoxMarkup(): string {
    const panelId = `ho-word-textbox-options-${this.galleryId}`;
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big ho-word-textbox-trigger" data-drop-toggle aria-expanded="false" aria-controls="${panelId}" title="插入文本框">${RibbonIcons.textBox}<span>文本框${RibbonIcons.chevronDown}</span></button>
      <div id="${panelId}" class="ho-word-outline-menu ho-word-textbox-menu" data-ribbon-gallery role="group" aria-label="文本框方向">
        <button type="button" data-draw-textbox="horizontal">${RibbonIcons.textBox}<span>绘制文本框</span></button>
        <button type="button" data-draw-textbox="vertical">${RibbonIcons.verticalTextBox}<span>绘制竖排文本框</span></button>
      </div>
    </div>`;
  }

  private pictureWrapMarkup(): string {
    const items: Array<{ id: PictureWrap; label: string }> = [
      { id: "inline", label: "嵌入型" },
      { id: "square", label: "四周型" },
      { id: "tight", label: "紧密型" },
      { id: "through", label: "穿越型" },
      { id: "topBottom", label: "上下型" },
      { id: "behind", label: "衬于文字下方" },
      { id: "front", label: "浮于文字上方" },
    ];
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="文字环绕">${RibbonIcons.wrap}<span>环绕文字</span></button>
      <div class="ho-word-outline-menu">
        ${items.map((item) => `<button type="button" data-picture-wrap="${item.id}">${item.label}</button>`).join("")}
      </div>
    </div>`;
  }

  private picturePlaceMarkup(): string {
    const places: PicturePlace[] = [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "middle-center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="位置">${RibbonIcons.position}<span>位置</span></button>
      <div class="ho-word-outline-menu ho-word-picture-places">
        <div class="ho-word-picture-place-grid">
          ${places.map((place) => `<button type="button" data-picture-place="${place}" title="${placeLabel(place)}"></button>`).join("")}
        </div>
      </div>
    </div>`;
  }

  private bringForwardMarkup(): string {
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="上移一层">${RibbonIcons.bringForward}<span>上移一层${RibbonIcons.chevronDown}</span></button>
      <div class="ho-word-outline-menu">
        <button type="button" data-picture-layer="bringForward">上移一层</button>
        <button type="button" data-picture-layer="bringToFront">置于顶层</button>
        <button type="button" data-picture-layer="inFrontOfText">浮于文字上方</button>
      </div>
    </div>`;
  }

  private sendBackwardMarkup(): string {
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="下移一层">${RibbonIcons.sendBackward}<span>下移一层${RibbonIcons.chevronDown}</span></button>
      <div class="ho-word-outline-menu">
        <button type="button" data-picture-layer="sendBackward">下移一层</button>
        <button type="button" data-picture-layer="sendToBack">置于底层</button>
        <button type="button" data-picture-layer="behindText">衬于文字下方</button>
      </div>
    </div>`;
  }

  private alignObjectsMarkup(): string {
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="对齐对象">${RibbonIcons.alignObjects}<span>对齐${RibbonIcons.chevronDown}</span></button>
      <div class="ho-word-outline-menu">
        <button type="button" data-picture-align="left">左对齐</button>
        <button type="button" data-picture-align="center">水平居中</button>
        <button type="button" data-picture-align="right">右对齐</button>
        <div class="ho-word-border-split"></div>
        <button type="button" data-picture-align="top">顶端对齐</button>
        <button type="button" data-picture-align="middle">垂直居中</button>
        <button type="button" data-picture-align="bottom">底端对齐</button>
        <div class="ho-word-border-split"></div>
        <button type="button" data-picture-distribute="distributeH">横向分布</button>
        <button type="button" data-picture-distribute="distributeV">纵向分布</button>
        <div class="ho-word-border-split"></div>
        <button type="button" data-align-ref="page">对齐页面</button>
        <button type="button" data-align-ref="margin">对齐页边距</button>
      </div>
    </div>`;
  }

  private rotateObjectMarkup(): string {
    return `<div class="ho-word-drop">
      <button type="button" class="ho-word-big" data-drop-toggle title="旋转与翻转">${RibbonIcons.rotateObject}<span>旋转${RibbonIcons.chevronDown}</span></button>
      <div class="ho-word-outline-menu">
        <button type="button" data-picture-rotate="rotate90">向右旋转 90°</button>
        <button type="button" data-picture-rotate="rotate-90">向左旋转 90°</button>
        <div class="ho-word-border-split"></div>
        <button type="button" data-picture-rotate="flipV">垂直翻转</button>
        <button type="button" data-picture-rotate="flipH">水平翻转</button>
        <div class="ho-word-border-split"></div>
        <button type="button" data-picture-rotate="reset">重置旋转与翻转</button>
      </div>
    </div>`;
  }

  private syncBullets(state: RibbonState): void {
    const active = state.bulletGlyph;
    this.toggle("bullet-toggle", active != null);
    this.el.querySelector<HTMLElement>(".ho-word-outline-drop > [data-drop-toggle]")?.classList.toggle(
      "is-on",
      !active && !state.numberingFormat && state.listLevel != null,
    );
    const recentHost = this.el.querySelector<HTMLElement>("[data-bullet-recent]");
    if (recentHost) {
      recentHost.innerHTML = this.recentBullets
        .map((glyph) => bulletTileMarkup(glyph, active === glyph))
        .join("");
    }
    this.el.querySelectorAll<HTMLElement>("[data-bullet-library] [data-bullet-symbol]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.bulletSymbol === active);
    });
    this.el.querySelector<HTMLElement>("[data-bullet-library] [data-outline='clear']")?.classList.toggle(
      "is-on",
      state.listLevel == null && active == null,
    );
    const docWrap = this.el.querySelector<HTMLElement>("[data-bullet-doc-wrap]");
    const docHost = this.el.querySelector<HTMLElement>("[data-bullet-doc]");
    const docGlyphs = state.documentBullets ?? [];
    if (docWrap && docHost) {
      docWrap.hidden = docGlyphs.length === 0;
      docHost.innerHTML = docGlyphs.map((glyph) => bulletTileMarkup(glyph, active === glyph)).join("");
    }
  }

  private rememberBullet(symbol: string): string {
    const glyph = symbol.trim() || DEFAULT_BULLET;
    this.recentBullets = [glyph, ...this.recentBullets.filter((item) => item !== glyph)].slice(0, 6);
    return glyph;
  }

  private bulletMarkup(): string {
    const library = PRESET_BULLETS.map((glyph) => bulletTileMarkup(glyph, false)).join("");
    return `
      <div class="ho-word-drop ho-word-split ho-word-bullet-drop">
        <button type="button" data-act="bullet-toggle" title="项目符号">${RibbonIcons.bullet}</button>
        <button type="button" class="ho-word-split-arrow" data-drop-toggle title="项目符号库">${RibbonIcons.chevronDown}</button>
        <div class="ho-word-outline-menu ho-word-bullet-menu">
          <div class="ho-word-bullet-section">
            <div class="ho-word-bullet-title">最近使用过的项目符号</div>
            <div class="ho-word-bullet-grid" data-bullet-recent>${bulletTileMarkup(DEFAULT_BULLET, false)}</div>
          </div>
          <div class="ho-word-border-split"></div>
          <div class="ho-word-bullet-section">
            <div class="ho-word-bullet-title">项目符号库</div>
            <div class="ho-word-bullet-grid" data-bullet-library>
              <button type="button" class="ho-word-bullet-tile ho-word-bullet-none" data-outline="clear" title="无">无</button>
              ${library}
            </div>
          </div>
          <div class="ho-word-bullet-doc" data-bullet-doc-wrap hidden>
            <div class="ho-word-border-split"></div>
            <div class="ho-word-bullet-section">
              <div class="ho-word-bullet-title">文档项目符号</div>
              <div class="ho-word-bullet-grid" data-bullet-doc></div>
            </div>
          </div>
          <div class="ho-word-border-split"></div>
          <button type="button" data-bullet-custom="1">定义新项目符号...</button>
        </div>
      </div>
    `;
  }

  private syncNumberings(state: RibbonState): void {
    const active = state.numberingFormat;
    const activeKey = active ? numberingPresetKey(active) : undefined;
    this.toggle("numbering-toggle", active != null);
    const recentHost = this.el.querySelector<HTMLElement>("[data-num-recent]");
    if (recentHost) {
      recentHost.innerHTML = this.recentNumberings
        .map((preset) => numberingCardMarkup(preset, numberingPresetKey(preset) === activeKey))
        .join("");
    }
    this.el.querySelectorAll<HTMLElement>("[data-num-library] [data-num-fmt]").forEach((button) => {
      const key = numberingPresetKey({
        numFmt: button.dataset.numFmt,
        lvlText: button.dataset.numText,
        start: Number(button.dataset.numStart ?? "1") || 1,
      });
      button.classList.toggle("is-on", key === activeKey);
    });
    this.el.querySelector<HTMLElement>("[data-num-library] [data-outline='clear']")?.classList.toggle(
      "is-on",
      state.listLevel == null && active == null,
    );
    const docWrap = this.el.querySelector<HTMLElement>("[data-num-doc-wrap]");
    const docHost = this.el.querySelector<HTMLElement>("[data-num-doc]");
    const docPresets = state.documentNumberings ?? [];
    if (docWrap && docHost) {
      docWrap.hidden = docPresets.length === 0;
      docHost.innerHTML = docPresets
        .map((preset) => numberingCardMarkup(preset, numberingPresetKey(preset) === activeKey))
        .join("");
    }
  }

  private rememberNumbering(preset: NumberingPreset): NumberingPreset {
    const normalized: NumberingPreset = {
      numFmt: preset.numFmt || DEFAULT_NUMBERING.numFmt,
      lvlText: preset.lvlText || DEFAULT_NUMBERING.lvlText,
      start: Math.max(1, Math.trunc(preset.start || 1)),
    };
    const key = numberingPresetKey(normalized);
    this.recentNumberings = [
      normalized,
      ...this.recentNumberings.filter((item) => numberingPresetKey(item) !== key),
    ].slice(0, 6);
    return normalized;
  }

  private numberingMarkup(): string {
    const library = PRESET_NUMBERINGS.map((preset) => numberingCardMarkup(preset, false)).join("");
    return `
      <div class="ho-word-drop ho-word-split ho-word-numbering-drop">
        <button type="button" data-act="numbering-toggle" title="编号">${RibbonIcons.numbering}</button>
        <button type="button" class="ho-word-split-arrow" data-drop-toggle title="编号库">${RibbonIcons.chevronDown}</button>
        <div class="ho-word-outline-menu ho-word-numbering-menu">
          <div class="ho-word-bullet-section">
            <div class="ho-word-bullet-title">最近使用过的编号格式</div>
            <div class="ho-word-numbering-grid" data-num-recent>${numberingCardMarkup(DEFAULT_NUMBERING, false)}</div>
          </div>
          <div class="ho-word-border-split"></div>
          <div class="ho-word-bullet-section">
            <div class="ho-word-bullet-title">编号库</div>
            <div class="ho-word-numbering-grid" data-num-library>
              <button type="button" class="ho-word-numbering-card-btn ho-word-numbering-none" data-outline="clear" title="无">无</button>
              ${library}
            </div>
          </div>
          <div class="ho-word-num-doc" data-num-doc-wrap hidden>
            <div class="ho-word-border-split"></div>
            <div class="ho-word-bullet-section">
              <div class="ho-word-bullet-title">文档编号格式</div>
              <div class="ho-word-numbering-grid" data-num-doc></div>
            </div>
          </div>
          <div class="ho-word-border-split"></div>
          <button type="button" data-num-custom="1">定义新的编号格式...</button>
        </div>
      </div>
    `;
  }

  private syncMultilevel(state: RibbonState): void {
    const currentWrap = this.el.querySelector<HTMLElement>("[data-ml-current-wrap]");
    const currentHost = this.el.querySelector<HTMLElement>("[data-ml-current]");
    if (currentWrap && currentHost) {
      const rows = state.currentList;
      currentWrap.hidden = !rows?.length;
      currentHost.innerHTML = rows?.length ? multilevelRowsCardMarkup(rows, true) : "";
    }
    this.el.querySelectorAll<HTMLElement>("[data-ml-library] [data-ml-preset]").forEach((button) => {
      button.classList.toggle("is-on", button.dataset.mlPreset === state.multilevelId);
    });
    this.el.querySelector<HTMLElement>("[data-ml-library] [data-outline='clear']")?.classList.toggle(
      "is-on",
      state.listLevel == null,
    );
  }

  private outlineMarkup(): string {
    const library = PRESET_MULTILEVELS.map((preset) => multilevelPresetCardMarkup(preset, false)).join("");
    const levelButtons = Array.from({ length: 9 }, (_, ilvl) => {
      return `<button type="button" class="ho-word-ml-level-chip" data-outline="level" data-ilvl="${ilvl}" title="${ilvl + 1} 级">${ilvl + 1}</button>`;
    }).join("");
    return `
      <div class="ho-word-drop ho-word-outline-drop">
        <button type="button" class="ho-word-ml-trigger" data-drop-toggle title="多级列表。Tab 降低一级，Shift+Tab 提升一级">${RibbonIcons.list}${RibbonIcons.chevronDown}</button>
        <div class="ho-word-outline-menu ho-word-multilevel-menu">
          <div class="ho-word-ml-current-wrap" data-ml-current-wrap hidden>
            <div class="ho-word-bullet-section">
              <div class="ho-word-bullet-title">当前列表</div>
              <div class="ho-word-numbering-grid" data-ml-current></div>
            </div>
            <div class="ho-word-border-split"></div>
          </div>
          <div class="ho-word-bullet-section">
            <div class="ho-word-bullet-title">列表库</div>
            <div class="ho-word-numbering-grid" data-ml-library>
              <button type="button" class="ho-word-numbering-card-btn ho-word-numbering-none" data-outline="clear" title="无">无</button>
              ${library}
            </div>
          </div>
          <div class="ho-word-border-split"></div>
          <div class="ho-word-bullet-section">
            <div class="ho-word-bullet-title">更改列表级别</div>
            <div class="ho-word-ml-level-row">${levelButtons}</div>
          </div>
          <button type="button" data-outline="promote">提升一级</button>
          <button type="button" data-outline="demote">降低一级</button>
          <div class="ho-word-border-split"></div>
          <button type="button" data-ml-custom="list">定义新的多级列表...</button>
          <button type="button" data-ml-custom="style">定义新的列表样式...</button>
        </div>
      </div>
    `;
  }

  private markup(): string {
    return `
      <div class="ho-word-ribbon-title">
        <div class="ho-word-brand">humpk-office</div>
        <div class="ho-word-tabs">
          <button type="button" data-tab="home" class="is-on">开始</button>
          <button type="button" data-tab="insert">插入</button>
          <button type="button" data-tab="table" hidden>表格工具</button>
          <button type="button" data-tab="picture" hidden>图片工具</button>
        </div>
        <div class="ho-word-qat">
          <button type="button" data-act="undo" title="撤销 (Ctrl+Z)">撤销</button>
          <button type="button" data-act="redo" title="重做 (Ctrl+Y)">重做</button>
          <span class="ho-word-qat-split"></span>
          <button type="button" data-act="new" title="新建">新建</button>
          <button type="button" data-act="open" title="打开">打开</button>
          <button type="button" data-act="save" title="保存">保存</button>
          <span class="ho-word-qat-split"></span>
          <button type="button" data-act="print" title="打印 (Ctrl+P)">打印</button>
          <select data-select="zoom" title="缩放">${ZOOM_LEVELS.map((level) => `<option value="${level}">${level * 100}%</option>`).join("")}</select>
        </div>
        <div class="ho-word-caption" data-caption>空文档</div>
      </div>
      <div class="ho-word-ribbon-page" data-page="home">
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-clip">
            <button type="button" class="ho-word-big" data-act="paste" title="粘贴 (Ctrl+V)">${RibbonIcons.paste}<span>粘贴</span></button>
            <div class="ho-word-stack">
              <button type="button" data-act="cut" title="剪切 (Ctrl+X)">${RibbonIcons.cut}<span>剪切</span></button>
              <button type="button" data-act="copy" title="复制 (Ctrl+C)">${RibbonIcons.copy}<span>复制</span></button>
              <button type="button" data-act="format-painter" title="格式刷：单击刷一次，双击连续刷 (Ctrl+Shift+C / Ctrl+Shift+V)">${RibbonIcons.formatPainter}<span>格式刷</span></button>
            </div>
          </div>
          <span>剪贴板</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-font">
            <div class="ho-word-row">
              <select data-select="font" title="字体">${fontSelectMarkup()}</select>
              <select data-select="size">${SIZES.map((size) => `<option value="${size}">${size}</option>`).join("")}</select>
              ${iconButton("size-up", "增大字号", RibbonIcons.growFont)}
              ${iconButton("size-down", "减小字号", RibbonIcons.shrinkFont)}
              ${this.caseMarkup()}
              <button type="button" data-act="clear" title="清除所有格式">${RibbonIcons.clearFormat}</button>
            </div>
            <div class="ho-word-row">
              ${iconButton("bold", "加粗 (Ctrl+B)", RibbonIcons.bold)}
              ${iconButton("italic", "倾斜 (Ctrl+I)", RibbonIcons.italic)}
              ${iconButton("underline", "下划线 (Ctrl+U)", RibbonIcons.underline)}
              ${iconButton("strike", "删除线", RibbonIcons.strike)}
              ${iconButton("subscript", "下标", RibbonIcons.subscript)}
              ${iconButton("superscript", "上标", RibbonIcons.superscript)}
              <div class="ho-word-drop">
                <button type="button" class="ho-word-color-cmd" data-drop-toggle title="突出显示">${RibbonIcons.highlight}<span data-swatch="highlight"></span></button>
                <div class="ho-word-palette ho-word-palette-fill">
                  <button type="button" data-fill="none" class="ho-word-palette-none">无颜色</button>
                  ${HIGHLIGHTS.map((fill) => `<button type="button" data-fill="${fill}" style="background:${fill}"></button>`).join("")}
                  ${moreColors("fill")}
                </div>
              </div>
              <div class="ho-word-drop">
                <button type="button" class="ho-word-color-cmd" data-drop-toggle title="字体颜色">${RibbonIcons.fontColor}<span data-swatch="color"></span></button>
                ${textColorPaletteMarkup()}
              </div>
              <button type="button" data-act="shading" title="字符底纹">${RibbonIcons.charShading}</button>
              <button type="button" data-act="enclosed" title="带圈字符">${RibbonIcons.enclosedChar}</button>
            </div>
          </div>
          <span>字体</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-para">
            <div class="ho-word-row">
              ${this.bulletMarkup()}
              ${this.numberingMarkup()}
              ${this.outlineMarkup()}
              ${iconButton("indent-less", "减少缩进", RibbonIcons.indentLess)}
              ${iconButton("indent-more", "增加缩进", RibbonIcons.indentMore)}
              <div class="ho-word-drop">
                <button type="button" data-drop-toggle title="首行和悬挂缩进">${RibbonIcons.firstLine}</button>
                <div class="ho-word-outline-menu">
                  <button type="button" data-indent="none">无首行缩进</button>
                  <button type="button" data-indent="first2">首行 2 字</button>
                  <button type="button" data-indent="hang2">悬挂 2 字</button>
                </div>
              </div>
              ${this.asianLayoutMarkup()}
              ${iconButton("sort", "排序", RibbonIcons.sort)}
              ${iconButton("show-marks", "显示/隐藏编辑标记", RibbonIcons.showMarks)}
            </div>
            <div class="ho-word-row">
              ${iconButton("align-left", "左对齐", RibbonIcons.alignLeft)}
              ${iconButton("align-center", "居中", RibbonIcons.alignCenter)}
              ${iconButton("align-right", "右对齐", RibbonIcons.alignRight)}
              ${iconButton("align-both", "两端对齐", RibbonIcons.alignBoth)}
              <div class="ho-word-drop">
                <button type="button" data-drop-toggle title="行距和段距">${RibbonIcons.spacing}</button>
                <div class="ho-word-outline-menu">
                  <button type="button" data-spacing="1">1.0</button>
                  <button type="button" data-spacing="1.5">1.5</button>
                  <button type="button" data-spacing="2">2.0</button>
                  <button type="button" data-spacing="exact28">固定 28 磅</button>
                  <div class="ho-word-border-split"></div>
                  <button type="button" data-gap="0">段距 0</button>
                  <button type="button" data-gap="before6">段前 6 磅</button>
                  <button type="button" data-gap="after6">段后 6 磅</button>
                  <button type="button" data-gap="both6">段前段后 6 磅</button>
                </div>
              </div>
              ${this.paraShadingMarkup()}
              ${this.borders.markup()}
            </div>
          </div>
          <span>段落</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body">${styleGalleryMarkup(`ho-word-style-gallery-${this.galleryId}`)}</div>
          <span>样式</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-edit">
            <button type="button" data-act="find-open" title="查找 (Ctrl+F)">${RibbonIcons.find}<span>查找</span></button>
            <button type="button" data-act="find-replace" title="替换 (Ctrl+H)">${RibbonIcons.replace}<span>替换</span></button>
            <button type="button" data-act="selection-pane" title="选择窗格">${RibbonIcons.selectionPane}<span>选择窗格</span></button>
          </div>
          <span>编辑</span>
        </section>
      </div>
      <div class="ho-word-ribbon-page" data-page="insert" hidden>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${coverGalleryMarkup(`ho-word-cover-gallery-${this.galleryId}`)}
            <button type="button" class="ho-word-big" data-act="insert-blank-page" title="在光标处插入一页空白">${RibbonIcons.blankPage}<span>空白页</span></button>
            <button type="button" class="ho-word-big" data-act="insert-page-break" title="从这里另起一页">${RibbonIcons.pageBreak}<span>分页符</span></button>
          </div>
          <span>页面</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${tableGridMarkup()}
          </div>
          <span>表格</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            <button type="button" class="ho-word-big" data-act="insert-picture" title="插入图片">${RibbonIcons.picture}<span>图片</span></button>
          </div>
          <span>插图</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${this.linkMarkup()}
          </div>
          <span>链接</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${this.commentMarkup()}
          </div>
          <span>批注</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${this.headerMarkup()}
            <button type="button" class="ho-word-big" data-act="edit-footer" title="编辑页脚">${RibbonIcons.footer}<span>页脚</span></button>
            <button type="button" class="ho-word-big" data-act="page-number" title="在页眉或页脚插入页码">${RibbonIcons.pageNumber}<span>页码</span></button>
          </div>
          <span>页眉和页脚</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">${this.textBoxMarkup()}</div>
          <span>文本</span>
        </section>
      </div>
      <div class="ho-word-ribbon-page" data-page="picture" hidden>
        ${textBoxToolsMarkup()}
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-insert">
            ${this.picturePlaceMarkup()}
            ${this.pictureWrapMarkup()}
            ${this.bringForwardMarkup()}
            ${this.sendBackwardMarkup()}
            <button type="button" class="ho-word-big" data-act="selection-pane" title="选择窗格">${RibbonIcons.selectionPane}<span>选择窗格</span></button>
            ${this.alignObjectsMarkup()}
            ${this.rotateObjectMarkup()}
          </div>
          <span>排列</span>
        </section>
        <section class="ho-word-group">
          <div class="ho-word-group-body ho-word-picture-size">
            <label>宽度<input type="number" min="0.2" step="0.1" data-picture-size="width" title="宽度（厘米）" /></label>
            <label>高度<input type="number" min="0.2" step="0.1" data-picture-size="height" title="高度（厘米）" /></label>
            <label class="ho-word-picture-lock"><input type="checkbox" data-picture-lock checked />锁定纵横比</label>
          </div>
          <span>大小</span>
        </section>
      </div>
      <div class="ho-word-ribbon-page" data-page="table" hidden>
        <section class="ho-word-group">
          <div class="ho-word-group-body">
            <button type="button" data-act="insert-row" title="在下方插入行">插入行</button>
            <button type="button" data-act="delete-row" title="删除行">删除行</button>
            <button type="button" data-act="insert-col" title="在右侧插入列">插入列</button>
            <button type="button" data-act="delete-col" title="删除列">删除列</button>
            <button type="button" data-act="merge-cells" title="合并单元格">合并</button>
            <button type="button" data-act="split-cell" title="拆分单元格">拆分</button>
            ${this.borders.markup()}
          </div>
          <span>布局</span>
        </section>
      </div>
      <div class="ho-word-findbar" data-findbar hidden>
        <input type="text" data-find placeholder="查找" />
        <input type="text" data-replace placeholder="替换为" />
        <label><input type="checkbox" data-match-case />区分大小写</label>
        <button type="button" data-act="find-prev" title="上一个 (Shift+Enter)">上一个</button>
        <button type="button" data-act="find-next" title="下一个 (Enter)">下一个</button>
        <button type="button" data-act="replace-one">替换</button>
        <button type="button" data-act="replace-all">全部替换</button>
        <span data-find-status></span>
        <button type="button" data-act="find-close" title="关闭 (Esc)">关闭</button>
      </div>
    `;
  }
}

function moreColors(kind: "text" | "fill"): string {
  return `<button type="button" data-custom-color="${kind}" class="ho-word-palette-more">${RibbonIcons.palette}更多颜色...</button>`;
}

function firstLineKind(indent: RibbonState["indent"]): "none" | "first2" | "hang2" {
  return indent === "first2" || indent === "hang2" ? indent : "none";
}

function reviewList(items: { id: string; author: string; text: string }[], kind: "comment" | "note"): string {
  if (!items.length) {
    return `<span class="ho-word-review-empty">暂无${kind === "comment" ? "批注" : "脚注"}</span>`;
  }
  const attr = kind === "comment" ? "data-comment-id" : "data-note-id";
  return items
    .map((item) => `<button type="button" ${attr}="${escapeHtml(item.id)}">${escapeHtml(item.author)}：${escapeHtml(item.text)}</button>`)
    .join("");
}

function isIndent(value: string): value is "none" | "first2" | "hang2" | "left2" | "right2" {
  return value === "none" || value === "first2" || value === "hang2" || value === "left2" || value === "right2";
}

function isSpacing(value: string): value is "1" | "1.5" | "2" | "exact28" {
  return value === "1" || value === "1.5" || value === "2" || value === "exact28";
}

function isGap(value: string): value is "0" | "before6" | "after6" | "both6" {
  return value === "0" || value === "before6" || value === "after6" || value === "both6";
}

function isAsianKind(value: string): value is AsianLayoutKind {
  return value === "tatechuyoko" || value === "combine" || value === "twoInOne" || value === "fitWidth";
}

function isCaseMode(value: string): value is CaseMode {
  return (
    value === "sentence" ||
    value === "lower" ||
    value === "upper" ||
    value === "title" ||
    value === "toggle" ||
    value === "halfwidth" ||
    value === "fullwidth"
  );
}

function isPictureWrap(value: string): value is PictureWrap {
  return value === "inline" || value === "square" || value === "tight" || value === "through" || value === "topBottom" || value === "behind" || value === "front";
}

function isPicturePlace(value: string): value is PicturePlace {
  return value === "top-left" || value === "top-center" || value === "top-right" || value === "middle-left" || value === "middle-center" || value === "middle-right" || value === "bottom-left" || value === "bottom-center" || value === "bottom-right";
}

function isLayerOrderAction(value: string): value is LayerOrderAction {
  return (
    value === "bringForward" ||
    value === "bringToFront" ||
    value === "inFrontOfText" ||
    value === "sendBackward" ||
    value === "sendToBack" ||
    value === "behindText"
  );
}

function isAlignAction(value: string): value is AlignAction {
  return (
    value === "left" ||
    value === "center" ||
    value === "right" ||
    value === "top" ||
    value === "middle" ||
    value === "bottom"
  );
}

function isRotateAction(value: string): value is RotateAction {
  return value === "rotate90" || value === "rotate-90" || value === "flipH" || value === "flipV" || value === "reset";
}

function placeLabel(place: PicturePlace): string {
  const names: Record<PicturePlace, string> = {
    "top-left": "左上",
    "top-center": "上中",
    "top-right": "右上",
    "middle-left": "左中",
    "middle-center": "正中",
    "middle-right": "右中",
    "bottom-left": "左下",
    "bottom-center": "下中",
    "bottom-right": "右下",
  };
  return names[place];
}

function cmText(px: number | undefined): string {
  return pxToCm(px ?? 0).toFixed(2);
}

function cmToPxSafe(cm: number): number {
  return cmToPx(Number.isFinite(cm) ? cm : 0);
}

function bulletTileMarkup(glyph: string, active: boolean): string {
  const escaped = escapeHtml(glyph);
  return `<button type="button" class="ho-word-bullet-tile${active ? " is-on" : ""}" data-bullet-symbol="${escaped}" title="${escaped}">${escaped}</button>`;
}

function numberingCardMarkup(preset: NumberingPreset, active: boolean): string {
  const samples = numberingSamples(preset);
  const rows = samples
    .map(
      (label) =>
        `<span class="ho-word-numbering-sample-row"><span class="ho-word-numbering-sample-label">${escapeHtml(label)}</span><span class="ho-word-numbering-sample-bar"></span></span>`,
    )
    .join("");
  return `<button type="button" class="ho-word-numbering-card-btn${active ? " is-on" : ""}" data-num-fmt="${escapeHtml(preset.numFmt)}" data-num-text="${escapeHtml(preset.lvlText)}" data-num-start="${preset.start}" title="${escapeHtml(samples.join(" "))}">${rows}</button>`;
}

function multilevelPresetCardMarkup(preset: MultilevelPreset, active: boolean): string {
  const rows = multilevelSamples(preset.levels, !!preset.linkHeading);
  const body = multilevelRowsInnerMarkup(rows);
  const title = rows.map((row) => `${row.label}${row.heading ? ` ${row.heading}` : ""}`).join(" / ");
  return `<button type="button" class="ho-word-numbering-card-btn ho-word-multilevel-card-btn${active ? " is-on" : ""}" data-ml-preset="${escapeHtml(preset.id)}" title="${escapeHtml(title)}">${body}</button>`;
}

function multilevelRowsCardMarkup(rows: MultilevelPreviewRow[], active: boolean): string {
  const body = multilevelRowsInnerMarkup(rows);
  return `<div class="ho-word-numbering-card-btn ho-word-multilevel-card-btn ho-word-ml-current-card${active ? " is-on" : ""}">${body}</div>`;
}

function multilevelRowsInnerMarkup(rows: MultilevelPreviewRow[]): string {
  return rows
    .map((row) => {
      const indent = row.ilvl * 7;
      const heading = row.heading ? `<span class="ho-word-ml-sample-heading">${escapeHtml(row.heading)}</span>` : "";
      const label = row.label
        ? `<span class="ho-word-ml-sample-label">${escapeHtml(row.label)}</span>`
        : "";
      return `<span class="ho-word-numbering-sample-row" style="padding-left:${indent}px">${label}${heading}<span class="ho-word-numbering-sample-bar"></span></span>`;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
