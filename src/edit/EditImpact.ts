import type { Paragraph } from "../model/block/Paragraph";
import type { StoryRef } from "../selection/StoryRef";

export type EditStructure = "none" | "split" | "merge";

export class EditImpact {
  constructor(
    readonly story: StoryRef,
    readonly dirty: Paragraph[],
    readonly structure: EditStructure = "none",
    readonly hostTable?: Paragraph,
  ) {}
}
