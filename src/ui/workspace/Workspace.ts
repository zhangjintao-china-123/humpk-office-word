import { BandEditors } from "../../editor/BandEditors";
import { BodyEditor } from "../../editor/BodyEditor";
import { FooterEditor } from "../../editor/FooterEditor";
import { HeaderEditor } from "../../editor/HeaderEditor";
import { EditorEvents } from "../../editor/types/EditorEvents";
import { HeaderFooterResolver } from "../../layout/page/HeaderFooterResolver";
import { Block } from "../../model/block/Block";
import { Paragraph } from "../../model/block/Paragraph";
import { Document } from "../../model/document/Document";
import type { HeaderFooterType } from "../../model/document/DocumentKind";
import { WordStreamBuilder } from "../../model/flatten/WordStreamBuilder";
import type { Table, TableCell } from "../../model/table/Table";
import { DEFAULT_FONT_SIZE } from "../../layout/LayoutConstants";
import { pxToPt, twipToPx } from "../../shared/units";
import { mergeRunStyle, resolveFontFamily, type RunStyle } from "../../model/style/RunStyle";
import { Clipboard } from "../../edit/Clipboard";
import { DeleteCommand } from "../../edit/DeleteCommand";
import { FormatCommand, type FormatAction } from "../../edit/FormatCommand";
import { InsertCommand } from "../../edit/InsertCommand";
import { TableBorderCommand } from "../../edit/TableBorderCommand";
import { TableBorderApplier, type TableBorderMode, type TableBorderPen } from "../../edit/TableBorderApplier";
import { DocxWriter } from "../../io/docx/writer/DocxWriter";
import type { RibbonState } from "../ribbon/Ribbon";
import { Draw } from "../../render/canvas/Draw";
import { Viewport } from "../../render/canvas/Viewport";
import { PagePainter } from "../../render/page/PagePainter";
import { PageSetup } from "../../render/page/PageSetup";
import { imageCache } from "../../render/image/ImageCache";
import { CaretView } from "../../selection/CaretView";
import { HitTester, type CaretBox, type HitContext } from "../../selection/HitTester";
import { PointerController } from "../../selection/PointerController";
import { Selection } from "../../selection/Selection";
import { SelectionPainter } from "../../selection/SelectionPainter";
import { SelectionFragment } from "../../selection/SelectionFragment";
import { SelectionText } from "../../selection/SelectionText";
import { CaretPos } from "../../selection/CaretPos";
import { storyKind, type StoryRef } from "../../selection/StoryRef";
import { ContextMenuController } from "../contextmenu/ContextMenuController";
import { EditImpact } from "../../edit/EditImpact";
import { History } from "../../edit/History";
import { InputController } from "../../edit/InputController";
import { Mutator } from "../../edit/Mutator";
import { Relayout } from "../../edit/Relayout";
import type { StoryEditor } from "../../editor/StoryEditor";
import { SIDE_PAD, TOP_PAD, pageOriginX, pageOrigins } from "./WorkspaceLayout";

const WORKSPACE_BG = "#c5c5c5";

export class Workspace {
  readonly draw: Draw;
  readonly viewport: Viewport;
  readonly pageSetup: PageSetup;
  readonly selection = new Selection();
  readonly history = new History();
  readonly mutator = new Mutator();
  readonly clipboard = new Clipboard();
  pageCount = 1;

  private readonly root: HTMLElement;
  private readonly sizer: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly painter = new PagePainter();
  private readonly hit = new HitTester();
  private readonly selectionPainter: SelectionPainter;
  private readonly pointer: PointerController;
  private readonly contextMenu: ContextMenuController;
  private readonly caret: CaretView;
  private readonly selectionText = new SelectionText();
  private readonly selectionFragment = new SelectionFragment();
  readonly relayout: Relayout;
  private readonly input: InputController;
  private readonly uiListeners: Array<() => void> = [];
  private readonly saveListeners: Array<() => void> = [];
  private readonly writer = new DocxWriter();
  private readonly borderApplier = new TableBorderApplier();
  private borderPen: TableBorderPen = { type: "single", size: "12", color: "#000000" };
  private body?: BodyEditor;
  private headers?: BandEditors;
  private footers?: BandEditors;
  private readonly stopImages: () => void;

