import type { Paragraph } from "../model/block/Paragraph";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import type { StoryRef } from "../selection/StoryRef";

export type EditStructure = "none" | "split" | "merge";

export class EditImpact {
  constructor(
    readonly story: StoryRef,
    readonly dirty: Paragraph[],
    readonly structure: EditStructure = "none",
    readonly hostTable?: Paragraph,
    /** 普通文本编辑前就存在的字流节点，撤销和重做时也可据此定位段落。 */
    readonly textAnchor?: LinkedNode<Word>,
  ) {}
}
