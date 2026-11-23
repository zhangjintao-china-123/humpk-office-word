import type { Document } from "../model/document/Document";
import type { LinkedNode } from "../model/list/LinkedList";
import type { Word } from "../model/inline/Word";
import { CaretPos } from "../selection/CaretPos";
import { storyEquals, type StoryRef } from "../selection/StoryRef";

export interface FindQuery {
  text: string;
  matchCase: boolean;
}

export interface FindStatus {
  index: number;
  total: number;
  replaced?: number;
}

export interface FindHit {
  story: StoryRef;
  start: LinkedNode<Word>;
  end: LinkedNode<Word>;
}

export interface StorySource {
  story: StoryRef;
  document: Document;
}

/** 正文、页眉页脚，以及它们里面的单元格和文本框。 */
export function collectStories(roots: StorySource[]): StorySource[] {
  const items: StorySource[] = [];
  const visit = (document: Document, story: StoryRef): void => {
    items.push({ story, document });
    document.paragraphs.each((node) => {
      for (const block of node.data.blocks) {
        const inner = block.drawing?.shape?.text;
        if (inner) {
          visit(inner, { slot: "textbox", block });
        }
      }
      const table = node.data.table;
      if (!table) {
        return;
      }
      for (const row of table.rows) {
        for (const cell of row.cells) {
          visit(cell.document, { slot: "cell", cell });
        }
      }
    });
  };
  for (const root of roots) {
    visit(root.document, root.story);
  }
  return items;
}

export function findInStories(stories: StorySource[], query: FindQuery): FindHit[] {
  const hits: FindHit[] = [];
  for (const entry of stories) {
    hits.push(...findInStory(entry.document, entry.story, query));
  }
  return hits;
}

export function findInStory(document: Document, story: StoryRef, query: FindQuery): FindHit[] {
  const needle = [...query.text];
  if (!needle.length) {
    return [];
  }
  const hits: FindHit[] = [];
  let run: LinkedNode<Word>[] = [];
  const flush = (): void => {
    if (run.length >= needle.length) {
      hits.push(...matchRun(run, needle, query.matchCase, story));
    }
    run = [];
  };
  let node = document.words.head;
  while (node) {
    const word = node.data;
    if (word.kind === "text" && !word.isEnterChar() && word.char) {
      run.push(node);
    } else {
      flush();
    }
    node = node.next;
  }
  flush();
  return hits;
}

/** 光标所在处或之后的第一处。到末尾后回到开头。 */
export function indexAtOrAfter(hits: FindHit[], caret: CaretPos | undefined, stories: StoryRef[]): number {
  if (!hits.length) {
    return -1;
  }
  if (!caret?.node) {
    return 0;
  }
  const caretStory = storyIndex(stories, caret.story);
  for (let i = 0; i < hits.length; i += 1) {
    const hitStory = storyIndex(stories, hits[i].story);
    if (hitStory > caretStory) {
      return i;
    }
    if (hitStory < caretStory) {
      continue;
    }
    const start = new CaretPos(hits[i].story, hits[i].start, false);
    if (start.compare(caret) >= 0) {
      return i;
    }
  }
  return 0;
}

/** 光标之前的最后一处。到开头后回到末尾。 */
export function indexBefore(hits: FindHit[], caret: CaretPos | undefined, stories: StoryRef[]): number {
  if (!hits.length) {
    return -1;
  }
  if (!caret?.node) {
    return hits.length - 1;
  }
  const caretStory = storyIndex(stories, caret.story);
  let found = -1;
  for (let i = 0; i < hits.length; i += 1) {
    const hitStory = storyIndex(stories, hits[i].story);
    if (hitStory > caretStory) {
      break;
    }
    if (hitStory < caretStory) {
      found = i;
      continue;
    }
    const end = new CaretPos(hits[i].story, hits[i].end, true);
    if (end.compare(caret) < 0) {
      found = i;
    }
  }
  return found >= 0 ? found : hits.length - 1;
}

function matchRun(run: LinkedNode<Word>[], needle: string[], matchCase: boolean, story: StoryRef): FindHit[] {
  const hits: FindHit[] = [];
  for (let i = 0; i <= run.length - needle.length; ) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (!sameChar(run[i + j].data.char, needle[j], matchCase)) {
        matched = false;
        break;
      }
    }
    if (!matched) {
      i += 1;
      continue;
    }
    hits.push({ story, start: run[i], end: run[i + needle.length - 1] });
    i += needle.length;
  }
  return hits;
}

function sameChar(left: string, right: string, matchCase: boolean): boolean {
  return matchCase ? left === right : left.toLowerCase() === right.toLowerCase();
}

function storyIndex(stories: StoryRef[], story: StoryRef): number {
  const index = stories.findIndex((item) => storyEquals(item, story));
  return index < 0 ? stories.length : index;
}
