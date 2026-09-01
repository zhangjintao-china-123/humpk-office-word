import type { CaretPos } from "./CaretPos";
import type { StoryRef } from "./StoryRef";

export type SelMode = "text" | "cell";

export class SelRange {
  constructor(
    readonly story: StoryRef,
    readonly start: CaretPos,
    readonly end: CaretPos,
    readonly mode: SelMode = "text",
  ) {}

  collapsed(): boolean {
    return this.mode === "text" && this.start.equals(this.end);
  }

  normalized(): SelRange {
    if (this.start.compare(this.end) <= 0) {
      return this;
    }
    return new SelRange(this.story, this.end, this.start, this.mode);
  }
}
