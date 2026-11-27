import { BandEditors } from "../../editor/BandEditors";
import { BodyEditor } from "../../editor/BodyEditor";
import { FooterEditor } from "../../editor/FooterEditor";
import { HeaderEditor } from "../../editor/HeaderEditor";
import { EditorEvents } from "../../editor/types/EditorEvents";
import { HeaderFooterCommand } from "../../edit/HeaderFooterCommand";
import { HeaderFooterResolver } from "../../layout/page/HeaderFooterResolver";
import { Block } from "../../model/block/Block";
import { Paragraph } from "../../model/block/Paragraph";
import { Document } from "../../model/document/Document";
import type { CoverTemplateId } from "../../model/document/CoverPage";
import type { HeaderFooterType } from "../../model/document/DocumentKind";
import { labelPages, type PageLabel } from "../../model/document/PageLabel";
import { Section } from "../../model/document/Section";
import { WordStreamBuilder } from "../../model/flatten/WordStreamBuilder";
import type { Drawing } from "../../model/inline/Drawing";
import type { Table, TableCell } from "../../model/table/Table";
import { DEFAULT_FONT_SIZE } from "../../layout/LayoutConstants";
import { pxToPt, twipToPx } from "../../shared/units";
import { linkLabel, parseLinkInput } from "../../model/field/TextLink";
import { mergeRunStyle, resolveFontFamily, type RunStyle } from "../../model/style/RunStyle";
import { Clipboard, imageFileFromData, payloadFromData } from "../../edit/Clipboard";
import { ClipboardPayload } from "../../edit/ClipboardPayload";
import { CommentCommand } from "../../edit/CommentCommand";
import { FootnoteCommand } from "../../edit/FootnoteCommand";
import { HyperlinkCommand } from "../../edit/HyperlinkCommand";
import { RevisionCommand } from "../../edit/RevisionCommand";
import { collectStories, findInStories, indexAtOrAfter, indexBefore, type FindHit, type FindQuery, type FindStatus } from "../../edit/Find";
import { DeleteCommand, type DeleteDirection } from "../../edit/DeleteCommand";
import { FormatCommand, gapPreset, indentPreset, spacingPreset, type FormatAction } from "../../edit/FormatCommand";
import { activeCharacterStyle, activeParagraphStyle } from "../../model/style/StyleGallery";
import { AsianLayoutCommand, inspectAsianLayout, type AsianLayoutAction, type AsianLayoutStateInfo } from "../../edit/AsianLayoutCommand";
import { EnclosedCommand, inspectEnclosed, type EnclosedAction, type EnclosedStateInfo } from "../../edit/EnclosedCommand";
import { ParagraphBorderCommand, inspectParagraphBorders } from "../../edit/ParagraphBorderCommand";
import { ShadingCommand, paragraphShadingHex } from "../../edit/ShadingCommand";
import { SortCommand, inspectSortTarget, type SortOptions, type SortTargetInfo } from "../../edit/SortCommand";
import { ChangeCaseCommand, type CaseMode } from "../../edit/ChangeCaseCommand";
import type { AsianLayoutKind } from "../../model/inline/AsianLayout";
import {
  captureFormatSample,
  FormatPainterCommand,
  type FormatPainterMode,
  type FormatSample,
} from "../../edit/FormatPainter";
import { InsertObjectCommand } from "../../edit/InsertObjectCommand";
import { CoverPageCommand } from "../../edit/CoverPageCommand";
import { InsertTextBoxCommand } from "../../edit/InsertTextBoxCommand";
import { TextBoxFormatCommand, textBoxFormat } from "../../edit/TextBoxFormatCommand";
import type { TextBoxDirection, TextBoxFormat } from "../../model/graphic/Shape";
import { Rect } from "../../shared/geometry/Rect";
import { TextBoxDrawController } from "./TextBoxDrawController";
import { drawingFromFile } from "../../edit/PictureFile";
import {
  applyDrawingAlign,
  applyLayerOrder,
  applyRotateAction,
  collectAnchoredEntries,
  distributeAnchoredDrawings,
  DrawingBatchCommand,
  type AlignAction,
  type AlignReference,
  type DistributeAction,
  type DrawingBatchEntry,
  type LayerOrderAction,
  type RotateAction,
} from "../../edit/ArrangeCommand";
import {
  applyPicturePlace,
  applyPictureSize,
  applyPictureWrap,
  canDragPicture,
  findDrawingNode,
  minimumTextBoxSize,
  PictureTransformCommand,
  PICTURE_WRAP_GAP,
  pictureWrapOffset,
  RemoveAnchoredDrawingCommand,
  resizedPicture,
  restorePicture,
  samePicture,
  snapPicture,
  syncPictureStream,
  picturePlaceOf,
  pictureWrapOf,
  type PicturePlace,
  type PictureSnap,
  type PictureWrap,
} from "../../edit/PictureTransform";
import { OutlineCommand, type OutlineAction } from "../../edit/OutlineCommand";
import {
  activeMultilevelPresetId,
  bulletGlyphOf,
  currentListPreview,
  documentBullets,
  documentNumberings,
  numberingPresetOf,
} from "../../edit/OutlineNumbering";
import { InsertCommand } from "../../edit/InsertCommand";
import { ReplaceCommand } from "../../edit/ReplaceCommand";
import { TableBorderCommand } from "../../edit/TableBorderCommand";
import {
  applyColumnWidths,
  applyRowHeight,
  restoreTableMetrics,
  snapTableMetrics,
  TableMetricCommand,
} from "../../edit/TableResize";
import { TableStructureCommand } from "../../edit/TableStructureCommand";
import { TocCommand } from "../../edit/TocCommand";
import { TableBorderApplier, type TableBorderMode, type TableBorderPen } from "../../edit/TableBorderApplier";
import { DocxWriter } from "../../io/docx/writer/DocxWriter";
import type { RibbonState } from "../ribbon/Ribbon";
import { Draw } from "../../render/canvas/Draw";
import { Viewport } from "../../render/canvas/Viewport";
import { SelectionPane, selectionPaneLabel, type SelectionPaneItem } from "./SelectionPane";
import { PagePainter } from "../../render/page/PagePainter";
import { PageSetup } from "../../render/page/PageSetup";
import { drawingRotationRadians } from "../../model/graphic/DrawingTransform";
import { imageCache } from "../../render/image/ImageCache";
import { CaretView } from "../../selection/CaretView";
import { FindPainter } from "../../selection/FindPainter";
import { HitTester, type CaretBox, type HitContext, type PictureBox } from "../../selection/HitTester";
import { PointerController } from "../../selection/PointerController";
import { PictureTransformController } from "../../selection/PictureTransformController";
import { TableResizeController } from "../../selection/TableResizeController";
import { Selection } from "../../selection/Selection";
import { SelectionPainter } from "../../selection/SelectionPainter";
import { SelectionFragment } from "../../selection/SelectionFragment";
import { SelectionText } from "../../selection/SelectionText";
import { CaretPos } from "../../selection/CaretPos";
import { caretRank, cellsInReadingOrder, coverFlow } from "../../selection/MainWalk";
import { SelRange } from "../../selection/SelRange";
import { storyKind, storySection, type StoryRef } from "../../selection/StoryRef";
import { ContextMenuController } from "../contextmenu/ContextMenuController";
import type { TextMenuState } from "../contextmenu/ContextMenuItem";
import { EditImpact } from "../../edit/EditImpact";
import { History } from "../../edit/History";
import { InputController } from "../../edit/InputController";
import { Mutator } from "../../edit/Mutator";
import { Relayout } from "../../edit/Relayout";
import type { StoryEditor } from "../../editor/StoryEditor";
import { printImages } from "./PrintPages";
import { MAX_ZOOM, MIN_ZOOM, stepZoom } from "./ZoomLevels";
import { SIDE_PAD, TOP_PAD, pageOriginX, pageOrigins, visiblePageRange } from "./WorkspaceLayout";

const WORKSPACE_BG = "#c5c5c5";
type StatusChange = "view" | "content";

export class Workspace {
  readonly draw: Draw;
  readonly viewport: Viewport;
  readonly pageSetup: PageSetup;
  readonly selection = new Selection();
  readonly history = new History();
  readonly mutator = new Mutator();
  readonly clipboard = new Clipboard();
  pageCount = 1;
  /** 用户选过缩放后不再随窗口改回“适合宽度”。 */
  private zoomPinned = false;

  private readonly hostEl: HTMLElement;
  private readonly selectionPane: SelectionPane;
  private readonly root: HTMLElement;
  private readonly sizer: HTMLElement;
  private readonly overlay: Draw;
  private scrollFrame: number | null = null;
  private readonly painter = new PagePainter();
  private readonly findPainter = new FindPainter();
  private readonly hit = new HitTester();
  private findHits: FindHit[] = [];
  private findIndex = -1;
  private findQueryKey = "";
  private readonly selectionPainter: SelectionPainter;
  private readonly pointer: PointerController;
  private readonly pictureTransform: PictureTransformController;
  private readonly textBoxDraw: TextBoxDrawController;
  private readonly tableResize: TableResizeController;
  private pictureFocus: PictureBox | null = null;
  private holdingPicture = false;
  private pictureMovePreview: PictureBox | null = null;
  private pictureMoveFrame: number | null = null;
  private readonly contextMenu: ContextMenuController;
  private readonly caret: CaretView;
  private readonly selectionText = new SelectionText();
  private readonly selectionFragment = new SelectionFragment();
  readonly relayout: Relayout;
  private readonly input: InputController;
  private readonly uiListeners: Array<() => void> = [];
  private readonly statusListeners = new Set<(change: StatusChange) => void>();
  private findRequest?: (replace: boolean) => void;
  private readonly saveListeners: Array<() => void> = [];
  private readonly writer = new DocxWriter();
  private readonly borderApplier = new TableBorderApplier();
  private borderPen: TableBorderPen = { type: "single", size: "12", color: "#000000" };
  private showMarks = false;
  private formatPainterMode: FormatPainterMode = "off";
  private formatSample: FormatSample | null = null;
  private body?: BodyEditor;
  private headerBands: BandEditors[] = [];
  private footerBands: BandEditors[] = [];
  private pageLabels: PageLabel[] = [];
  private readonly stopImages: () => void;

