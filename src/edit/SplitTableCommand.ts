import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import { Word } from "../model/inline/Word";
import { LinkedNode } from "../model/list/LinkedList";
import { Table, type TableRow } from "../model/table/Table";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

export class SplitTableCommand implements EditCommand {
  private readonly table: Table;
  private readonly rows: TableRow[];
  private readonly second = new Paragraph(0);
  private readonly separator = new Paragraph(0);
  private readonly enter = new LinkedNode(new Word());
  private readonly tableNode = new LinkedNode(new Word());

  constructor(
    private readonly ctx: EditContext,
    private readonly document: Document,
    private readonly story: StoryRef,
    private readonly original: Paragraph,
    private readonly originalNode: LinkedNode<Word>,
    private readonly row: number,
  ) {
    this.table = original.table!;
    this.rows = this.table.rows.slice();
    this.separator.addBlock(new Block());
    this.separator.sectionIndex = this.second.sectionIndex = original.sectionIndex;
    this.second.isTable = true;
    this.second.table = Object.assign(new Table(), this.table, { rows: this.rows.slice(row) });
    this.enter.data.char = "\n";
    this.enter.data.intChar = 10;
    this.enter.data.paragraph = this.separator;
    this.enter.data.block = this.separator.blocks[0];
    this.tableNode.data.kind = "table";
    this.tableNode.data.table = this.second.table;
    this.tableNode.data.paragraph = this.second;
  }

  do(): void {
    const firstId = this.document.nextParagraphId();
    this.separator.id = firstId;
    this.second.id = firstId + 1;
    this.table.rows = this.rows.slice(0, this.row);
    setRowIndexes(this.second.table!.rows);
    this.document.insertParagraphAfter(this.original, this.separator);
    this.document.insertParagraphAfter(this.separator, this.second);
    this.document.words.insertNodeAfter(this.originalNode, this.enter);
    this.document.words.insertNodeAfter(this.enter, this.tableNode);
    this.finish([this.original, this.separator, this.second], "split");
  }

  undo(): void {
    this.document.words.removeNode(this.tableNode);
    this.document.words.removeNode(this.enter);
    this.document.removeParagraph(this.second);
    this.document.removeParagraph(this.separator);
    this.table.rows = this.rows.slice();
    setRowIndexes(this.table.rows);
    this.finish([this.original], "merge");
  }

  private finish(dirty: Paragraph[], structure: "split" | "merge"): void {
    for (const paragraph of dirty) paragraph.changed = true;
    const impact = new EditImpact(this.story, dirty, structure);
    this.ctx.relayout.apply(impact);
    this.ctx.afterEdit(impact);
  }
}

function setRowIndexes(rows: TableRow[]): void {
  rows.forEach((row, index) => {
    for (const cell of row.cells) cell.rowIndex = index;
  });
}
