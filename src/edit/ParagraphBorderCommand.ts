import type { Paragraph } from "../model/block/Paragraph";
import type { ParagraphBorder } from "../model/style/ParagraphAttrs";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";
import type { TableBorderFlags, TableBorderMode, TableBorderPen } from "./TableBorderApplier";

type ParaBorderKey = "borderTop" | "borderBottom" | "borderLeft" | "borderRight" | "borderBetween";

const ALL_KEYS: ParaBorderKey[] = ["borderTop", "borderBottom", "borderLeft", "borderRight", "borderBetween"];

interface ParaBorderSnap {
  paragraph: Paragraph;
  borders: Partial<Record<ParaBorderKey, ParagraphBorder | undefined>>;
}

export class ParagraphBorderCommand implements EditCommand {
  private played = false;
  private before: ParaBorderSnap[] = [];
  private after: ParaBorderSnap[] = [];

  constructor(
    private readonly ctx: EditContext,
    private readonly story: StoryRef,
    private readonly paragraphs: Paragraph[],
    private readonly mode: TableBorderMode,
    private readonly pen: TableBorderPen,
  ) {}

  do(): void {
    if (this.played) {
      restoreSnaps(this.after);
      this.commit();
      return;
    }
    this.played = true;
    this.before = takeSnaps(this.paragraphs);
    applyParagraphBorders(this.paragraphs, this.mode, this.pen);
    this.after = takeSnaps(this.paragraphs);
    this.commit();
  }

  undo(): void {
    restoreSnaps(this.before);
    this.commit();
  }

  private commit(): void {
    if (this.paragraphs.length) {
      this.ctx.relayout.apply(new EditImpact(this.story, this.paragraphs));
    }
    this.ctx.afterEdit(new EditImpact(this.story, this.paragraphs));
  }
}

export function inspectParagraphBorders(paragraphs: Paragraph[]): TableBorderFlags {
  if (!paragraphs.length) {
    return emptyFlags();
  }
  const first = paragraphs[0];
  const last = paragraphs[paragraphs.length - 1];
  const top = isVisibleBorder(first.attrs.borderTop);
  const bottom = isVisibleBorder(last.attrs.borderBottom);
  const left = paragraphs.every((p) => isVisibleBorder(p.attrs.borderLeft));
  const right = paragraphs.every((p) => isVisibleBorder(p.attrs.borderRight));
  const hasInner = paragraphs.length > 1;
  const insideH =
    hasInner &&
    paragraphs.slice(0, -1).every((p, idx) => isVisibleBorder(p.attrs.borderBetween) || isVisibleBorder(p.attrs.borderBottom) || isVisibleBorder(paragraphs[idx + 1].attrs.borderTop));
  return {
    top,
    bottom,
    left,
    right,
    outside: top && bottom && left && right,
    inside: insideH,
    insideH,
    insideV: false,
    all: top && bottom && left && right && (!hasInner || insideH),
    tl2br: false,
    tr2bl: false,
  };
}

