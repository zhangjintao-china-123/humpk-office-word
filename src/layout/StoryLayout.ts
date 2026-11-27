import type { Document } from "../model/document/Document";
import { textBoxGeometry } from "../model/graphic/TextBoxGeometry";
import type { Paragraph } from "../model/block/Paragraph";
import { Line } from "../model/line/Line";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { paragraphStartWord } from "../model/flatten/WordStreamBuilder";
import { twipToPx } from "../shared/units";
import type { LayoutConstraints } from "./LayoutConstraints";
import { LineBreaker } from "./line/LineBreaker";
import { MeasurePass } from "./measure/MeasurePass";
import { MixSpacing } from "./measure/MixSpacing";
import { Paginator } from "./page/Paginator";
import { TableLayouter } from "./table/TableLayouter";
import { tableOffset } from "./table/TableMetrics";
import { TokenBuilder } from "./token/TokenBuilder";
import { assignTocPages } from "../model/toc/Toc";
import { AnchorLayout } from "./anchor/AnchorLayout";

type LayoutGeometry = Pick<LayoutConstraints, "contentWidth" | "contentHeight" | "linePitchPx" | "paginate">;

export class StoryLayout {
  // 首次打开和文本编辑由不同的排版实例处理，复用条件跟随已经发布的行数组。
  private static readonly unwrappedLayouts = new WeakMap<Line[], LayoutGeometry>();
  private readonly measure = new MeasurePass();
  private readonly mix = new MixSpacing();
  private readonly tokens = new TokenBuilder();
  private readonly breaker = new LineBreaker();
  private readonly paginator = new Paginator();
  private readonly anchors = new AnchorLayout();

  layout(document: Document, constraints: LayoutConstraints): Line[] {
    this.breaker.setGridPitch(constraints.linePitchPx);
    this.breaker.setDefaultTab(twipToPx(document.defaultTabStopTwip ?? 720));
    this.measure.run(document, constraints.measurer);
    this.mix.apply(document);
    const tokens = this.tokens.build(document.words.head);
    const tables = this.tableLayouter(constraints);
    for (const token of tokens) {
      if (token.kind === "table" && token.start.data.table) {
        tables.layout(token.start.data.table, constraints);
      }
    }

    return this.place(document, this.breaker.break(tokens, constraints.contentWidth), constraints);
  }

  reflow(
    document: Document,
    constraints: LayoutConstraints,
    dirty: Paragraph[],
    previous?: Line[],
    textAnchor?: LinkedNode<Word>,
  ): Line[] {
    this.breaker.setGridPitch(constraints.linePitchPx);
    this.breaker.setDefaultTab(twipToPx(document.defaultTabStopTwip ?? 720));
    const unique = [...new Set(dirty)];
    const edited = unique.length === 1 && unique[0] === textAnchor?.data.paragraph ? unique[0] : undefined;
    let updated: Line[] | undefined;
    const geometry = previous && StoryLayout.unwrappedLayouts.get(previous);
    if (edited && textAnchor && previous && geometry &&
      geometry.contentWidth === constraints.contentWidth && geometry.contentHeight === constraints.contentHeight &&
      geometry.linePitchPx === constraints.linePitchPx && geometry.paginate === constraints.paginate &&
      !edited.isTable && !edited.toc &&
      edited.blocks.every((block) => !block.drawing && !block.charType && !block.field && !block.footnoteId && !block.commentRef)
    ) {
      updated = this.breakParagraph(document, edited, constraints, textAnchor);
      if (this.reusePositions(edited.lines, updated)) {
        edited.changed = false;
        return previous;
      }
    }

    const hasWrap = document.anchors.some((anchor) => anchor.wrap !== "none" || (anchor.drawing.anchorSet?.wrapType ?? "none") !== "none");
    if ((previous && !geometry) || hasWrap || document.paragraphs.each((node) => node.data.isTable && node.data.hasAnchor)) {
      // 已绕排的片段不能当作普通段落行重新分页。每次从字流建立相同的定位基线。
      return this.layout(document, constraints);
    }
    const tables = this.tableLayouter(constraints);
    for (const paragraph of unique) {
      paragraph.changed = false;
      if (paragraph.isTable) {
        if (paragraph.table) {
          tables.layout(paragraph.table, constraints);
        }
        continue;
      }
      paragraph.lines = paragraph === edited && updated
        ? updated
        : this.breakParagraph(document, paragraph, constraints, textAnchor);
    }
    const assembled = this.assemble(document);
    for (const line of assembled) {
      this.breaker.restoreSpacing(line);
    }
    this.breaker.collapseAdjacent(assembled);
    return this.place(document, assembled, constraints);
  }

  private breakParagraph(document: Document, paragraph: Paragraph, constraints: LayoutConstraints, textAnchor?: LinkedNode<Word>): Line[] {
    const first = textAnchor?.data.paragraph === paragraph
      ? paragraphStartWord(textAnchor)
      : this.firstWordOf(document, paragraph);
    const words: Word[] = [];
    for (let node = first; node?.data.paragraph === paragraph; node = node.next) {
      words.push(node.data);
    }
    this.measure.runWords(words, constraints.measurer);
    this.mix.applyWords(words);
    const tokens = this.tokens.buildWhile(first, (node) => node.data.paragraph === paragraph);
    return this.breaker.break(tokens, constraints.contentWidth);
  }