  constructor(host: HTMLElement, pageSetup = PageSetup.a4()) {
    this.pageSetup = pageSetup;
    this.viewport = new Viewport();
    this.selectionPainter = new SelectionPainter(this.hit);

    host.classList.add("ho-word-workspace");
    host.replaceChildren();

    const scroll = document.createElement("div");
    scroll.className = "ho-word-scroll";
    this.root = scroll;

    this.sizer = document.createElement("div");
    this.sizer.className = "ho-word-sizer";
    scroll.appendChild(this.sizer);

    this.canvas = document.createElement("canvas");
    this.canvas.className = "ho-word-canvas";

    host.appendChild(scroll);
    host.appendChild(this.canvas);
    this.caret = new CaretView(host);

    this.draw = new Draw(this.canvas);
    this.stopImages = imageCache.onReady(() => this.paint());
    this.root.addEventListener("scroll", () => this.syncScroll(), { passive: true });
    this.relayout = new Relayout(this);
    this.input = new InputController(this);
    this.input.attach(host);
    this.pointer = new PointerController({
      selection: this.selection,
      hitClient: (x, y) => this.hitClient(x, y),
      cellsInRect: (from, to) => this.cellsInRect(from, to),
      onChange: () => {
        this.input.resetColumn();
        this.input.clearPending();
        this.onSelectionChange();
      },
    });
    this.pointer.attach(this.root);
    this.contextMenu = new ContextMenuController({
      selection: this.selection,
      hitClient: (x, y) => this.hitClient(x, y),
      onSelectionChange: () => {
        this.input.resetColumn();
        this.input.clearPending();
        this.onSelectionChange();
      },
      copy: () => this.copy(),
      cut: () => this.cut(),
      paste: () => this.paste(),
      deleteSelection: () => this.deleteSelection(),
    });
    this.contextMenu.attach(host, this.root);
    this.layout();
  }

  setPageCount(count: number): void {
    this.pageCount = Math.max(1, count);
    this.layout();
  }

  load(document: Document): void {
    this.body?.dispose();
    this.headers?.dispose();
    this.footers?.dispose();
    this.selection.clear();
    this.history.clear();
    this.applyPageSetup(document);

    const shared = { draw: this.draw, viewport: this.viewport, pageSetup: this.pageSetup };
    const section = document.lastSection();
    this.headers = new BandEditors(() => new HeaderEditor(shared));
    this.footers = new BandEditors(() => new FooterEditor(shared));
    this.headers.load(section?.headers ?? new Map());
    this.footers.load(section?.footers ?? new Map());
    this.syncBandExtents();

    this.body = new BodyEditor(shared);
    this.body.attach().load(document).flush();

    this.setPageCount(this.body.pageCount());
    this.input.clearPending();
    this.placeCaret();
    this.onSelectionChange();
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
    this.history.do(new FormatCommand(this, action));
  }

  async copy(): Promise<void> {
    if (!this.selectionText.hasCopyableContent(this.selection)) {
      return;
    }
    await this.clipboard.write(this.selectionFragment.extract(this.selection, this.selectedTable()?.table));
  }

  async cut(): Promise<void> {
    if (!this.selectionText.hasCopyableContent(this.selection)) {
      return;
    }
    await this.copy();
    this.history.do(new DeleteCommand(this, "backward"));
  }

  async paste(): Promise<void> {
    const payload = await this.clipboard.read();
    if (payload.empty) {
      return;
    }
    this.history.do(new InsertCommand(this, payload));
  }

  deleteSelection(): void {
    if (!this.selectionText.hasCopyableContent(this.selection)) {
      return;
    }
    this.history.do(new DeleteCommand(this, "backward"));
  }

  applyTableBorder(mode: TableBorderMode): void {
    const target = this.selectedTable();
    if (!target) {
      return;
    }
    this.history.do(new TableBorderCommand(this, target, mode, { ...this.borderPen }));
  }

