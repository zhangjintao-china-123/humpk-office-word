import type { LinkedNode } from "../model/list/LinkedList";
import type { Paragraph } from "../model/block/Paragraph";
import type { Word } from "../model/inline/Word";
import type { CaretPos } from "../selection/CaretPos";
import type { StoryRef } from "../selection/StoryRef";
import type { EditImpact } from "./EditImpact";

export interface RemovedWord {
  node: LinkedNode<Word>;
  prev: LinkedNode<Word> | null;
  next: LinkedNode<Word> | null;
}

export interface RemovedParagraph {
  paragraph: Paragraph;
  after: Paragraph | null;
}

export interface CreatedParagraph {
  paragraph: Paragraph;
  after: Paragraph | null;
  nodes: LinkedNode<Word>[];
}

export interface MutationPatch {
  story: StoryRef;
  impact: EditImpact;
  caret: CaretPos;
  originalCaret: CaretPos;
  inserted: LinkedNode<Word>[];
  removed: RemovedWord[];
  createdParagraphs: CreatedParagraph[];
  removedParagraphs: RemovedParagraph[];
}
