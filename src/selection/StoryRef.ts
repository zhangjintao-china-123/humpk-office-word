import type { HeaderFooterType } from "../model/document/DocumentKind";
import type { TableCell } from "../model/table/Table";

export type StoryRef =
  | { slot: "body" }
  | { slot: "header"; kind?: HeaderFooterType; sectionIndex?: number }
  | { slot: "footer"; kind?: HeaderFooterType; sectionIndex?: number }
  | { slot: "cell"; cell: TableCell };

export function storyKind(story: StoryRef): HeaderFooterType {
  if (story.slot === "header" || story.slot === "footer") {
    return story.kind ?? "default";
  }
  return "default";
}

export function storySection(story: StoryRef): number {
  if (story.slot === "header" || story.slot === "footer") {
    return story.sectionIndex ?? 0;
  }
  return 0;
}

export function storyEquals(a: StoryRef, b: StoryRef): boolean {
  if (a.slot !== b.slot) {
    return false;
  }
  if (a.slot === "cell" && b.slot === "cell") {
    return a.cell === b.cell;
  }
  if ((a.slot === "header" || a.slot === "footer") && (b.slot === "header" || b.slot === "footer")) {
    return storyKind(a) === storyKind(b) && storySection(a) === storySection(b);
  }
  return true;
}
