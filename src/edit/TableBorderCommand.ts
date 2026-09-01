import type { Table, TableCell } from "../model/table/Table";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import { TableBorderApplier, type TableBorderMode, type TableBorderPen } from "./TableBorderApplier";

export interface TableBorderTarget {
  table: Table;
  cells: TableCell[];
  story: StoryRef;
}

export class TableBorderCommand implements EditCommand {
  private readonly applier = new TableBorderApplier();
  private played = false;
  private before: ReturnType<TableBorderApplier["snapshot"]> = [];
  private after: ReturnType<TableBorderApplier["snapshot"]> = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly target: TableBorderTarget,
    private readonly mode: TableBorderMode,
    private readonly pen: TableBorderPen,
  ) {}

  do(): void {
    if (this.played) {
      this.applier.restore(this.after);
      this.commit();
      return;
    }
    this.played = true;
    this.before = this.applier.snapshot(this.target.cells);
    this.applier.apply(this.target.cells, this.target.table, this.mode, this.pen);
    this.after = this.applier.snapshot(this.target.cells);
    this.commit();
  }

  undo(): void {
    this.applier.restore(this.before);
    this.commit();
  }

  private commit(): void {
    const host = this.ctx.relayout.findCellHost(this.target.cells[0]);
    const dirty = host ? [host.paragraph] : [];
    if (dirty.length) {
      this.ctx.relayout.apply(new EditImpact(this.target.story, dirty));
    }
    this.ctx.afterEdit(new EditImpact(this.target.story, dirty));
  }
}
