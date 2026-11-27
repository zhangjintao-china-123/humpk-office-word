import type { CaretPos } from "../selection/CaretPos";
import type { Document } from "../model/document/Document";
import type { RunStyle } from "../model/style/RunStyle";
import type { RevisionMark } from "../model/review/Review";
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
  flowOwner?(pos: CaretPos): { document: Document; story: StoryRef } | null;
  afterEdit(impact: EditImpact): void;
  recordRevision?(kind: RevisionMark["kind"], pos?: CaretPos): RevisionMark | undefined;
  pendingRunStyle?(): RunStyle | undefined;
  setPendingRunStyle?(style: RunStyle | undefined): void;
}