  constructor(host: HTMLElement, pageSetup = PageSetup.a4()) {
    this.pageSetup = pageSetup;
    this.viewport = new Viewport();
    this.selectionPainter = new SelectionPainter(this.hit);

    this.hostEl = host;
    host.classList.add("ho-word-workspace");
    host.replaceChildren();

    const stage = document.createElement("div");
    stage.className = "ho-word-stage";

    const scroll = document.createElement("div");
    scroll.className = "ho-word-scroll";
    this.root = scroll;

    this.sizer = document.createElement("div");
    this.sizer.className = "ho-word-sizer";
    scroll.appendChild(this.sizer);

    const canvas = document.createElement("canvas");
    canvas.className = "ho-word-canvas";
    const overlay = document.createElement("canvas");
    overlay.className = "ho-word-canvas";
    overlay.setAttribute("aria-hidden", "true");

    stage.appendChild(scroll);
    stage.appendChild(canvas);
    stage.appendChild(overlay);
    const textBoxHint = document.createElement("div");
    textBoxHint.className = "ho-word-textbox-hint";
    textBoxHint.setAttribute("role", "status");
    textBoxHint.hidden = true;
    textBoxHint.textContent = "拖动绘制文本框，单击或按 Enter 放置，Esc 取消";
    stage.appendChild(textBoxHint);
    this.caret = new CaretView(stage);

    this.selectionPane = new SelectionPane({
      items: () => this.selectionPaneItems(),
      select: (box) => this.selectFromPane(box),
      toggleVisibility: (box) => this.toggleDrawingVisibility(box),
      setAllVisibility: (hidden) => this.setAllDrawingsVisibility(hidden),
      moveOrder: (box, direction) => this.moveDrawingOrderFromPane(box, direction),
      close: () => this.setSelectionPaneOpen(false),
    });

    host.appendChild(stage);
    host.appendChild(this.selectionPane.el);

    this.draw = new Draw(canvas);
    this.overlay = new Draw(overlay);
    this.stopImages = imageCache.onReady(() => this.paint());
    this.root.addEventListener("scroll", this.onScroll, { passive: true });
    this.root.addEventListener("wheel", this.onWheel, { passive: false });
    window.visualViewport?.addEventListener("resize", this.onVisualViewport);
    window.visualViewport?.addEventListener("scroll", this.onVisualViewport);
    this.relayout = new Relayout(this);
    this.input = new InputController(this);
    this.input.attach(stage);
    this.textBoxDraw = new TextBoxDrawController(this.root, {
      toWorld: (x, y) => this.clientToWorld(x, y),
      pageAt: (point) => this.textBoxPageAt(point.x, point.y),
      caret: () => this.caretWorld(),
      onChange: () => {
        textBoxHint.hidden = !this.textBoxDraw.direction;
        this.paintSelection();
        for (const handler of this.uiListeners) {
          handler();
        }
      },
      place: (direction, bounds) => this.placeTextBox(direction, bounds),
    });
    this.pointer = new PointerController({
      selection: this.selection,
      hitClient: (x, y) => this.hitClient(x, y),
      cellsInRect: (from, to) => this.cellsInRect(from, to),
      sameFlow: (from, to) => this.sameFlow(from, to),
      followLink: (pos) => this.followLink(pos),
      onChange: () => {
        this.input.resetColumn();
        this.input.clearPending();
        this.onSelectionChange();
      },
      onPointerUp: () => {
        if (this.formatPainterMode !== "off") {
          this.applyFormatPainter();
        }
      },
    });
    this.pointer.attach(this.root);
    document.addEventListener("keydown", this.onGlobalKeyDown);
    this.pictureTransform = new PictureTransformController({
      clientToWorld: (x, y) => this.clientToWorld(x, y),
      zoom: () => this.viewport.zoom || 1,
      selectedPicture: () => this.selectedPicture(),
      pictureAt: (x, y) => this.pictureAtWorld(x, y),
      selectPicture: (box) => this.selectPicture(box),
      previewResize: (box, start, handle, dx, dy, lock) => this.previewPictureResize(box, start, handle, dx, dy, lock),
      previewRotate: (box, start, angle) => this.previewPictureRotate(box, start, angle),
      previewMove: (box, start, dx, dy) => this.previewPictureMove(box, start, dx, dy),
      commit: (box, before) => this.commitPicture(box, before),
      revert: (box, before) => this.revertPicture(box, before),
    });
    this.pictureTransform.attach(this.root);
    this.tableResize = new TableResizeController({
      clientToWorld: (x, y) => this.clientToWorld(x, y),
      zoom: () => this.viewport.zoom || 1,
      guideAt: (x, y, slop) => {
        const ctx = this.hitContext();
        return this.hit.tableHandleAt(x, y, ctx) ? null : this.hit.tableGuide(x, y, ctx, slop);
      },
      previewColumns: (guide, widths, indent, adjustIndent) => {
        applyColumnWidths(guide.table, widths, adjustIndent ? indent : undefined);
        this.reflowTable(guide.story, guide.paragraph);
      },
      previewRow: (guide, height) => {
        applyRowHeight(guide.table, guide.index, height);
        this.reflowTable(guide.story, guide.paragraph);
      },
      commit: (guide, before) => {
        const after = snapTableMetrics(guide.table);
        this.history.do(new TableMetricCommand(this, guide.table, guide.story, guide.paragraph, before, after));
      },
      revert: (guide, before) => {
        restoreTableMetrics(guide.table, before);
        this.reflowTable(guide.story, guide.paragraph);
      },
    });
    this.tableResize.attach(this.root);
    this.root.addEventListener("dblclick", this.onDoubleClick);
    this.contextMenu = new ContextMenuController({
      selection: this.selection,
      hitClient: (x, y) => this.hitClient(x, y),
      flowOwner: (pos) => this.flowOwner(pos),
      pictureAtClient: (x, y) => this.pictureAtClient(x, y),
      selectPicture: (box) => this.selectPicture(box),
      onSelectionChange: () => {
        this.input.resetColumn();
        this.input.clearPending();
        this.onSelectionChange();
      },
      copy: () => this.copy(),
      cut: () => this.cut(),
      paste: () => this.paste(),
      deleteSelection: () => this.deleteContent("backward"),
      tableMenuState: () => this.tableMenuState(),
      pictureWrap: () => this.currentPictureWrap(),
      insertTableRow: (where) => this.insertTableRow(where),
      insertTableColumn: (where) => this.insertTableColumn(where),
      deleteTableRow: () => this.deleteTableRow(),
      deleteTableColumn: () => this.deleteTableColumn(),
      deleteTable: () => this.deleteTable(),
      mergeTableCells: () => this.mergeTableCells(),
      splitTableCell: () => this.splitTableCell(),
      applyPictureWrap: (wrap) => this.applyPictureWrap(wrap),
      textMenuState: () => this.textMenuState(),
      applyFormat: (action) => this.applyFormat(action),
      applyOutline: (action) => this.applyOutline(action),
      applyLink: (raw) => this.applyLink(raw),
      clearLink: () => this.clearLink(),
      addComment: (text) => this.addComment(text),
      openFind: (replace) => this.requestFind(replace),
    });
    this.contextMenu.attach(host, this.root);
    this.layout();
  }

  setPageCount(count: number): void {
    this.pageCount = Math.max(1, count);
    this.layout();
  }

  load(document: Document): void {
    this.pictureTransform.cancel();
    this.textBoxDraw.cancel();
    this.body?.dispose();
    this.disposeBands();
    this.selection.clear();
    this.pictureFocus = null;
    this.formatPainterMode = "off";
    this.formatSample = null;
    this.syncFormatPainterClass();
    this.history.clear();
    this.invalidateFind();
    this.applyPageSetup(document);

    const shared = { draw: this.draw, viewport: this.viewport, pageSetup: this.pageSetup };
    this.mountBands(document);
    this.syncBandExtents();

    this.body = new BodyEditor(shared);
    this.body.attach().load(document).flush();
    this.syncShowMarks();

    this.refreshPageLabels(this.body.pageCount());
    this.setPageCount(this.body.pageCount());
    this.input.clearPending();
    this.placeCaret();
    this.onSelectionChange();
    this.notifyStatus("content");
  }

  bodyDocument(): Document | null {
    return this.body?.document ?? null;
  }

  reloadBands(): void {
    const document = this.body?.document;
    if (!document) {
      return;
    }
    this.disposeBands();
    this.mountBands(document);
    if (this.syncBandExtents()) {
      this.relayout.layoutStory({ slot: "body" });
    } else {
      this.refreshPageLabels();
    }
  }

  newBlank(): void {
    const document = new Document();
    const paragraph = new Paragraph(1);
    paragraph.addBlock(new Block());
    document.addParagraph(paragraph);
    new WordStreamBuilder().buildStoryOnly(document);
    this.load(document);
  }

