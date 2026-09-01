import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { storyEquals, type StoryRef } from "./StoryRef";

export class CaretPos {
  constructor(
    readonly story: StoryRef,
    readonly node: LinkedNode<Word> | null,
    readonly after = false,
  ) {}

  equals(other: CaretPos): boolean {
    return storyEquals(this.story, other.story) && this.node === other.node && this.after === other.after;
  }

  compare(other: CaretPos): number {
    if (!storyEquals(this.story, other.story)) {
      return 0;
    }
    if (this.node === other.node) {
      return Number(this.after) - Number(other.after);
    }
    if (!this.node) {
      return -1;
    }
    if (!other.node) {
      return 1;
    }
    let current: LinkedNode<Word> | null = this.node.next;
    while (current) {
      if (current === other.node) {
        return -1;
      }
      current = current.next;
    }
    return 1;
  }
}