  setBorderPen(pen: Partial<TableBorderPen>): void {
    this.borderPen = { ...this.borderPen, ...pen };
  }

  formatState(caption: string): RibbonState {
    const pos = this.selection.caret();
    const pending = this.input.pendingStyle();
    const node = pos?.after ? pos.node : (pos?.node?.pre ?? pos?.node);
    const run = mergeRunStyle(node?.data.getStyle(), pending);
    const family = run ? resolveFontFamily(run, node?.data.intChar ?? 0) : "宋体";
    const selected = this.selectedTable();
    return {
      fontFamily: family,
      fontSizePt: Math.round(pxToPt(run.fontSizePx ?? DEFAULT_FONT_SIZE) * 2) / 2,
      bold: !!run.bold,
      italic: !!run.italic,
      underline: !!run.underline && run.underline !== "none",
      strike: !!run.strike,
      color: run.color ?? "#111111",
      highlight: run.backgroundColor ?? run.highlight ?? "none",
      align: pos?.node?.data.paragraph?.attrs.textAlign ?? "left",
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      hasDoc: !!this.body?.document,
      caption,
      inTable: !!selected,
      borderPen: { ...this.borderPen },
      borderFlags: selected ? this.borderApplier.inspect(selected.cells, selected.table) : undefined,
    };
  }

