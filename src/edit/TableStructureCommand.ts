import type { Paragraph } from "../model/block/Paragraph";
import type { Table, TableCell } from "../model/table/Table";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import { TableStructure } from "./TableStructure";

export type TableStructureOp =
  | { type: "insertRow" | "deleteRow" | "insertColumn" | "deleteColumn"; index: number }
  | { type: "merge"; cells: TableCell[] }
  | { type: "split"; cell: TableCell };

interface CellState {
  cell: TableCell;
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
}

interface TableSnap {
  columns: Table["columns"];
  rows: { row: Table["rows"][number]; cells: TableCell[] }[];
  states: CellState[];
}

export class TableStructureCommand implements EditCommand {
  private readonly structure = new TableStructure();
  private played = false;
  private before: TableSnap | null = null;
  private after: TableSnap | null = null;
  private hostParagraph: Paragraph | undefined;

  constructor(
    private readonly ctx: EditContext,
    private readonly table: Table,
    private readonly story: StoryRef,
    private readonly anchor: TableCell,
    private readonly op: TableStructureOp,
  ) {}

  do(): void {
    if (this.played && this.after) {
      restore(this.table, this.after);
      this.commit();
      return;
    }
    this.played = true;
    this.hostParagraph = this.ctx.relayout.findCellHost(this.anchor)?.paragraph;
    this.before = snap(this.table);
    this.apply();
    this.after = snap(this.table);
    this.commit();
  }

  undo(): void {
    if (this.before) {
      restore(this.table, this.before);
      this.commit();
    }
  }

  private apply(): void {
    if (this.op.type === "insertRow") {
      this.structure.insertRow(this.table, this.op.index);
    } else if (this.op.type === "deleteRow") {
      this.structure.deleteRow(this.table, this.op.index);
    } else if (this.op.type === "insertColumn") {
      this.structure.insertColumn(this.table, this.op.index);
    } else if (this.op.type === "deleteColumn") {
      this.structure.deleteColumn(this.table, this.op.index);
    } else if (this.op.type === "merge") {
      this.structure.merge(this.table, this.op.cells);
    } else if (this.op.type === "split") {
      this.structure.split(this.table, this.op.cell);
    }
  }

  private commit(): void {
    const dirty = this.hostParagraph ? [this.hostParagraph] : [];
    if (dirty.length) {
      this.ctx.relayout.apply(new EditImpact(this.story, dirty));
    }
    this.ctx.afterEdit(new EditImpact(this.story, dirty));
  }
}

function snap(table: Table): TableSnap {
  const states: CellState[] = [];
  for (const row of table.rows) {
    for (const cell of row.cells) {
      states.push({
        cell,
        rowIndex: cell.rowIndex,
        colIndex: cell.colIndex,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
      });
    }
  }
  return {
    columns: table.columns.slice(),
    rows: table.rows.map((row) => ({ row, cells: row.cells.slice() })),
    states,
  };
}

function restore(table: Table, shot: TableSnap): void {
  table.columns = shot.columns.slice();
  table.rows = shot.rows.map((item) => {
    item.row.cells = item.cells.slice();
    return item.row;
  });
  for (const state of shot.states) {
    state.cell.rowIndex = state.rowIndex;
    state.cell.colIndex = state.colIndex;
    state.cell.rowSpan = state.rowSpan;
    state.cell.colSpan = state.colSpan;
  }
}
