import type { Document } from "../model/document/Document";
import type { Paragraph } from "../model/block/Paragraph";
import { Line } from "../model/line/Line";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { LayoutConstraints } from "./LayoutConstraints";
import { LineBreaker } from "./line/LineBreaker";
import { MeasurePass } from "./measure/MeasurePass";
import { MixSpacing } from "./measure/MixSpacing";
import { Paginator } from "./page/Paginator";
import { TableLayouter } from "./table/TableLayouter";
import { TokenBuilder } from "./token/TokenBuilder";
import { AnchorLayout } from "./anchor/AnchorLayout";

export class StoryLayout {
  private readonly measure = new MeasurePass();
  private readonly mix = new MixSpacing();
  private readonly tokens = new TokenBuilder();
  private readonly breaker = new LineBreaker();
  private readonly paginator = new Paginator();
  private readonly anchors = new AnchorLayout();

  layout(document: Document, constraints: LayoutConstraints): Line[] {
    this.breaker.setGridPitch(constraints.linePitchPx);
    this.measure.run(document, constraints.measurer);
    this.mix.apply(document);
    const tokens = this.tokens.build(document.words.head);
    const tables = this.tableLayouter(constraints);
    for (const token of tokens) {
      if (token.kind === "table" && token.start.data.table) {
        tables.layout(token.start.data.table, constraints);
      }
    }

    const lines = this.breaker.break(tokens, constraints.contentWidth);
    this.applyTableHeights(lines);
    const placed =
      constraints.paginate === false
        ? this.stack(lines)
        : this.paginator.paginate(lines, constraints.contentHeight);
    this.assignParagraphLines(document, placed);
    document.anchors = this.anchors.run(document, placed, constraints);
    return placed;
  }

  reflow(document: Document, constraints: LayoutConstraints, dirty: Paragraph[]): Line[] {
    this.breaker.setGridPitch(constraints.linePitchPx);
    const unique = [...new Set(dirty)];
    const tables = this.tableLayouter(constraints);
    for (const paragraph of unique) {
      paragraph.changed = false;
      if (paragraph.isTable) {
        if (paragraph.table) {
          tables.layout(paragraph.table, constraints);
        }
        continue;
      }
      const nodes = this.nodesOf(document, paragraph);
      const words = nodes.map((node) => node.data);
      this.measure.runWords(words, constraints.measurer);
      this.mix.applyWords(words);
      const tokens = this.tokens.buildWhile(nodes[0] ?? null, (node) => node.data.paragraph === paragraph);
      paragraph.lines = this.breaker.break(tokens, constraints.contentWidth);
    }
    const assembled = this.assemble(document);
    this.breaker.collapseAdjacent(assembled);
    this.applyTableHeights(assembled);
    const placed =
      constraints.paginate === false ? this.stack(assembled) : this.paginator.paginate(assembled, constraints.contentHeight);
    this.assignParagraphLines(document, placed);
    document.anchors = this.anchors.run(document, placed, constraints);
    return placed;
  }

  private applyTableHeights(lines: Line[]): void {
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

  private tableLayouter(constraints: LayoutConstraints): TableLayouter {
    return new TableLayouter((cell, width) =>
      this.layout(cell, {
        ...constraints,
        contentWidth: width,
        contentHeight: Number.POSITIVE_INFINITY,
        paginate: false,
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

  private nodesOf(document: Document, paragraph: Paragraph): LinkedNode<Word>[] {
    const nodes: LinkedNode<Word>[] = [];
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph) {
        nodes.push(node);
      }
      node = node.next;
    }
    return nodes;
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