function applyParagraphBorders(paragraphs: Paragraph[], mode: TableBorderMode, pen: TableBorderPen): void {
  if (!paragraphs.length) {
    return;
  }
  const flags = inspectParagraphBorders(paragraphs);
  const border: ParagraphBorder = {
    val: pen.type || "single",
    sz: pen.size || "8",
    color: (pen.color || "000000").replace(/^#/, "").toUpperCase(),
    space: "4",
  };

  if (mode === "none") {
    for (const p of paragraphs) {
      for (const key of ALL_KEYS) {
        delete p.attrs[key];
      }
      p.changed = true;
    }
    return;
  }

  if (mode === "top" || mode === "bottom" || mode === "left" || mode === "right") {
    const key = sideKey(mode);
    const toggleOff = flags[mode] && sameParagraphPen(paragraphs, mode, pen);
    if (mode === "top") {
      setBorder(paragraphs[0], "borderTop", toggleOff ? undefined : border);
    } else if (mode === "bottom") {
      setBorder(paragraphs[paragraphs.length - 1], "borderBottom", toggleOff ? undefined : border);
    } else {
      for (const p of paragraphs) {
        setBorder(p, key, toggleOff ? undefined : border);
      }
    }
    return;
  }

  if (mode === "outside" || mode === "all") {
    setBorder(paragraphs[0], "borderTop", border);
    setBorder(paragraphs[paragraphs.length - 1], "borderBottom", border);
    for (let i = 0; i < paragraphs.length; i += 1) {
      const p = paragraphs[i];
      setBorder(p, "borderLeft", border);
      setBorder(p, "borderRight", border);
      if (mode === "all" && i < paragraphs.length - 1) {
        setBorder(p, "borderBetween", border);
      } else {
        setBorder(p, "borderBetween", undefined);
      }
    }
    return;
  }

  if (mode === "inside" || mode === "insideH") {
    for (let i = 0; i < paragraphs.length - 1; i += 1) {
      setBorder(paragraphs[i], "borderBetween", border);
    }
  }
}

function sameParagraphPen(
  paragraphs: Paragraph[],
  side: "top" | "bottom" | "left" | "right",
  pen: TableBorderPen,
): boolean {
  const color = (pen.color || "000000").replace(/^#/, "").toUpperCase();
  const sz = pen.size || "8";
  const check = (b: ParagraphBorder | undefined) =>
    isVisibleBorder(b) && (b?.sz ?? "8") === sz && (b?.color ?? "000000").replace(/^#/, "").toUpperCase() === color;
  if (side === "top") {
    return check(paragraphs[0].attrs.borderTop);
  }
  if (side === "bottom") {
    return check(paragraphs[paragraphs.length - 1].attrs.borderBottom);
  }
  const key = sideKey(side);
  return paragraphs.every((p) => check(p.attrs[key]));
}

function setBorder(paragraph: Paragraph, key: ParaBorderKey, border: ParagraphBorder | undefined): void {
  if (border) {
    paragraph.attrs[key] = { ...border };
  } else {
    delete paragraph.attrs[key];
  }
  paragraph.changed = true;
}

function sideKey(side: "top" | "bottom" | "left" | "right"): ParaBorderKey {
  switch (side) {
    case "top":
      return "borderTop";
    case "bottom":
      return "borderBottom";
    case "left":
      return "borderLeft";
    case "right":
      return "borderRight";
  }
}

function isVisibleBorder(border: ParagraphBorder | undefined): boolean {
  return !!border && border.val !== "nil" && border.val !== "none";
}

function takeSnaps(paragraphs: Paragraph[]): ParaBorderSnap[] {
  return paragraphs.map((paragraph) => ({
    paragraph,
    borders: {
      borderTop: paragraph.attrs.borderTop ? { ...paragraph.attrs.borderTop } : undefined,
      borderBottom: paragraph.attrs.borderBottom ? { ...paragraph.attrs.borderBottom } : undefined,
      borderLeft: paragraph.attrs.borderLeft ? { ...paragraph.attrs.borderLeft } : undefined,
      borderRight: paragraph.attrs.borderRight ? { ...paragraph.attrs.borderRight } : undefined,
      borderBetween: paragraph.attrs.borderBetween ? { ...paragraph.attrs.borderBetween } : undefined,
    },
  }));
}

function restoreSnaps(snaps: ParaBorderSnap[]): void {
  for (const snap of snaps) {
    for (const key of ALL_KEYS) {
      const value = snap.borders[key];
      if (value) {
        snap.paragraph.attrs[key] = { ...value };
      } else {
        delete snap.paragraph.attrs[key];
      }
    }
    snap.paragraph.changed = true;
  }
}

function emptyFlags(): TableBorderFlags {
  return {
    top: false,
    bottom: false,
    left: false,
    right: false,
    outside: false,
    inside: false,
    insideH: false,
    insideV: false,
    all: false,
    tl2br: false,
    tr2bl: false,
  };
}