  private selectedTable(): { table: Table; cells: TableCell[]; story: StoryRef } | null {
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

  async exportDocx(): Promise<ArrayBuffer> {
    const document = this.body?.document;
    if (!document) {
      throw new Error("没有可保存的文档");
    }
    return this.writer.write(document);
  }

  hitClient(clientX: number, clientY: number): CaretPos | null {
    const rect = this.root.getBoundingClientRect();
    const world = this.viewport.cssToWorld(clientX - rect.left, clientY - rect.top);
    return this.hit.hit(world.x, world.y, this.hitContext());
  }

  paint(): void {
    const { draw, viewport, pageSetup } = this;
    draw.clear();
    draw.setFill(WORKSPACE_BG);
    draw.fillRect(0, 0, draw.cssWidth, draw.cssHeight);

    draw.save();
    draw.translate(-viewport.scrollX, -viewport.scrollY);
    const origins = this.pageOrigins();
    for (let i = 0; i < origins.length; i += 1) {
      this.painter.paint(draw, pageSetup, origins[i].x, origins[i].y, i);
    }
    this.body?.paintOnPages(origins);
    this.headers?.paintOnPages(origins, (index) => this.bandType(index));
    this.footers?.paintOnPages(origins, (index) => this.bandType(index));
    const ctx = this.hitContext(origins);
    this.selectionPainter.paint(draw, this.selection, ctx);
    draw.restore();
    this.caret.sync(this.selection, ctx, this.viewport);
  }

  documentOf(story: StoryRef): Document | null {
    if (story.slot === "body") {
      return this.body?.document ?? null;
    }
    if (story.slot === "header") {
      return this.headers?.editor(storyKind(story))?.document ?? null;
    }
    if (story.slot === "footer") {
      return this.footers?.editor(storyKind(story))?.document ?? null;
    }
    return story.cell.document;
  }

  editorOf(story: StoryRef): StoryEditor | undefined {
    if (story.slot === "body") {
      return this.body;
    }
    if (story.slot === "header") {
      return this.headers?.editor(storyKind(story));
    }
    if (story.slot === "footer") {
      return this.footers?.editor(storyKind(story));
    }
    return undefined;
  }

  stories(): { story: StoryRef; document: Document }[] {
    const items: { story: StoryRef; document: Document }[] = [];
    if (this.body?.document) {
      items.push({ story: { slot: "body" }, document: this.body.document });
    }
    for (const type of ["default", "first", "even"] as const) {
      const header = this.headers?.editor(type)?.document;
      if (header) {
        items.push({ story: { slot: "header", kind: type }, document: header });
      }
      const footer = this.footers?.editor(type)?.document;
      if (footer) {
        items.push({ story: { slot: "footer", kind: type }, document: footer });
      }
    }
    return items;
  }

  syncBandExtents(): boolean {
    const headerExtent = this.headers?.maxExtent() ?? 0;
    const footerExtent = this.footers?.maxExtent() ?? 0;
    if (headerExtent === this.pageSetup.headerExtent && footerExtent === this.pageSetup.footerExtent) {
      return false;
    }
    this.pageSetup.headerExtent = headerExtent;
    this.pageSetup.footerExtent = footerExtent;
    return true;
  }

  afterBodyLayout(pageCount: number): void {
    if (pageCount !== this.pageCount) {
      this.setPageCount(pageCount);
    }
  }

  afterEdit(impact: EditImpact): void {
    if (impact.dirty.length) {
      this.body?.emit(EditorEvents.documentChange, impact);
    }
    this.onSelectionChange();
  }

  get hitTester(): HitTester {
    return this.hit;
  }

  hitContext(origins = this.pageOrigins()): HitContext {
    return {
      pageSetup: this.pageSetup,
      origins,
      body: this.body,
      header: this.headers?.editor("default"),
      footer: this.footers?.editor("default"),
      headers: this.headers?.asRecord(),
      footers: this.footers?.asRecord(),
      bandType: (_slot, pageIndex) => this.bandType(pageIndex),
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
    return { x: css.x, y: css.y, height: box.height };
  }

  dispose(): void {
    this.input.detach();
    this.pointer.detach();
    this.contextMenu.detach();
    this.caret.remove();
    this.stopImages();
    this.body?.dispose();
    this.headers?.dispose();
    this.footers?.dispose();
    const host = this.canvas.parentElement;
    host?.replaceChildren();
    host?.classList.remove("ho-word-workspace");
  }

  private cellsInRect(from: TableCell, to: TableCell): TableCell[] {
    return this.hit.cellsInRect(from, to, this.hitContext());
  }

  private placeCaret(): void {
    const head = this.body?.document?.words.head;
    if (head) {
      this.selection.collapse(new CaretPos({ slot: "body" }, head, false));
    }
  }

  private onSelectionChange(): void {
    this.body?.emit(EditorEvents.selectionChange, this.selection);
    this.ensureCaretVisible();
    this.paint();
    this.input.sync();
    this.input.focus();
    for (const handler of this.uiListeners) {
      handler();
    }
  }

  private ensureCaretVisible(): void {
    const box = this.caretCss();
    if (!box) {
      return;
    }
    const pad = 8;
    const viewW = this.root.clientWidth;
    const viewH = this.root.clientHeight;
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
      return;
    }
    this.root.scrollLeft += dx;
    this.root.scrollTop += dy;
    this.viewport.scrollX = this.root.scrollLeft;
    this.viewport.scrollY = this.root.scrollTop;
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

  private bandType(pageIndex: number): HeaderFooterType {
    return HeaderFooterResolver.typeForPage(
      this.body?.document?.lastSection(),
      pageIndex + 1,
      this.body?.document?.evenAndOddHeaders ?? false,
    );
  }

  private pageOrigins() {
    return pageOrigins(this.pageSetup, this.pageCount, this.pageOriginX());
  }

  private layout(): void {
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    this.sizer.style.width = `${this.contentWidth()}px`;
    this.sizer.style.height = `${this.contentHeight()}px`;
    this.draw.resize(width, height);
    this.syncScroll();
  }

  private syncScroll(): void {
    this.viewport.scrollX = this.root.scrollLeft;
    this.viewport.scrollY = this.root.scrollTop;
    this.paint();
  }

  private pageOriginX(): number {
    return pageOriginX(this.root.clientWidth, this.pageSetup.width);
  }

  private contentWidth(): number {
    return this.pageOriginX() + this.pageSetup.width + SIDE_PAD;
  }

  private contentHeight(): number {
    return TOP_PAD + this.pageSetup.stackHeight(this.pageCount) + TOP_PAD;
  }
}
