import type { Paragraph } from "../model/block/Paragraph";
import type { ParagraphShading } from "../model/style/ParagraphAttrs";
import type { TableCell } from "../model/table/Table";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

export type ShadingTarget =
  | { kind: "cells"; cells: TableCell[]; story: StoryRef }
  | { kind: "paragraphs"; paragraphs: Paragraph[]; story: StoryRef };

interface CellSnap {
  cell: TableCell;
  fill: string | undefined;
}

interface ParaSnap {
  paragraph: Paragraph;
  shading: ParagraphShading | undefined;
}

export class ShadingCommand implements EditCommand {
  private played = false;
  private cellSnaps: CellSnap[] = [];
  private paraSnaps: ParaSnap[] = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly target: ShadingTarget,
    private readonly color: string,
  ) {}

  do(): void {
    if (this.played) {
      if (this.target.kind === "cells") {
        const next = normalizeFill(this.color);
        for (const item of this.cellSnaps) {
          item.cell.fill = next;
        }
      } else {
        const next = makeParaShading(this.color);
        for (const item of this.paraSnaps) {
          item.paragraph.attrs = { ...item.paragraph.attrs, shading: next ? { ...next } : undefined };
          if (!next) {
            delete item.paragraph.attrs.shading;
          }
          item.paragraph.changed = true;
        }
      }
      this.commit();
      return;
    }
    this.played = true;

    if (this.target.kind === "cells") {
      const next = normalizeFill(this.color);
      this.cellSnaps = this.target.cells.map((cell) => ({ cell, fill: cell.fill }));
      for (const cell of this.target.cells) {
        cell.fill = next;
      }
    } else {
      const next = makeParaShading(this.color);
      this.paraSnaps = this.target.paragraphs.map((paragraph) => ({
        paragraph,
        shading: paragraph.attrs.shading ? { ...paragraph.attrs.shading } : undefined,
      }));
      for (const paragraph of this.target.paragraphs) {
        paragraph.attrs = { ...paragraph.attrs, shading: next ? { ...next } : undefined };
        if (!next) {
          delete paragraph.attrs.shading;
        }
        paragraph.changed = true;
      }
    }
    this.commit();
  }

  undo(): void {
    if (this.target.kind === "cells") {
      for (const item of this.cellSnaps) {
        item.cell.fill = item.fill;
      }
    } else {
      for (const item of this.paraSnaps) {
        item.paragraph.attrs = {
          ...item.paragraph.attrs,
          shading: item.shading ? { ...item.shading } : undefined,
        };
        if (!item.shading) {
          delete item.paragraph.attrs.shading;
        }
        item.paragraph.changed = true;
      }
    }
    this.commit();
  }

  private commit(): void {
    if (this.target.kind === "cells") {
      const host = this.target.cells[0] ? this.ctx.relayout.findCellHost(this.target.cells[0]) : null;
      const dirty = host ? [host.paragraph] : [];
      if (dirty.length) {
        this.ctx.relayout.apply(new EditImpact(this.target.story, dirty));
      }
      this.ctx.afterEdit(new EditImpact(this.target.story, dirty));
      return;
    }
    const dirty = this.target.paragraphs;
    if (dirty.length) {
      this.ctx.relayout.apply(new EditImpact(this.target.story, dirty));
    }
    this.ctx.afterEdit(new EditImpact(this.target.story, dirty));
  }
}

export function paragraphShadingHex(shading: ParagraphShading | undefined): string {
  if (!shading || shading.val === "nil" || shading.val === "none") {
    return "none";
  }
  const fill = shading.fill?.trim();
  if (!fill || fill === "auto") {
    return "none";
  }
  return fill.startsWith("#") ? fill.toUpperCase() : `#${fill.toUpperCase()}`;
}

function normalizeFill(color: string): string | undefined {
  const value = color.trim();
  if (!value || value === "none") {
    return undefined;
  }
  return value.startsWith("#") ? value : `#${value}`;
}

function makeParaShading(color: string): ParagraphShading | undefined {
  const normalized = normalizeFill(color);
  if (!normalized) {
    return undefined;
  }
  return {
    val: "clear",
    color: "auto",
    fill: normalized.slice(1).toUpperCase(),
  };
}
