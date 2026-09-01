import type { Document } from "../model/document/Document";
import type { RunStyle } from "../model/style/RunStyle";
import type { Selection } from "../selection/Selection";
import type { StoryRef } from "../selection/StoryRef";
import type { EditImpact } from "./EditImpact";
import type { Mutator } from "./Mutator";
import type { Relayout } from "./Relayout";

export interface EditContext {
  mutator: Mutator;
  relayout: Relayout;
  selection: Selection;
  documentOf(story: StoryRef): Document | null;
  afterEdit(impact: EditImpact): void;
  pendingRunStyle?(): RunStyle | undefined;
  setPendingRunStyle?(style: RunStyle | undefined): void;
}