  private reusePositions(current: Line[], updated: Line[]): boolean {
    if (!current.length || updated.length !== current.length || updated.some((line, index) =>
      line.type || current[index].type || line.boxHeight !== current[index].boxHeight ||
      line.isFirst !== current[index].isFirst || line.isLast !== current[index].isLast
    )) {
      return false;
    }
    for (const [index, line] of updated.entries()) {
      const existing = current[index];
      // 保留已分页的行对象和纵向坐标，让页索引与其他段落继续有效。
      const { top, pageIndex, height, fullHeight, beforeHeight, afterHeight } = existing;
      Object.assign(existing, line, { top, pageIndex, height, fullHeight, beforeHeight, afterHeight });
    }
    return true;
  }

  private place(document: Document, lines: Line[], constraints: LayoutConstraints): Line[] {
    this.applyTableHeights(lines, constraints.contentWidth);
    const placed =
      constraints.paginate === false ? this.stack(lines) : this.paginator.paginate(lines, constraints.contentHeight);
    this.assignParagraphLines(document, placed);
    this.layoutFloatingTables(document, constraints);
    const flowed = this.anchors.finish(document, placed, constraints);
    this.assignParagraphLines(document, flowed.lines);
    document.anchors = flowed.anchors;
    this.refreshToc(document, constraints);
    this.layoutShapes(document, constraints);
    if (!flowed.wrapped) {
      const { contentWidth, contentHeight, linePitchPx, paginate } = constraints;
      StoryLayout.unwrappedLayouts.set(flowed.lines, { contentWidth, contentHeight, linePitchPx, paginate });
    }
    return flowed.lines;
  }

  private layoutShapes(document: Document, constraints: LayoutConstraints): void {
    const visit = (story: Document): void => {
      story.paragraphs.each((node) => {
        for (const block of node.data.blocks) {
          const shape = block.drawing?.shape;
          const inner = shape?.text;
          if (!inner || !block.drawing) {
            continue;
          }
          const area = textBoxGeometry(block.drawing);
          this.layout(inner, {
            ...constraints,
            contentWidth: area.width,
            contentHeight: Math.max(area.height, 1000),
            paginate: false,
          });
        }
        const table = node.data.table;
        if (!table) {
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
  }

  private refreshToc(document: Document, constraints: LayoutConstraints): void {
    if (constraints.paginate === false) {
      return;
    }
    assignTocPages(document, constraints.contentHeight);
  }

  private applyTableHeights(lines: Line[], contentWidth: number): void {
    for (const line of lines) {
      if (line.type !== "table") {
        continue;
      }
      const table = line.startNode?.data.table;
      if (!table) {
        continue;
      }
      const height = table.rowHeights.reduce((sum, row) => sum + row, 0);
      line.height = Math.max(line.height, height);
      line.fullHeight = line.height;
      line.tableRowFrom = 0;
      line.tableRowTo = table.rows.length;
      if (!line.paragraph?.hasAnchor) {
        line.leftBlankWidth = tableOffset(table, contentWidth);
      }
    }
  }

  private stack(lines: Line[]): Line[] {
    let y = 0;
    for (const line of lines) {
      line.top = y;
      y += line.height;
    }
    return lines;
  }

  private assemble(document: Document): Line[] {
    const lines: Line[] = [];
    document.paragraphs.each((node) => {
      const paragraph = node.data;
      if (paragraph.isTable) {
        const tableLine = this.canonicalTableLine(document, paragraph);
        if (tableLine) {
          lines.push(tableLine);
        }
        return;
      }
      lines.push(...paragraph.lines);
    });
    return lines;
  }

  private layoutFloatingTables(document: Document, constraints: LayoutConstraints): void {
    const tables = this.tableLayouter(constraints);
    document.paragraphs.each((node) => {
      const paragraph = node.data;
      if (paragraph.isTable && paragraph.hasAnchor && paragraph.table) {
        tables.layout(paragraph.table, constraints);
      }
    });
  }

  private tableLayouter(constraints: LayoutConstraints): TableLayouter {
    return new TableLayouter((cell, width) =>
      this.layout(cell, {
        ...constraints,
        contentWidth: width,
        contentHeight: Number.POSITIVE_INFINITY,
        paginate: false,
        leftMargin: 0,
        topMargin: 0,
        storyTop: 0,
        pageWidth: width,
        pageHeight: undefined,
        linePitchPx: constraints.adjustLineHeightInTable ? constraints.linePitchPx : undefined,
      }),
    );
  }

  private canonicalTableLine(document: Document, paragraph: Paragraph): Line | null {
    const existing = paragraph.lines[0];
    const table = paragraph.table;
    if (!existing && !table) {
      return null;
    }
    const line = new Line();
    line.type = "table";
    line.paragraph = paragraph;
    line.startNode = existing?.startNode ?? this.tableWordOf(document, paragraph);
    line.length = existing?.length ?? 1;
    line.isFirst = line.isLast = true;
    line.tableRowFrom = 0;
    line.tableRowTo = table?.rows.length ?? existing?.tableRowTo ?? 0;
    const height = table?.rowHeights.reduce((sum, row) => sum + row, 0) ?? existing?.height ?? 0;
    line.height = height;
    line.fullHeight = height;
    return line;
  }

  private tableWordOf(document: Document, paragraph: Paragraph): LinkedNode<Word> | null {
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph && node.data.kind === "table") {
        return node;
      }
      node = node.next;
    }
    return null;
  }

  private firstWordOf(document: Document, paragraph: Paragraph): LinkedNode<Word> | null {
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph) {
        return node;
      }
      node = node.next;
    }
    return null;
  }

  private assignParagraphLines(document: Document, lines: Line[]): void {
    document.paragraphs.each((node) => {
      node.data.lines = [];
    });
    for (const line of lines) {
      line.paragraph?.lines.push(line);
    }
  }
}