  applyFormat(action: FormatAction): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new FormatCommand(this, action, this.body.document.styles));
  }

  applyCase(mode: CaseMode): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new ChangeCaseCommand(this, mode));
  }

  inspectEnclosed(): EnclosedStateInfo {
    if (this.body?.document && this.selection.isEmpty()) {
      this.placeCaret();
    }
    return inspectEnclosed(this);
  }

  applyEnclosed(action: EnclosedAction): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new EnclosedCommand(this, action));
  }

  inspectAsianLayout(kind: AsianLayoutKind = "twoInOne"): AsianLayoutStateInfo {
    if (this.body?.document && this.selection.isEmpty()) {
      this.placeCaret();
    }
    return inspectAsianLayout(this, kind);
  }

  applyAsianLayout(action: AsianLayoutAction): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new AsianLayoutCommand(this, action));
  }

  inspectSort(): SortTargetInfo {
    if (this.body?.document && this.selection.isEmpty()) {
      this.placeCaret();
    }
    const tableTarget = this.selectedTable();
    if (tableTarget) {
      return inspectSortTarget(this, {
        table: tableTarget.table,
        colIndex: tableTarget.cells[0]?.colIndex ?? 0,
      });
    }
    return inspectSortTarget(this);
  }

  applySort(options: SortOptions): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    const tableTarget = this.selectedTable();
    if (tableTarget && tableTarget.cells[0]) {
      const host = this.relayout.findCellHost(tableTarget.cells[0]);
      if (host) {
        this.history.do(
          new SortCommand(this, options, {
            table: tableTarget.table,
            story: tableTarget.story,
            paragraph: host.paragraph,
            colIndex: tableTarget.cells[0].colIndex,
          }),
        );
        return;
      }
    }
    this.history.do(new SortCommand(this, options));
  }

  toggleShowMarks(): void {
    this.showMarks = !this.showMarks;
    this.syncShowMarks();
    this.paint();
    this.onSelectionChange();
  }

  applyShading(color: string): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    const tableTarget = this.selectedTable();
    if (tableTarget) {
      this.history.do(
        new ShadingCommand(this, { kind: "cells", cells: tableTarget.cells, story: tableTarget.story }, color),
      );
      return;
    }
    const paraTarget = this.selectedParagraphTarget();
    if (paraTarget) {
      this.history.do(
        new ShadingCommand(this, { kind: "paragraphs", paragraphs: paraTarget.paragraphs, story: paraTarget.story }, color),
      );
    }
  }

  applyOutline(action: OutlineAction): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new OutlineCommand(this, action));
  }

  formatPainterState(): FormatPainterMode {
    return this.formatPainterMode;
  }

  startFormatPainter(locked = false): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    if (this.formatPainterMode === "off" || !this.formatSample) {
      const sample = captureFormatSample(this);
      if (!sample) {
        return;
      }
      this.formatSample = sample;
    }
    this.formatPainterMode = locked ? "locked" : "once";
    this.syncFormatPainterClass();
    this.notifyUi();
  }

  cancelFormatPainter(): boolean {
    if (this.formatPainterMode === "off") {
      return false;
    }
    this.formatPainterMode = "off";
    this.syncFormatPainterClass();
    this.notifyUi();
    return true;
  }

  copyFormat(): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    const sample = captureFormatSample(this);
    if (sample) {
      this.formatSample = sample;
    }
  }

  pasteFormat(): void {
    if (!this.body?.document || !this.formatSample) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new FormatPainterCommand(this, this.formatSample));
  }

  applyFormatPainter(): void {
    if (!this.body?.document || !this.formatSample) {
      if (this.formatPainterMode === "once") {
        this.cancelFormatPainter();
      }
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new FormatPainterCommand(this, this.formatSample));
    if (this.formatPainterMode === "once") {
      this.cancelFormatPainter();
    }
  }

  private syncFormatPainterClass(): void {
    this.hostEl.classList.toggle("is-format-painter", this.formatPainterMode !== "off");
  }

  private notifyUi(): void {
    this.selectionPane.sync();
    for (const handler of this.uiListeners) {
      handler();
    }
  }

  private onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.formatPainterMode !== "off") {
      event.preventDefault();
      this.cancelFormatPainter();
    }
  };

  async copy(): Promise<void> {
    const picture = this.selectedPicture();
    if (picture) {
      if (!picture.drawing.shape?.text) {
        await this.clipboard.write(ClipboardPayload.picture(picture.drawing));
      }
      return;
    }
    if (!this.selectionText.hasCopyableContent(this.selection)) {
      return;
    }
    const origin = this.selection.flow?.anchor ?? this.selection.caret();
    await this.clipboard.write(
      this.selectionFragment.extract(this.selection, this.selectedTable()?.table, origin ? this.flowOwner(origin) : null),
    );
  }

  async cut(): Promise<void> {
    const picture = this.selectedPicture();
    if (picture) {
      if (!picture.drawing.shape?.text) {
        await this.copy();
        this.deleteContent("backward");
      }
      return;
    }
    if (!this.selectionText.hasCopyableContent(this.selection)) {
      return;
    }
    await this.copy();
    this.history.do(new DeleteCommand(this, "backward"));
  }

  async paste(data?: DataTransfer | null): Promise<void> {
    const offered = payloadFromData(data);
    if (offered && !offered.empty) {
      this.history.do(new InsertCommand(this, offered));
      return;
    }
    const file = imageFileFromData(data ?? undefined);
    if (file) {
      await this.insertPictureFile(file);
      return;
    }
    const payload = await this.clipboard.read();
    if (payload.empty) {
      return;
    }
    this.history.do(new InsertCommand(this, payload));
  }

  deleteSelection(): void {
    this.deleteContent("backward");
  }

  deleteContent(direction: DeleteDirection): void {
    if (this.removeSelectedPicture()) {
      return;
    }
    this.history.do(new DeleteCommand(this, direction));
  }

  applyTableBorder(mode: TableBorderMode): void {
    const target = this.selectedTable();
    if (target) {
      this.history.do(new TableBorderCommand(this, target, mode, { ...this.borderPen }));
      return;
    }
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    const paraTarget = this.selectedParagraphTarget();
    if (paraTarget) {
      this.history.do(
        new ParagraphBorderCommand(this, paraTarget.story, paraTarget.paragraphs, mode, { ...this.borderPen }),
      );
    }
  }

  setBorderPen(pen: Partial<TableBorderPen>): void {
    this.borderPen = { ...this.borderPen, ...pen };
  }

  insertTableRow(where: "above" | "below" = "below"): void {
    this.runTableOp((target) => ({
      type: "insertRow",
      index:
        where === "above"
          ? Math.min(...target.cells.map((cell) => cell.rowIndex))
          : Math.max(...target.cells.map((cell) => cell.rowIndex + Math.max(1, cell.rowSpan) - 1)) + 1,
    }));
  }

  deleteTableRow(): void {
    this.runTableOp((target) => ({
      type: "deleteRow",
      index: Math.min(...target.cells.map((cell) => cell.rowIndex)),
    }));
  }

  insertTableColumn(where: "left" | "right" = "right"): void {
    this.runTableOp((target) => ({
      type: "insertColumn",
      index:
        where === "left"
          ? Math.min(...target.cells.map((cell) => cell.colIndex))
          : Math.max(...target.cells.map((cell) => cell.colIndex + Math.max(1, cell.colSpan) - 1)) + 1,
    }));
  }

  deleteTableColumn(): void {
    this.runTableOp((target) => ({
      type: "deleteColumn",
      index: Math.min(...target.cells.map((cell) => cell.colIndex)),
    }));
  }

  deleteTable(): void {
    const target = this.selectedTable();
    if (!target) {
      return;
    }
    const document = this.documentOf(target.story);
    if (!document) {
      return;
    }
    let node = document.words.head;
    while (node) {
      if (node.data.kind === "table" && node.data.table === target.table) {
        this.selection.setRange(
          new SelRange(
            target.story,
            new CaretPos(target.story, node, false),
            new CaretPos(target.story, node, true),
          ),
        );
        this.history.do(new DeleteCommand(this, "backward"));
        return;
      }
      node = node.next;
    }
  }

  mergeTableCells(): void {
    this.runTableOp((target) => ({ type: "merge", cells: target.cells }));
  }

  splitTableCell(): void {
    this.runTableOp((target) => ({ type: "split", cell: target.cells[0] }));
  }

  applyLink(raw: string): void {
    const link = parseLinkInput(raw);
    if (!link || !this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new HyperlinkCommand(this, link));
  }

  clearLink(): void {
    if (!this.body?.document || this.selection.isEmpty()) {
      return;
    }
    this.history.do(new HyperlinkCommand(this, undefined));
  }

  addComment(text: string): void {
    if (!this.body?.document || !text.trim()) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new CommentCommand(this, text));
  }

  addFootnote(text: string): void {
    if (!this.body?.document || !text.trim()) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new FootnoteCommand(this, text));
  }

  acceptRevision(): void {
    if (!this.body?.document || this.selection.isEmpty()) {
      return;
    }
    this.history.do(new RevisionCommand(this, "accept"));
  }

  rejectRevision(): void {
    if (!this.body?.document || this.selection.isEmpty()) {
      return;
    }
    this.history.do(new RevisionCommand(this, "reject"));
  }

  showComment(id: string): void {
    this.revealReview((block) => !!block.commentIds?.includes(id) || block.commentRef === id);
  }

  showNote(id: string): void {
    this.revealReview((block) => block.footnoteId === id);
  }

  insertToc(): void {
    if (!this.body?.document) {
      return;
    }
    this.history.do(new TocCommand(this));
  }

  insertPageNumber(): void {
    if (!this.body?.document) {
      return;
    }
    this.history.do(new HeaderFooterCommand(this, "page"));
  }

  insertTable(rows = 3, cols = 3): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new InsertObjectCommand(this, { type: "table", rows, cols }));
  }

  editHeader(): void {
    if (!this.body?.document) {
      return;
    }
    this.history.do(new HeaderFooterCommand(this, "header"));
  }

  editFooter(): void {
    if (!this.body?.document) {
      return;
    }
    this.history.do(new HeaderFooterCommand(this, "footer"));
  }

  insertPageBreak(): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new InsertObjectCommand(this, { type: "pageBreak" }));
  }

  insertCoverPage(template: CoverTemplateId): void {
    const document = this.body?.document;
    if (document && document.paragraphs.head?.data.coverTemplate !== template) {
      this.history.do(new CoverPageCommand(this, template, this.pageSetup.contentHeight));
    }
  }

  removeCoverPage(): void {
    if (this.body?.document?.paragraphs.head?.data.coverTemplate) {
      this.history.do(new CoverPageCommand(this, undefined, this.pageSetup.contentHeight));
    }
  }

  drawTextBox(direction: TextBoxDirection): void {
    if (this.body?.document) {
      this.cancelFormatPainter();
      this.textBoxDraw.start(direction);
      this.input.focus();
    }
  }

  private textBoxPageAt(x: number, y: number): Rect | undefined {
    const setup = this.pageSetup;
    for (const origin of this.pageOrigins()) {
      const bounds = new Rect(origin.x + setup.contentLeft(), origin.y + setup.contentTop(), setup.contentWidth, setup.contentHeight);
      if (bounds.contains(x, y)) {
        return bounds;
      }
    }
    return undefined;
  }

  private placeTextBox(direction: TextBoxDirection, bounds: Rect): void {
    const ctx = this.hitContext();
    const point = this.hit.worldToStory(bounds.x, bounds.y, ctx);
    if (!point) {
      return;
    }
    const anchor = this.hit.bodyAnchorAt(bounds.x, bounds.y, ctx);
    this.history.do(new InsertTextBoxCommand(this, direction, new Rect(point.x, point.y, bounds.width, bounds.height), anchor));
  }

  insertBlankPage(): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new InsertObjectCommand(this, { type: "blankPage" }));
  }

  async insertPictureFile(file: File): Promise<void> {
    if (!this.body?.document) {
      return;
    }
    try {
      const drawing = await drawingFromFile(file, this.pageSetup.contentWidth, this.pageSetup.contentHeight);
      this.insertPicture(drawing);
    } catch {
      return;
    }
  }

  applyPictureWrap(wrap: PictureWrap): void {
    const hit = this.selectedPicture();
    if (!hit) {
      return;
    }
    this.commitPictureChange(hit, () => applyPictureWrap(hit.drawing, wrap, this.pictureOffset(hit)));
  }

  applyPicturePlace(place: PicturePlace): void {
    const hit = this.selectedPicture();
    if (!hit) {
      return;
    }
    this.commitPictureChange(hit, () => applyPicturePlace(hit.drawing, place));
  }

  applyPictureSize(widthPx: number, heightPx: number, lockAspect: boolean): void {
    const hit = this.selectedPicture();
    if (!hit) {
      return;
    }
    this.commitPictureChange(hit, () => applyPictureSize(hit.drawing, widthPx, heightPx, lockAspect));
  }

  applyTextBoxFormat(change: TextBoxFormat): void {
    const selected = this.selectedPicture();
    const shape = selected?.drawing.shape;
    if (!selected || !shape) {
      return;
    }
    const command = new TextBoxFormatCommand(this, shape, selected.story, selected.paragraph, change);
    if (command.changed()) {
      this.history.do(command);
    }
  }

  applyLayerOrder(action: LayerOrderAction): void {
    const hit = this.selectedPicture();
    if (!hit) {
      return;
    }
    const document = this.documentOf(hit.story);
    if (!document) {
      return;
    }
    const entries = collectAnchoredEntries(document);
    if (!entries.some((entry) => entry.drawing === hit.drawing)) {
      entries.push({ drawing: hit.drawing, paragraph: hit.paragraph });
    }
    const before = entries.map((entry) => snapPicture(entry.drawing));
    applyLayerOrder(document, hit.drawing, action, this.pictureOffset(hit));
    const batch: DrawingBatchEntry[] = entries.map((entry, index) => ({
      drawing: entry.drawing,
      paragraph: entry.paragraph,
      before: before[index],
      after: snapPicture(entry.drawing),
    }));
    before.forEach((snap, index) => restorePicture(entries[index].drawing, snap));
    const command = new DrawingBatchCommand(this, hit.story, batch);
    if (command.changed()) {
      this.history.do(command);
    }
    this.refreshPictureFocus(hit);
  }

  applyAlign(action: AlignAction, reference: AlignReference): void {
    const hit = this.selectedPicture();
    if (!hit) {
      return;
    }
    this.commitPictureChange(hit, () => applyDrawingAlign(hit.drawing, action, reference, this.pictureOffset(hit)));
  }

  applyDistribute(axis: DistributeAction): void {
    const hit = this.selectedPicture();
    if (!hit) {
      return;
    }
    const document = this.documentOf(hit.story);
    if (!document) {
      return;
    }
    const candidates = this.distributeCandidates(document, hit);
    const changes = distributeAnchoredDrawings(candidates, axis);
    if (!changes.length) {
      return;
    }
    const ctx = this.hitContext();
    const pictures = this.hit.pictures(ctx);
    const batch: DrawingBatchEntry[] = [];
    for (const change of changes) {
      const box = pictures.find((item) => item.drawing === change.drawing);
      if (!box) {
        continue;
      }
      const before = snapPicture(change.drawing);
      this.applyPictureOffset(box, before, change.dx, change.dy);
      const after = snapPicture(change.drawing);
      restorePicture(change.drawing, before);
      batch.push({ drawing: change.drawing, paragraph: change.paragraph, before, after });
    }
    const command = new DrawingBatchCommand(this, hit.story, batch);
    if (command.changed()) {
      this.history.do(command);
    }
    this.refreshPictureFocus(hit);
  }

  applyRotate(action: RotateAction): void {
    const hit = this.selectedPicture();
    if (!hit) {
      return;
    }
    this.commitPictureChange(hit, () => applyRotateAction(hit.drawing, action));
  }

  toggleSelectionPane(): void {
    this.setSelectionPaneOpen(!this.selectionPane.isOpen());
  }

  setSelectionPaneOpen(open: boolean): void {
    if (this.selectionPane.isOpen() === open) {
      return;
    }
    this.selectionPane.setOpen(open);
    this.layout();
    this.notifyUi();
  }

  private distributeCandidates(document: Document, hit: PictureBox) {
    const anchors = document.anchors.filter((anchor) => anchor.paragraph && !anchor.drawing.hidden);
    if (hit.story.slot !== "body") {
      return anchors;
    }
    const pageH = Math.max(1, this.pageSetup.contentHeight);
    const current = anchors.find((anchor) => anchor.drawing === hit.drawing);
    if (!current) {
      return anchors;
    }
    const targetPage = Math.floor(current.y / pageH);
    const onPage = anchors.filter((anchor) => Math.floor(anchor.y / pageH) === targetPage);
    return onPage.length >= 3 ? onPage : anchors;
  }

  private canDistributeSelection(picture: PictureBox | null): boolean {
    if (!picture) {
      return false;
    }
    const document = this.documentOf(picture.story);
    if (!document) {
      return false;
    }
    return this.distributeCandidates(document, picture).length >= 3;
  }

  private selectionPaneItems(): SelectionPaneItem[] {
    const pictures = this.hit.pictures(this.hitContext(), true);
    const selected = this.selectedPicture();
    const total = pictures.length;
    const items: SelectionPaneItem[] = [];
    for (let i = total - 1; i >= 0; i -= 1) {
      const box = pictures[i];
      items.push({
        box,
        label: selectionPaneLabel(box.drawing, i + 1),
        selected: selected?.drawing === box.drawing,
        hidden: !!box.drawing.hidden,
        canReorder: box.drawing.position === "anchor",
      });
    }
    return items;
  }

  private selectFromPane(box: PictureBox): void {
    if (box.drawing.hidden) {
      this.toggleDrawingVisibility(box);
      if (box.drawing.hidden) {
        return;
      }
    }
    this.selectPicture(box);
  }

  private toggleDrawingVisibility(box: PictureBox): void {
    this.commitPictureChange(box, () => {
      box.drawing.hidden = !box.drawing.hidden || undefined;
    });
    if (box.drawing.hidden && this.pictureFocus?.drawing === box.drawing) {
      this.pictureFocus = null;
      this.onSelectionChange();
    }
  }

  private setAllDrawingsVisibility(hidden: boolean): void {
    const pictures = this.hit.pictures(this.hitContext(), true);
    const byStory = new Map<Document, { story: StoryRef; entries: DrawingBatchEntry[] }>();
    for (const box of pictures) {
      if (!!box.drawing.hidden === hidden) {
        continue;
      }
      const doc = this.documentOf(box.story);
      if (!doc) {
        continue;
      }
      const before = snapPicture(box.drawing);
      const after: PictureSnap = { ...before, hidden: hidden || undefined };
      const group = byStory.get(doc) ?? { story: box.story, entries: [] };
      group.entries.push({ drawing: box.drawing, paragraph: box.paragraph, before, after });
      byStory.set(doc, group);
    }
    for (const group of byStory.values()) {
      const cmd = new DrawingBatchCommand(this, group.story, group.entries);
      if (cmd.changed()) {
        this.history.do(cmd);
      }
    }
    if (hidden && this.pictureFocus?.drawing.hidden) {
      this.pictureFocus = null;
    }
    this.onSelectionChange();
  }

  private moveDrawingOrderFromPane(box: PictureBox, direction: "up" | "down"): void {
    this.selectPicture(box);
    this.applyLayerOrder(direction === "up" ? "bringForward" : "sendBackward");
  }

  insertPicture(drawing: Drawing): void {
    if (!this.body?.document) {
      return;
    }
    if (this.selection.isEmpty()) {
      this.placeCaret();
    }
    this.history.do(new InsertObjectCommand(this, { type: "picture", drawing }));
  }

  toggleTitlePage(): void {
    if (!this.body?.document) {
      return;
    }
    this.history.do(new HeaderFooterCommand(this, "title"));
  }

  toggleEvenOdd(): void {
    if (!this.body?.document) {
      return;
    }
    this.history.do(new HeaderFooterCommand(this, "even"));
  }

  formatState(caption: string): RibbonState {
    const pos = this.selection.caret();
    const pending = this.input.pendingStyle();
    const anchor = this.selection.flow?.anchor ?? this.selection.primaryRange()?.start;
    const backward = !!pos && !!anchor && pos.compare(anchor) < 0;
    const before = pos?.node?.pre;
    const node = backward
      ? (pos.after ? pos.node?.next ?? pos.node : pos.node)
      : (!pos?.after && (before?.data.paragraph === pos?.node?.data.paragraph || !this.selection.isCollapsed())
          ? before ?? pos?.node
          : pos?.node);
    const run = mergeRunStyle(node?.data.getStyle(), pending);
    const family = run ? resolveFontFamily(run, node?.data.intChar ?? 0) : "宋体";
    const selected = this.selectedTable();
    const paraTarget = selected ? null : this.selectedParagraphTarget();
    const picture = this.selectedPicture();
    const shape = picture?.drawing.shape;
    const activeParagraph = node?.data.paragraph;
    const attrs = activeParagraph?.attrs;
    const ownerDoc = pos ? this.documentOf(pos.story) : this.body?.document;
    const bodyDoc = this.body?.document;
    const numbering = ownerDoc?.numbering ?? bodyDoc?.numbering;
    return {
      fontFamily: family,
      fontSizePt: Math.round(pxToPt(run.fontSizePx ?? DEFAULT_FONT_SIZE) * 2) / 2,
      bold: !!run.bold,
      italic: !!run.italic,
      underline: !!run.underline && run.underline !== "none",
      strike: !!run.strike,
      color: run.color ?? "auto",
      highlight: run.backgroundColor ?? run.highlight ?? "none",
      shading: !!run.backgroundColor && !run.highlight,
      enclosed: !!node?.data.block?.enclosed,
      asianLayout: !!node?.data.block?.asianLayout,
      showMarks: this.showMarks,
      paraShading: selected
        ? (selected.cells[0]?.fill ?? "none")
        : paragraphShadingHex(activeParagraph?.attrs.shading),
      align: attrs?.textAlign ?? "left",
      indent: indentPreset(attrs),
      canIndentLess: (attrs?.leftChars ?? 0) > 0 || (attrs?.leftTwip ?? 0) > 0,
      lineSpacing: spacingPreset(attrs),
      paraGap: gapPreset(attrs),
      vertAlign: run.vertAlign,
      paragraphStyle: bodyDoc ? activeParagraphStyle(bodyDoc.styles, attrs) : undefined,
      characterStyle: bodyDoc ? activeCharacterStyle(bodyDoc.styles, run.characterStyleId) : undefined,
      listLevel: listLevelOf(activeParagraph),
      bulletGlyph: numbering ? bulletGlyphOf(numbering, activeParagraph) : undefined,
      documentBullets: bodyDoc ? documentBullets(bodyDoc.numbering, bodyDoc) : [],
      numberingFormat: numbering ? numberingPresetOf(numbering, activeParagraph) : undefined,
      documentNumberings: bodyDoc ? documentNumberings(bodyDoc.numbering, bodyDoc) : [],
      currentList: numbering ? currentListPreview(numbering, activeParagraph) : undefined,
      multilevelId: numbering ? activeMultilevelPresetId(numbering, activeParagraph) : undefined,
      link: linkLabel(pos?.node?.data.block?.link),
      comments: (this.body?.document?.comments ?? []).map((comment) => ({
        id: comment.id,
        author: comment.author || "批注",
        text: comment.text,
      })),
      notes: (this.body?.document?.footnotes ?? []).map((note) => ({ id: note.id, text: note.text })),
      revision: pos?.node?.data.block?.revision?.kind,
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      hasDoc: !!this.body?.document,
      coverTemplate: bodyDoc?.paragraphs.head?.data.coverTemplate,
      drawingTextBox: this.textBoxDraw.direction,
      caption,
      inTable: !!selected,
      inPicture: !!picture,
      pictureIsTextBox: !!shape?.text,
      textBoxFormat: shape ? textBoxFormat(shape) : undefined,
      pictureWrap: picture ? pictureWrapOf(picture.drawing) : undefined,
      picturePlace: picture ? picturePlaceOf(picture.drawing) : undefined,
      pictureWidth: picture?.drawing.width,
      pictureHeight: picture?.drawing.height,
      pictureLock: picture ? picture.drawing.lockAspect !== false : undefined,
      selectionPaneOpen: this.selectionPane.isOpen(),
      pictureCanDistribute: this.canDistributeSelection(picture),
      pictureRotation: picture?.drawing.rotation ?? 0,
      pictureFlipH: !!picture?.drawing.flipH,
      pictureFlipV: !!picture?.drawing.flipV,
      borderPen: { ...this.borderPen },
      borderFlags: selected
        ? this.borderApplier.inspect(selected.cells, selected.table)
        : paraTarget
          ? inspectParagraphBorders(paraTarget.paragraphs)
          : undefined,
      titlePg: this.currentSection()?.titlePg ?? false,
      evenAndOdd: this.body?.document?.evenAndOddHeaders ?? false,
      formatPainter: this.formatPainterMode,
      zoom: this.viewport.zoom || 1,
    };
  }

  private runTableOp(
    op: (target: { table: Table; cells: TableCell[]; story: StoryRef }) => ConstructorParameters<typeof TableStructureCommand>[4],
  ): void {
    const target = this.selectedTable();
    if (!target) {
      return;
    }
    this.history.do(new TableStructureCommand(this, target.table, target.story, target.cells[0], op(target)));
  }

  private onDoubleClick = (event: MouseEvent): void => {
    if (this.formatPainterMode !== "off") {
      return;
    }
    const rect = this.root.getBoundingClientRect();
    const world = this.viewport.cssToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const band = this.hit.locateBand(world.x, world.y, this.hitContext());
    if (!band || !this.body?.document) {
      return;
    }
    const info = this.bandAt(band.slot, band.pageIndex);
    const editors = this.editorsFor(band.slot, info.sectionIndex);
    let editor = editors.editor(info.type);
    if (!editor) {
      const section = this.ensureSection(info.sectionIndex);
      const story = new Document();
      story.kind = band.slot;
      const paragraph = new Paragraph(1);
      paragraph.addBlock(new Block());
      story.addParagraph(paragraph);
      new WordStreamBuilder().buildStoryOnly(story);
      const map = band.slot === "header" ? section.headers : section.footers;
      map.set(info.type, story);
      editor = editors.open(info.type, story);
    }
    const head = editor.document?.words.head;
    if (!head) {
      return;
    }
    this.selection.collapse(new CaretPos({ slot: band.slot, kind: info.type, sectionIndex: info.sectionIndex }, head, false));
    this.input.focus();
    this.onSelectionChange();
  };

  tableMenuState(): { canMerge: boolean; canSplit: boolean; canDeleteRow: boolean; canDeleteCol: boolean } | null {
    const target = this.selectedTable();
    if (!target) {
      return null;
    }
    const only = target.cells.length === 1 ? target.cells[0] : null;
    return {
      canMerge: target.cells.length > 1,
      canSplit: !!only && (only.rowSpan > 1 || only.colSpan > 1),
      canDeleteRow: target.table.rows.length > 1,
      canDeleteCol: this.tableColumnCount(target.table) > 1,
    };
  }

  textMenuState(): TextMenuState {
    const state = this.formatState("");
    return {
      bold: state.bold,
      italic: state.italic,
      underline: state.underline,
      strike: state.strike,
      superscript: state.vertAlign === "superscript",
      subscript: state.vertAlign === "subscript",
      align: state.align,
      lineSpacing: state.lineSpacing,
      style: state.paragraphStyle,
      canIndentLess: state.canIndentLess,
      hasLink: !!state.link,
      link: state.link,
      hasList: state.listLevel != null,
    };
  }

  requestFind(replace: boolean): void {
    this.findRequest?.(replace);
  }

  onFindRequest(handler: (replace: boolean) => void): void {
    this.findRequest = handler;
  }

  currentPictureWrap(): PictureWrap | null {
    const picture = this.selectedPicture();
    return picture ? pictureWrapOf(picture.drawing) : null;
  }

  selectedPicture(): PictureBox | null {
    if (this.pictureFocus && !this.pictureFocus.drawing.hidden && this.pictureStillThere(this.pictureFocus)) {
      return this.livePicture(this.pictureFocus) ?? this.pictureFocus;
    }
    return this.pictureFromRange();
  }

  private pictureFromRange(): PictureBox | null {
    const range = this.selection.primaryRange()?.normalized();
    if (!range || range.collapsed() || range.start.node !== range.end.node) {
      return null;
    }
    const node = range.start.node;
    const drawing = node?.data.drawing;
    const paragraph = node?.data.paragraph;
    if (!node || node.data.kind !== "drawing" || !drawing || !paragraph || node.data.block?.math) {
      return null;
    }
    return (
      this.hit.pictures(this.hitContext()).find((item) => item.drawing === drawing) ?? {
        drawing,
        paragraph,
        story: range.story,
        node,
        x: 0,
        y: 0,
        width: drawing.width,
        height: drawing.height,
        behind: false,
      }
    );
  }

  private removeSelectedPicture(): boolean {
    const hit = this.selectedPicture();
    if (!hit) {
      return false;
    }
    const document = this.documentOf(hit.story);
    if (!document) {
      return false;
    }
    if (hit.drawing.position === "anchor" && hit.drawing.shape?.text) {
      const index = hit.paragraph.blocks.findIndex((block) => block.drawing === hit.drawing);
      if (index < 0) {
        return false;
      }
      this.pictureFocus = null;
      const node = hit.paragraph.lines[0]?.startNode ?? document.words.head;
      this.selection.collapse(new CaretPos(hit.story, node));
      this.history.do(new RemoveAnchoredDrawingCommand(this, hit.story, hit.paragraph, hit.paragraph.blocks[index], index));
      this.onSelectionChange();
      return true;
    }
    if (hit.drawing.position === "anchor") {
      hit.drawing.position = "inline";
      hit.drawing.anchorSet = undefined;
      syncPictureStream(document, hit.paragraph, hit.drawing);
    }
    const node = hit.node && hit.node.data.drawing === hit.drawing ? hit.node : findDrawingNode(document, hit.drawing);
    if (!node) {
      return false;
    }
    this.pictureFocus = null;
    this.holdingPicture = true;
    this.selection.setRange(
      new SelRange(hit.story, new CaretPos(hit.story, node, false), new CaretPos(hit.story, node, true)),
    );
    this.holdingPicture = false;
    this.history.do(new DeleteCommand(this, "backward"));
    return true;
  }

  private selectPicture(box: PictureBox): void {
    this.holdingPicture = true;
    this.pictureFocus = box;
    if (box.node) {
      this.selection.setRange(
        new SelRange(box.story, new CaretPos(box.story, box.node, false), new CaretPos(box.story, box.node, true)),
      );
    } else if (box.drawing.shape?.text) {
      this.selection.clear();
      this.setPendingRunStyle(undefined);
    }
    this.onSelectionChange();
    this.holdingPicture = false;
  }

  private previewPictureResize(box: PictureBox, start: PictureSnap, handle: Parameters<typeof resizedPicture>[1], dx: number, dy: number, lockAspect: boolean): void {
    const next = resizedPicture(start, handle, dx, dy, lockAspect, minimumTextBoxSize(box.drawing), start.rotation ?? 0);
    restorePicture(box.drawing, start);
    box.drawing.width = next.width;
    box.drawing.height = next.height;
    if (start.position === "anchor") {
      this.applyPictureOffset(box, start, next.deltaX, next.deltaY);
    }
    this.reflowPicture(box);
  }

  private previewPictureRotate(box: PictureBox, start: PictureSnap, angle: number): void {
    restorePicture(box.drawing, start);
    box.drawing.rotation = angle || undefined;
    this.reflowPicture(box);
  }

  private previewPictureMove(box: PictureBox, start: PictureSnap, dx: number, dy: number): void {
    if (!canDragPicture(box.story, start.position)) {
      return;
    }
    this.pictureMovePreview = { ...box, x: box.x + dx, y: box.y + dy };
    if (this.pictureMoveFrame === null) {
      this.pictureMoveFrame = window.requestAnimationFrame(() => {
        this.pictureMoveFrame = null;
        this.paintSelection();
      });
    }
  }

  private cancelPictureMoveFrame(): void {
    if (this.pictureMoveFrame !== null) {
      window.cancelAnimationFrame(this.pictureMoveFrame);
      this.pictureMoveFrame = null;
    }
  }

  private clearPictureMovePreview(): PictureBox | null {
    this.cancelPictureMoveFrame();
    const preview = this.pictureMovePreview;
    this.pictureMovePreview = null;
    return preview;
  }

  private bodyPictureDrop(box: PictureBox, target: PictureBox) {
    const origins = this.pageOrigins();
    const setup = this.pageSetup;
    const stride = setup.height + setup.pageGap;
    const centerY = target.y + target.height / 2;
    const index = Math.max(0, Math.min(origins.length - 1,
      Math.floor((centerY - origins[0].y + setup.pageGap / 2) / stride),
    ));
    const page = origins[index];
    const angle = drawingRotationRadians(target.drawing);
    const halfHeight = (Math.abs(Math.sin(angle)) * target.width + Math.abs(Math.cos(angle)) * target.height) / 2;
    // 先选整页，再把旋转后的实际图框移入纸张。
    const inset = Math.min(halfHeight, setup.height / 2);
    const center = Math.max(inset, Math.min(setup.height - inset, centerY - page.y));
    const top = Math.max(0, center - target.height / 2);
    let paragraph = box.paragraph;
    const firstTop = paragraph.lines[0]?.top ?? 0;
    const anchorPage = Math.floor(firstTop / setup.contentHeight);
    const nearPageStart = box.drawing.position === "inline" && anchorPage === index && index > 0 &&
      firstTop - index * setup.contentHeight < box.height;
    if (anchorPage !== index || nearPageStart) {
      // 页首的高内嵌图离开字流后，原段落可能回到前一页。
      const referenceTop = nearPageStart ? Math.max(top, setup.contentTop() + box.height) : top;
      let distance = Infinity;
      for (const line of this.body?.lines ?? []) {
        const candidate = line.paragraph;
        if (line.type || !candidate || candidate.lines[0] !== line ||
          (nearPageStart && candidate === box.paragraph) ||
          (line.pageIndex ?? Math.floor(line.top / setup.contentHeight)) !== index) {
          continue;
        }
        const lineY = setup.contentTop() + line.top - index * setup.contentHeight;
        const delta = Math.abs(referenceTop - lineY);
        if (delta < distance) {
          distance = delta;
          paragraph = candidate;
        }
      }
    }
    return { paragraph, page: { index, height: setup.height }, left: target.x - page.x, top, y: page.y + top };
  }

  private commitPicture(box: PictureBox, before: PictureSnap): void {
    const preview = this.clearPictureMovePreview();
    if (preview) {
      const dx = preview.x - box.x;
      if (Math.hypot(dx, preview.y - box.y) < 0.5) {
        this.paintSelection();
        return;
      }
      const landing = box.story.slot === "body" ? this.bodyPictureDrop(box, preview) : undefined;
      const y = landing?.y ?? preview.y;
      const dy = y - box.y;
      const anchor = before.anchorSet;
      const keepParagraphAnchor = landing && landing.paragraph === box.paragraph &&
        before.position === "anchor" && anchor?.topFrom === "paragraph" && anchor.wrapType === "none" &&
        landing.top >= this.pageSetup.contentTop() && landing.top < this.pageSetup.contentBottom() &&
        Math.floor((box.paragraph.lines[0]?.top ?? 0) / this.pageSetup.contentHeight) === landing.page.index;
      const drop = keepParagraphAnchor ? undefined : landing;
      this.applyPictureOffset(box, before, dx, dy);
      if (drop && box.drawing.anchorSet) {
        Object.assign(box.drawing.anchorSet, { leftFrom: "page", topFrom: "page", left: drop.left, top: drop.top });
      }
      const after = snapPicture(box.drawing);
      restorePicture(box.drawing, before);
      const target = { ...preview, y, paragraph: drop?.paragraph ?? preview.paragraph, node: undefined };
      this.holdingPicture = true;
      this.pictureFocus = target;
      try {
        this.history.do(new PictureTransformCommand(this, box.drawing, box.story, box.paragraph, before, after, drop));
      } finally {
        this.holdingPicture = false;
      }
      this.refreshPictureFocus(target);
      return;
    }
    const after = snapPicture(box.drawing);
    if (samePicture(before, after)) {
      return;
    }
    restorePicture(box.drawing, before);
    this.history.do(new PictureTransformCommand(this, box.drawing, box.story, box.paragraph, before, after));
    this.refreshPictureFocus(box);
  }

  private revertPicture(box: PictureBox, before: PictureSnap): void {
    if (this.clearPictureMovePreview()) {
      this.paintSelection();
      return;
    }
    restorePicture(box.drawing, before);
    this.reflowPicture(box);
    this.refreshPictureFocus(box);
  }

  private commitPictureChange(hit: PictureBox, mutate: () => void): void {
    const before = snapPicture(hit.drawing);
    mutate();
    const after = snapPicture(hit.drawing);
    if (samePicture(before, after)) {
      restorePicture(hit.drawing, after);
      return;
    }
    restorePicture(hit.drawing, before);
    this.history.do(new PictureTransformCommand(this, hit.drawing, hit.story, hit.paragraph, before, after));
    this.refreshPictureFocus(hit);
  }

  private applyPictureOffset(box: PictureBox, start: PictureSnap, dx: number, dy: number): void {
    const anchor = start.anchorSet;
    if (anchor?.leftFrom === "page" && anchor.topFrom === "page" &&
      !anchor.leftAlign && !anchor.topAlign && !anchor.simplePosition) {
      box.drawing.anchorSet = { ...anchor, left: (anchor.left ?? 0) + dx, top: (anchor.top ?? 0) + dy };
      return;
    }
    const offset = this.pictureOffset(box);
    const left = anchor?.leftFrom === "column" && !anchor.leftAlign && !anchor.simplePosition ? anchor.left ?? offset.left : offset.left;
    const top = anchor?.topFrom === "paragraph" && !anchor.topAlign && !anchor.simplePosition ? anchor.top ?? offset.top : offset.top;
    const wrapType = anchor?.wrapType ?? (box.drawing.shape?.text ? "none" : "square");
    const gap = wrapType === "none" ? 0 : PICTURE_WRAP_GAP;
    box.drawing.position = "anchor";
    box.drawing.anchorSet = {
      ...anchor,
      wrapType,
      wrapSide: anchor?.wrapSide ?? "both",
      distLeft: anchor?.distLeft ?? gap,
      distRight: anchor?.distRight ?? gap,
      distTop: anchor?.distTop ?? gap,
      distBottom: anchor?.distBottom ?? gap,
      leftFrom: "column",
      topFrom: "paragraph",
      left: left + dx,
      top: top + dy,
      leftAlign: undefined,
      topAlign: undefined,
      simplePosition: undefined,
    };
  }

  private pictureOffset(hit: PictureBox): { left: number; top: number } {
    if (hit.anchorOffset) {
      return hit.anchorOffset;
    }
    const first = hit.paragraph.lines[0];
    const ctx = this.hitContext();
    if (hit.story.slot === "header" || hit.story.slot === "footer") {
      const origin = ctx.origins.find((page) => hit.y >= page.y && hit.y < page.y + ctx.pageSetup.height);
      if (origin) {
        return {
          left: hit.x - origin.x - ctx.pageSetup.contentLeft(),
          top: hit.y - origin.y - ctx.pageSetup.bandTop(hit.story.slot) - (first?.top ?? 0),
        };
      }
    }
    const paragraphOrigin = first ? this.hit.lineOrigin(first, hit.story, ctx) : null;
    return pictureWrapOffset(hit, paragraphOrigin, this.hit.worldToStory(hit.x, hit.y, ctx), first?.top ?? 0);
  }

  private reflowPicture(box: PictureBox): void {
    const document = this.documentOf(box.story);
    if (document) {
      syncPictureStream(document, box.paragraph, box.drawing);
    }
    this.relayout.apply(new EditImpact(box.story, [box.paragraph]));
    this.paint();
  }

  private refreshPictureFocus(box: PictureBox): void {
    this.selectPicture(this.livePicture(box) ?? { ...box, node: undefined });
  }

  private pictureStillThere(box: PictureBox): boolean {
    const document = this.documentOf(box.story);
    if (!document) {
      return false;
    }
    return document.paragraphs.toArray().some((paragraph) => paragraph.blocks.some((block) => block.drawing === box.drawing));
  }

  private livePicture(box: PictureBox): PictureBox | null {
    let nearest: PictureBox | null = null;
    for (const candidate of this.hit.pictures(this.hitContext())) {
      if (candidate.drawing === box.drawing && (!nearest || Math.abs(candidate.y - box.y) < Math.abs(nearest.y - box.y))) {
        nearest = candidate;
      }
    }
    return nearest;
  }

  private tableColumnCount(table: Table): number {
    const spanned = table.rows.reduce(
      (max, row) => Math.max(max, row.cells.reduce((col, cell) => Math.max(col, cell.colIndex + cell.colSpan), 0)),
      0,
    );
    return Math.max(table.columns.length, table.columnWidths.length, spanned, 1);
  }

  private syncShowMarks(): void {
    if (this.body) {
      this.body.showMarks = this.showMarks;
    }
    for (const story of this.stories()) {
      const editor = this.editorOf(story.story);
      if (editor) {
        editor.showMarks = this.showMarks;
      }
    }
  }

  private selectedParagraphTarget(): { story: StoryRef; paragraphs: Paragraph[] } | null {
    const range = this.selection.primaryRange()?.normalized();
    if (!range) {
      return null;
    }
    const document = this.documentOf(range.story);
    if (!document) {
      return null;
    }
    const startPara = range.start.node?.data.paragraph;
    const endPara = range.end.node?.data.paragraph;
    if (!startPara) {
      return null;
    }
    if (range.collapsed() || !endPara || startPara === endPara) {
      return startPara.isTable ? null : { story: range.story, paragraphs: [startPara] };
    }
    const all = document.paragraphs.toArray();
    const i0 = all.indexOf(startPara);
    const i1 = all.indexOf(endPara);
    if (i0 < 0 || i1 < i0) {
      return startPara.isTable ? null : { story: range.story, paragraphs: [startPara] };
    }
    const list = all.slice(i0, i1 + 1).filter((paragraph) => !paragraph.isTable);
    return list.length ? { story: range.story, paragraphs: list } : null;
  }

  private selectedTable(): { table: Table; cells: TableCell[]; story: StoryRef } | null {
    const flow = this.selection.flow;
    if (flow && !flow.anchor.equals(flow.focus)) {
      const anchorNode = flow.anchor.node;
      if (anchorNode && anchorNode === flow.focus.node && anchorNode.data.kind === "table" && anchorNode.data.table) {
        const cells = cellsInReadingOrder(anchorNode.data.table);
        if (!cells.length) {
          return null;
        }
        const host = this.relayout.findCellHost(cells[0]);
        return { table: anchorNode.data.table, cells, story: host?.parent ?? flow.anchor.story };
      }
      const owner = this.flowOwner(flow.anchor) ?? this.flowOwner(flow.focus);
      if (owner) {
        const cover = coverFlow(owner.document, owner.story, flow.anchor, flow.focus);
        if (
          cover.tables.length > 0 &&
          cover.ranges.length === 0 &&
          cover.fullCells.length === 0 &&
          cover.tables.every((entry, idx) => idx === 0 || tableContainsTable(cover.tables[0].table, entry.table))
        ) {
          const item = cover.tables[0];
          const cells = cellsInReadingOrder(item.table);
          if (!cells.length) {
            return null;
          }
          const host = this.relayout.findCellHost(cells[0]);
          return { table: item.table, cells, story: host?.parent ?? item.story };
        }
        if (cover.tables.length === 0 && cover.ranges.every((range) => range.story.slot === "cell")) {
          const cells: TableCell[] = [...cover.fullCells];
          for (const range of cover.ranges) {
            if (range.story.slot === "cell") {
              cells.push(range.story.cell);
            }
          }
          const unique = [...new Set(cells)];
          if (unique.length) {
            const table = this.hit.findTable(unique[0], this.hitContext());
            if (table && unique.every((cell) => tableHasDirectCell(table, cell))) {
              const host = this.relayout.findCellHost(unique[0]);
              return { table, cells: unique, story: host?.parent ?? { slot: "body" } };
            }
          }
        }
      }
      return null;
    }
    const cells: TableCell[] = [];
    for (const range of this.selection.ranges) {
      if (range.story.slot === "cell") {
        cells.push(range.story.cell);
      }
    }
    if (!cells.length) {
      return null;
    }
    const table = this.hit.findTable(cells[0], this.hitContext());
    if (!table) {
      return null;
    }
    const host = this.relayout.findCellHost(cells[0]);
    return { table, cells: [...new Set(cells)], story: host?.parent ?? { slot: "body" } };
  }

  pendingRunStyle(): RunStyle | undefined {
    return this.input.pendingStyle();
  }

  setPendingRunStyle(style: RunStyle | undefined): void {
    this.input.setPendingStyle(style);
  }

  onUi(handler: () => void): () => void {
    this.uiListeners.push(handler);
    return () => {
      const index = this.uiListeners.indexOf(handler);
      if (index >= 0) {
        this.uiListeners.splice(index, 1);
      }
    };
  }

  onStatusChange(handler: (change: StatusChange) => void): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  viewportPage(): number {
    const center = this.viewport.cssToWorld(0, this.draw.cssHeight / 2).y;
    const stride = this.pageSetup.height + this.pageSetup.pageGap;
    const page = Math.floor((center - TOP_PAD + this.pageSetup.pageGap / 2) / stride) + 1;
    return Math.max(1, Math.min(this.pageCount, page));
  }

  private notifyStatus(change: StatusChange): void {
    for (const handler of this.statusListeners) {
      handler(change);
    }
  }

  onSave(handler: () => void): () => void {
    this.saveListeners.push(handler);
    return () => {
      const index = this.saveListeners.indexOf(handler);
      if (index >= 0) {
        this.saveListeners.splice(index, 1);
      }
    };
  }

  requestSave(): void {
    for (const handler of this.saveListeners) {
      handler();
    }
  }

  setZoom(zoom: number): void {
    this.zoomPinned = true;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom || 1));
    const prev = this.viewport.zoom || 1;
    if (Math.abs(next - prev) < 0.001) {
      return;
    }
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const oldOriginX = this.pageOriginX();
    const anchor = this.viewport.cssToWorld(width / 2, height / 2);
    this.viewport.zoom = next;
    const originShift = this.pageOriginX() - oldOriginX;
    this.layout(false);
    this.root.scrollLeft = Math.max(0, (anchor.x + originShift) * next - width / 2);
    this.root.scrollTop = Math.max(0, anchor.y * next - height / 2);
    this.paint();
    for (const handler of this.uiListeners) {
      handler();
    }
  }

  async print(): Promise<void> {
    const model = this.body?.document;
    const urls = new Set<string>();
    for (const { document } of collectStories(this.stories())) {
      document.paragraphs.each(({ data: paragraph }) => {
        for (const { drawing } of paragraph.blocks) {
          if (drawing?.url && !drawing.hidden && !drawing.shape) {
            urls.add(drawing.url);
          }
        }
      });
    }
    await Promise.all([...urls].map((url) => imageCache.decode(url)));
    if (this.body?.document !== model) {
      return;
    }
    printImages(this.renderPrintImages(), this.pageSetup.width, this.pageSetup.height);
  }

  findNext(query: FindQuery): FindStatus {
    return this.moveFind(query, 1);
  }

  findPrev(query: FindQuery): FindStatus {
    return this.moveFind(query, -1);
  }

  replaceMatch(query: FindQuery, replacement: string): FindStatus {
    const hits = this.ensureHits(query);
    if (!hits.length) {
      this.findIndex = -1;
      this.paintSelection();
      return { index: 0, total: 0, replaced: 0 };
    }
    let index = this.findIndex;
    if (index < 0 || index >= hits.length) {
      index = indexAtOrAfter(hits, this.selection.caret(), this.searchStories().map((item) => item.story));
    }
    const hit = hits[index];
    this.history.do(new ReplaceCommand(this, [hit], replacement));
    return this.landAfterReplace(query, 1);
  }

  replaceAllMatches(query: FindQuery, replacement: string): FindStatus {
    const hits = [...this.ensureHits(query)];
    if (!hits.length) {
      this.findIndex = -1;
      this.paintSelection();
      return { index: 0, total: 0, replaced: 0 };
    }
    this.history.do(new ReplaceCommand(this, hits, replacement));
    const status = this.landAfterReplace(query, hits.length);
    this.findIndex = -1;
    return { ...status, index: 0 };
  }

  closeFind(): void {
    this.invalidateFind();
    this.paintSelection();
  }

  async exportDocx(): Promise<ArrayBuffer> {
    const document = this.body?.document;
    if (!document) {
      throw new Error("没有可保存的文档");
    }
    return this.writer.write(document);
  }

  hitClient(clientX: number, clientY: number): CaretPos | null {
    const world = this.clientToWorld(clientX, clientY);
    return this.hit.hit(world.x, world.y, this.hitContext());
  }

  pictureAtClient(clientX: number, clientY: number): PictureBox | null {
    const world = this.clientToWorld(clientX, clientY);
    return this.pictureAtWorld(world.x, world.y);
  }

  private pictureAtWorld(x: number, y: number): PictureBox | null {
    return this.hit.pictureAt(x, y, this.hitContext(), 3 / (this.viewport.zoom || 1));
  }

  private clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.root.getBoundingClientRect();
    const zoom = this.viewport.zoom || 1;
    return { x: (clientX - rect.left + this.root.scrollLeft) / zoom, y: (clientY - rect.top + this.root.scrollTop) / zoom };
  }

  private reflowTable(story: StoryRef, paragraph: Paragraph): void {
    this.relayout.apply(new EditImpact(story, [paragraph]));
    this.paint();
  }

  paint(): void {
    this.cancelScrollPaint();
    this.syncScroll();
    const { draw, viewport, pageSetup } = this;
    draw.clear();
    draw.setFill(WORKSPACE_BG);
    draw.fillRect(0, 0, draw.cssWidth, draw.cssHeight);

    const origins = this.pageOrigins();
    const top = viewport.cssToWorld(0, 0).y;
    const bottom = viewport.cssToWorld(0, draw.cssHeight).y;
    const range = visiblePageRange(pageSetup, this.pageCount, top, bottom);
    this.beginWorldPaint(draw);
    for (let i = range.start; i < range.end; i += 1) {
      this.painter.paint(draw, pageSetup, origins[i].x, origins[i].y, i);
    }
    this.body?.paintOnPages(origins, this.pageLabels, draw, range);
    for (let i = range.start; i < range.end; i += 1) {
      const label = this.labelAt(i);
      const header = this.bandAt("header", i);
      const footer = this.bandAt("footer", i);
      this.headerBands[header.sectionIndex]?.paintPage(origins[i], header.type, label);
      this.footerBands[footer.sectionIndex]?.paintPage(origins[i], footer.type, label);
    }
    draw.restore();
    this.paintSelection(origins);
    this.notifyStatus("view");
  }

  private paintSelection(origins = this.pageOrigins()): void {
    this.cancelPictureMoveFrame();
    const draw = this.overlay;
    draw.clear();
    this.beginWorldPaint(draw);
    const ctx = this.hitContext(origins);
    this.findPainter.paint(draw, this.findHits, ctx);
    this.selectionPainter.paint(draw, this.selection, ctx);
    this.selectionPainter.paintTableHandles(draw, ctx);
    const picture = this.pictureMovePreview ?? this.selectedPicture();
    if (picture) {
      this.selectionPainter.paintPictureHandles(draw, picture);
      this.caret.el.hidden = true;
    }
    const preview = this.textBoxDraw.preview;
    if (preview) {
      const zoom = this.viewport.zoom || 1;
      draw.setFill("rgba(76, 136, 200, 0.13)");
      draw.fillRect(preview.x, preview.y, preview.width, preview.height);
      draw.setStroke("#285f9b", 1 / zoom);
      draw.setLineDash([4 / zoom, 3 / zoom]);
      draw.strokeRect(preview.x, preview.y, preview.width, preview.height);
    }
    draw.restore();
    if (!picture && !this.textBoxDraw.direction) {
      this.caret.sync(this.selection, ctx, this.viewport);
    } else {
      this.caret.el.hidden = true;
    }
  }

  private beginWorldPaint(draw: Draw): void {
    const { scrollX, scrollY, zoom } = this.viewport;
    draw.save();
    draw.translate(-scrollX, -scrollY);
    if (zoom !== 1) {
      draw.scale(zoom, zoom);
    }
  }

  documentOf(story: StoryRef): Document | null {
    if (story.slot === "body") {
      return this.body?.document ?? null;
    }
    if (story.slot === "header") {
      return this.headerBands[storySection(story)]?.editor(storyKind(story))?.document ?? null;
    }
    if (story.slot === "footer") {
      return this.footerBands[storySection(story)]?.editor(storyKind(story))?.document ?? null;
    }
    if (story.slot === "textbox") {
      return story.block.drawing?.shape?.text ?? null;
    }
    if (this.body?.document && story.cell.document.numbering.entries().length === 0) {
      story.cell.document.numbering = this.body.document.numbering;
    }
    return story.cell.document;
  }

  flowOwner(pos: CaretPos): { document: Document; story: StoryRef } | null {
    for (const candidate of this.flowCandidates()) {
      if (caretRank(candidate.document, candidate.story, pos) != null) {
        return candidate;
      }
    }
    return null;
  }

  private sameFlow(from: CaretPos, to: CaretPos): boolean {
    const left = this.flowOwner(from);
    const right = this.flowOwner(to);
    return left != null && right != null && left.document === right.document;
  }

  private flowCandidates(): { document: Document; story: StoryRef }[] {
    const candidates: { document: Document; story: StoryRef }[] = [];
    if (this.body?.document) {
      candidates.push({ document: this.body.document, story: { slot: "body" } });
    }
    const kinds: HeaderFooterType[] = ["default", "first", "even"];
    this.headerBands.forEach((bands, sectionIndex) => {
      for (const kind of kinds) {
        const document = bands.editor(kind)?.document;
        if (document) {
          candidates.push({ document, story: { slot: "header", kind, sectionIndex } });
        }
      }
    });
    this.footerBands.forEach((bands, sectionIndex) => {
      for (const kind of kinds) {
        const document = bands.editor(kind)?.document;
        if (document) {
          candidates.push({ document, story: { slot: "footer", kind, sectionIndex } });
        }
      }
    });
    return candidates;
  }

  editorOf(story: StoryRef): StoryEditor | undefined {
    if (story.slot === "body") {
      return this.body;
    }
    if (story.slot === "header") {
      return this.headerBands[storySection(story)]?.editor(storyKind(story));
    }
    if (story.slot === "footer") {
      return this.footerBands[storySection(story)]?.editor(storyKind(story));
    }
    return undefined;
  }

  stories(): { story: StoryRef; document: Document }[] {
    const items: { story: StoryRef; document: Document }[] = [];
    if (this.body?.document) {
      items.push({ story: { slot: "body" }, document: this.body.document });
    }
    for (let index = 0; index < Math.max(this.headerBands.length, this.footerBands.length); index += 1) {
      for (const type of ["default", "first", "even"] as const) {
        const header = this.headerBands[index]?.editor(type)?.document;
        if (header) {
          items.push({ story: { slot: "header", kind: type, sectionIndex: index }, document: header });
        }
        const footer = this.footerBands[index]?.editor(type)?.document;
        if (footer) {
          items.push({ story: { slot: "footer", kind: type, sectionIndex: index }, document: footer });
        }
      }
    }
    return items;
  }

  syncBandExtents(): boolean {
    const headerExtent = Math.max(0, ...this.headerBands.map((bands) => bands.maxExtent()));
    const footerExtent = Math.max(0, ...this.footerBands.map((bands) => bands.maxExtent()));
    if (headerExtent === this.pageSetup.headerExtent && footerExtent === this.pageSetup.footerExtent) {
      return false;
    }
    this.pageSetup.headerExtent = headerExtent;
    this.pageSetup.footerExtent = footerExtent;
    return true;
  }

  afterBodyLayout(pageCount: number): void {
    this.refreshPageLabels(pageCount);
    if (pageCount !== this.pageCount) {
      this.setPageCount(pageCount);
    }
  }

  afterEdit(impact: EditImpact): void {
    if (impact.dirty.length) {
      this.invalidateFind();
      this.body?.emit(EditorEvents.documentChange, impact);
      this.notifyStatus("content");
    }
    this.onSelectionChange(true);
  }

  get hitTester(): HitTester {
    return this.hit;
  }

  hitContext(origins = this.pageOrigins()): HitContext {
    return {
      pageSetup: this.pageSetup,
      origins,
      body: this.body,
      header: this.headerBands[0]?.editor("default"),
      footer: this.footerBands[0]?.editor("default"),
      headers: this.headerBands[0]?.asRecord(),
      footers: this.footerBands[0]?.asRecord(),
      bandType: (slot, pageIndex) => this.bandAt(slot, pageIndex).type,
      bandAt: (slot, pageIndex) => this.bandAt(slot, pageIndex),
    };
  }

  caretWorld(): CaretBox | null {
    const pos = this.selection.caret();
    return pos ? this.hit.caretBox(pos, this.hitContext()) : null;
  }

  caretCss(): { x: number; y: number; height: number } | null {
    const box = this.caretWorld();
    if (!box) {
      return null;
    }
    const css = this.viewport.worldToCss(box.x, box.y);
    return { x: css.x, y: css.y, height: box.height * (this.viewport.zoom || 1) };
  }

  dispose(): void {
    this.cancelScrollPaint();
    this.root.removeEventListener("scroll", this.onScroll);
    this.root.removeEventListener("wheel", this.onWheel);
    window.visualViewport?.removeEventListener("resize", this.onVisualViewport);
    window.visualViewport?.removeEventListener("scroll", this.onVisualViewport);
    document.removeEventListener("keydown", this.onGlobalKeyDown);
    this.textBoxDraw.detach();
    this.pictureTransform.detach();
    this.input.detach();
    this.tableResize.detach();
    this.pointer.detach();
    this.contextMenu.detach();
    this.caret.remove();
    this.stopImages();
    this.body?.dispose();
    this.disposeBands();
    this.statusListeners.clear();
    const host = this.hostEl;
    host.replaceChildren();
    host.classList.remove("ho-word-workspace", "is-format-painter");
  }

  private onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    this.setZoom(stepZoom(this.viewport.zoom || 1, event.deltaY < 0 ? 1 : -1));
  };

  private renderPrintImages(): string[] {
    const width = Math.max(1, Math.round(this.pageSetup.width));
    const height = Math.max(1, Math.round(this.pageSetup.height));
    const canvas = document.createElement("canvas");
    const draw = new Draw(canvas);
    draw.resize(width, height, 2);
    const origins = this.pageOrigins();
    const images: string[] = [];
    for (let i = 0; i < origins.length; i += 1) {
      draw.clear();
      draw.setFill("#ffffff");
      draw.fillRect(0, 0, width, height);
      draw.save();
      draw.translate(-origins[i].x, -origins[i].y);
      draw.beginPath();
      draw.rect(origins[i].x, origins[i].y, this.pageSetup.width, this.pageSetup.height);
      draw.clip();
      this.body?.paintOnPages(origins, this.pageLabels, draw, { start: i, end: i + 1 });
      const label = this.labelAt(i);
      const header = this.bandAt("header", i);
      const footer = this.bandAt("footer", i);
      this.headerBands[header.sectionIndex]?.paintPage(origins[i], header.type, label, draw);
      this.footerBands[footer.sectionIndex]?.paintPage(origins[i], footer.type, label, draw);
      draw.restore();
      images.push(canvas.toDataURL("image/png"));
    }
    return images;
  }

  private moveFind(query: FindQuery, direction: -1 | 1): FindStatus {
    const hits = this.ensureHits(query);
    if (!hits.length) {
      this.findIndex = -1;
      this.paintSelection();
      return { index: 0, total: 0 };
    }
    const stories = this.searchStories().map((item) => item.story);
    let index = this.findIndex;
    if (index < 0 || index >= hits.length) {
      const caret = this.selection.caret();
      index = direction > 0 ? indexAtOrAfter(hits, caret, stories) : indexBefore(hits, caret, stories);
    } else {
      index = (index + direction + hits.length) % hits.length;
    }
    this.showHit(index);
    return { index: index + 1, total: hits.length };
  }

  private landAfterReplace(query: FindQuery, replaced: number): FindStatus {
    this.findQueryKey = "";
    const hits = this.ensureHits(query);
    if (!hits.length) {
      this.findIndex = -1;
      this.paintSelection();
      return { index: 0, total: 0, replaced };
    }
    const index = indexAtOrAfter(hits, this.selection.caret(), this.searchStories().map((item) => item.story));
    this.showHit(index);
    return { index: index + 1, total: hits.length, replaced };
  }

  private ensureHits(query: FindQuery): FindHit[] {
    const key = `${query.matchCase ? "1" : "0"}\n${query.text}`;
    if (key !== this.findQueryKey) {
      this.findQueryKey = key;
      this.findHits = query.text ? findInStories(this.searchStories(), query) : [];
      this.findIndex = -1;
    }
    return this.findHits;
  }

  private showHit(index: number): void {
    const hit = this.findHits[index];
    if (!hit) {
      return;
    }
    this.findIndex = index;
    const start = new CaretPos(hit.story, hit.start, false);
    const end = new CaretPos(hit.story, hit.end, true);
    this.selection.setRange(new SelRange(hit.story, start, end));
    this.onSelectionChange();
  }

  private searchStories() {
    return collectStories(this.stories());
  }

  private invalidateFind(): void {
    this.findHits = [];
    this.findIndex = -1;
    this.findQueryKey = "";
  }

  private cellsInRect(from: TableCell, to: TableCell): TableCell[] {
    return this.hit.cellsInRect(from, to, this.hitContext());
  }

  private followLink(pos: CaretPos): boolean {
    if (this.formatPainterMode !== "off") {
      return false;
    }
    const link = pos.node?.data.block?.link;
    if (link?.url) {
      if (!/^javascript:/i.test(link.url)) {
        window.open(link.url, "_blank", "noopener,noreferrer");
      }
      return true;
    }
    if (link?.anchor) {
      const paragraph = this.findBookmark(link.anchor);
      if (paragraph && this.jumpToParagraph(paragraph)) {
        return true;
      }
    }
    if (pos.story.slot !== "body") {
      return false;
    }
    const toc = pos.node?.data.paragraph?.toc;
    if (!toc || toc.role !== "entry" || !toc.targetId) {
      return false;
    }
    const document = this.body?.document;
    if (!document) {
      return false;
    }
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph?.id === toc.targetId) {
        this.selection.collapse(new CaretPos({ slot: "body" }, node, false));
        return true;
      }
      node = node.next;
    }
    return false;
  }

  private revealReview(match: (block: Block) => boolean): void {
    const document = this.body?.document;
    if (!document) {
      return;
    }
    let node = document.words.head;
    while (node) {
      if (node.data.block && match(node.data.block)) {
        this.selection.collapse(new CaretPos({ slot: "body" }, node, false));
        this.onSelectionChange();
        return;
      }
      node = node.next;
    }
  }

  private findBookmark(name: string): Paragraph | undefined {
    const document = this.body?.document;
    if (!document) {
      return undefined;
    }
    let found: Paragraph | undefined;
    const visit = (story: Document): void => {
      story.paragraphs.each((node) => {
        if (!found && node.data.bookmarks.includes(name)) {
          found = node.data;
        }
        const table = node.data.table;
        if (!table || found) {
          return;
        }
        for (const row of table.rows) {
          for (const cell of row.cells) {
            visit(cell.document);
          }
        }
      });
    };
    visit(document);
    return found;
  }

  private jumpToParagraph(paragraph: Paragraph): boolean {
    const document = this.body?.document;
    if (!document) {
      return false;
    }
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph) {
        this.selection.collapse(new CaretPos({ slot: "body" }, node, false));
        return true;
      }
      node = node.next;
    }
    let jumped = false;
    const visit = (story: Document, cell?: TableCell): void => {
      if (jumped) {
        return;
      }
      if (cell) {
        let word = story.words.head;
        while (word) {
          if (word.data.paragraph === paragraph) {
            this.selection.collapse(new CaretPos({ slot: "cell", cell }, word, false));
            jumped = true;
            return;
          }
          word = word.next;
        }
      }
      story.paragraphs.each((item) => {
        if (item.data.table) {
          for (const row of item.data.table.rows) {
            for (const nested of row.cells) {
              visit(nested.document, nested);
            }
          }
        }
      });
    };
    visit(document);
    return jumped;
  }

  private placeCaret(): void {
    const head = this.body?.document?.words.head;
    if (head) {
      this.selection.collapse(new CaretPos({ slot: "body" }, head, false));
    }
  }

  onSelectionChange(repaintDocument = false): void {
    if (!this.holdingPicture) {
      const focus = this.pictureFocus;
      const keepTextBox =
        focus?.drawing.shape?.text && !focus.drawing.hidden && this.selection.isEmpty() && this.pictureStillThere(focus);
      this.pictureFocus = this.pictureFromRange() ?? (keepTextBox ? focus : null);
    }
    this.body?.emit(EditorEvents.selectionChange, this.selection);
    const scrollChanged = this.syncScroll();
    const caretScrolled = this.ensureCaretVisible();
    if (repaintDocument || scrollChanged || caretScrolled || this.scrollFrame !== null) {
      this.paint();
    } else {
      this.paintSelection();
    }
    this.input.sync();
    const active = document.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      (!active.closest(".ho-word-findbar") && !active.closest(".ho-word-selection-pane"))
    ) {
      this.input.focus();
    }
    this.selectionPane.sync();
    for (const handler of this.uiListeners) {
      handler();
    }
  }

  private readonly onVisualViewport = (): void => {
    if (this.ensureCaretVisible()) {
      this.paint();
    }
  };

  /** 键盘盖住编辑区时，用视觉视口而不是整块画布高度来判断光标是否还看得见。 */
  private visibleSize(): { width: number; height: number } {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const viewport = window.visualViewport;
    if (!viewport) {
      return { width, height };
    }
    const rect = this.root.getBoundingClientRect();
    const coveredBottom = Math.max(0, rect.bottom - (viewport.offsetTop + viewport.height));
    const coveredRight = Math.max(0, rect.right - (viewport.offsetLeft + viewport.width));
    return {
      width: Math.max(80, width - coveredRight),
      height: Math.max(80, height - coveredBottom),
    };
  }

  private ensureCaretVisible(): boolean {
    if (this.holdingPicture || this.pictureFocus) {
      return false;
    }
    const box = this.caretCss();
    if (!box) {
      return false;
    }
    const pad = 8;
    const view = this.visibleSize();
    const viewW = view.width;
    const viewH = view.height;
    let dx = 0;
    let dy = 0;
    if (box.y < pad) {
      dy = box.y - pad;
    } else if (box.y + box.height > viewH - pad) {
      dy = box.y + box.height - (viewH - pad);
    }
    if (box.x < pad) {
      dx = box.x - pad;
    } else if (box.x > viewW - pad) {
      dx = box.x - (viewW - pad);
    }
    if (!dx && !dy) {
      return false;
    }
    this.root.scrollLeft += dx;
    this.root.scrollTop += dy;
    return this.syncScroll();
  }

  private applyPageSetup(document: Document): void {
    this.pageSetup.resetA4();
    this.pageSetup.adjustLineHeightInTable = document.adjustLineHeightInTable;
    const section = document.lastSection();
    if (!section) {
      return;
    }
    this.pageSetup.assign({
      width: section.pageWidthPx,
      height: section.pageHeightPx,
      leftMargin: section.leftMarginPx,
      rightMargin: section.rightMarginPx,
      headerHeight: section.topMarginPx,
      footerHeight: section.bottomMarginPx,
      headerFromEdge: section.headerFromEdgePx ?? twipToPx(720),
      footerFromEdge: section.footerFromEdgePx ?? twipToPx(720),
      headerExtent: 0,
      footerExtent: 0,
      linePitchPx: section.linePitchPx,
      adjustLineHeightInTable: document.adjustLineHeightInTable,
    });
  }

  private currentSection(): Section | undefined {
    const pos = this.selection.caret();
    const index =
      pos && (pos.story.slot === "header" || pos.story.slot === "footer")
        ? storySection(pos.story)
        : (pos?.node?.data.paragraph?.sectionIndex ?? 0);
    return this.body?.document?.sections[index] ?? this.body?.document?.lastSection();
  }

  private mountBands(document: Document): void {
    const shared = { draw: this.draw, viewport: this.viewport, pageSetup: this.pageSetup };
    const count = Math.max(1, document.sections.length);
    for (let index = 0; index < count; index += 1) {
      const headers = new BandEditors(() => new HeaderEditor(shared));
      const footers = new BandEditors(() => new FooterEditor(shared));
      headers.load(document.sections[index]?.headers ?? new Map());
      footers.load(document.sections[index]?.footers ?? new Map());
      this.headerBands.push(headers);
      this.footerBands.push(footers);
    }
  }

  private disposeBands(): void {
    for (const bands of [...this.headerBands, ...this.footerBands]) {
      bands.dispose();
    }
    this.headerBands = [];
    this.footerBands = [];
  }

  private editorsFor(slot: "header" | "footer", sectionIndex: number): BandEditors {
    const list = slot === "header" ? this.headerBands : this.footerBands;
    const shared = { draw: this.draw, viewport: this.viewport, pageSetup: this.pageSetup };
    while (list.length <= sectionIndex) {
      const section = this.ensureSection(list.length);
      const bands = new BandEditors(() => (slot === "header" ? new HeaderEditor(shared) : new FooterEditor(shared)));
      bands.load(slot === "header" ? section.headers : section.footers);
      list.push(bands);
    }
    return list[sectionIndex];
  }

  private ensureSection(index: number): Section {
    const document = this.body?.document;
    if (!document) {
      return new Section();
    }
    while (document.sections.length <= index) {
      document.sections.push(new Section());
    }
    return document.sections[index];
  }

  private refreshPageLabels(count = Math.max(this.pageCount, this.body?.pageCount() ?? 1)): void {
    this.pageLabels = labelPages(
      this.body?.lines ?? [],
      this.pageSetup.contentHeight,
      Math.max(1, count),
      this.body?.document?.sections ?? [],
    );
  }

  private labelAt(pageIndex: number): PageLabel {
    return (
      this.pageLabels[pageIndex] ?? {
        sectionIndex: 0,
        pageInSection: pageIndex + 1,
        pageNumber: pageIndex + 1,
        sectionPages: this.pageCount,
        totalPages: this.pageCount,
      }
    );
  }

  private bandAt(slot: "header" | "footer", pageIndex: number): { type: HeaderFooterType; sectionIndex: number; editor?: StoryEditor } {
    const label = this.labelAt(pageIndex);
    const section = this.body?.document?.sections[label.sectionIndex] ?? this.body?.document?.lastSection();
    const type = HeaderFooterResolver.typeForPage(
      section,
      label.pageInSection,
      this.body?.document?.evenAndOddHeaders ?? false,
    );
    const bands = slot === "header" ? this.headerBands[label.sectionIndex] : this.footerBands[label.sectionIndex];
    return { type, sectionIndex: label.sectionIndex, editor: bands?.editor(type) };
  }

  private pageOrigins() {
    return pageOrigins(this.pageSetup, this.pageCount, this.pageOriginX());
  }

  private layout(repaint = true): void {
    const before = this.viewport.zoom || 1;
    if (!this.zoomPinned) {
      const fit = this.fitZoom();
      if (fit != null) {
        this.viewport.zoom = fit;
      }
    }
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    const zoom = this.viewport.zoom || 1;
    let cssWidth = this.contentWidth() * zoom;
    if (cssWidth > width && cssWidth - width < 2) {
      cssWidth = width;
    }
    this.sizer.style.width = `${cssWidth}px`;
    this.sizer.style.height = `${this.contentHeight() * zoom}px`;
    this.draw.resize(width, height);
    this.overlay.resize(width, height);
    if (repaint) {
      this.paint();
    }
    if (Math.abs((this.viewport.zoom || 1) - before) > 0.001) {
      for (const handler of this.uiListeners) {
        handler();
      }
    }
  }

  /** 纸张放不进窗口时缩小到刚好放下；放得下就回到 100%。宽度还没量到时不改。 */
  private fitZoom(): number | null {
    const width = this.root.clientWidth;
    if (width < 64) {
      return null;
    }
    const room = width - 20;
    if (room >= this.pageSetup.width) {
      return 1;
    }
    return Math.max(MIN_ZOOM, room / this.pageSetup.width);
  }

  private sidePad(): number {
    const zoom = this.viewport.zoom || 1;
    const world = this.root.clientWidth / zoom;
    if (world >= this.pageSetup.width + SIDE_PAD * 2) {
      return SIDE_PAD;
    }
    return 8 / zoom;
  }

  private readonly onScroll = (): void => {
    if (!this.syncScroll() || this.scrollFrame !== null) {
      return;
    }
    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = null;
      this.paint();
    });
  };

  private cancelScrollPaint(): void {
    if (this.scrollFrame !== null) {
      window.cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = null;
    }
  }

  private syncScroll(): boolean {
    const { scrollLeft, scrollTop } = this.root;
    const changed = this.viewport.scrollX !== scrollLeft || this.viewport.scrollY !== scrollTop;
    this.viewport.scrollX = scrollLeft;
    this.viewport.scrollY = scrollTop;
    return changed;
  }

  private pageOriginX(): number {
    const zoom = this.viewport.zoom || 1;
    return pageOriginX(this.root.clientWidth / zoom, this.pageSetup.width, this.sidePad());
  }

  private contentWidth(): number {
    return this.pageOriginX() + this.pageSetup.width + this.sidePad();
  }

  private contentHeight(): number {
    return TOP_PAD + this.pageSetup.stackHeight(this.pageCount) + TOP_PAD;
  }
}

function listLevelOf(paragraph: { isTable?: boolean; attrs: { numId?: string; ilvl?: string } } | null | undefined): number | undefined {
  if (!paragraph || paragraph.isTable || !paragraph.attrs.numId || paragraph.attrs.numId === "0") {
    return undefined;
  }
  const level = Number(paragraph.attrs.ilvl ?? "0");
  return Number.isFinite(level) ? level : 0;
}

function tableHasDirectCell(table: Table, target: TableCell): boolean {
  return table.rows.some((row) => row.cells.includes(target));
}

function tableContainsTable(outer: Table, target: Table): boolean {
  for (const row of outer.rows) {
    for (const cell of row.cells) {
      let node = cell.document.words.head;
      while (node) {
        const nested = node.data.kind === "table" ? node.data.table : undefined;
        if (nested === target || (nested && tableContainsTable(nested, target))) {
          return true;
        }
        node = node.next;
      }
    }
  }
  return false;
}
