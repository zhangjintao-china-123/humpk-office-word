import type { Document } from "../model/document/Document";
import { collectStories } from "./Find";

export interface DocumentStats {
  words: number;
  characters: number;
  charactersWithSpaces: number;
  paragraphs: number;
}

function* paragraphTexts(document: Document): Generator<string> {
  for (const { document: story } of collectStories([{ document, story: { slot: "body" } }])) {
    for (let node = story.paragraphs.head; node; node = node.next) {
      const paragraph = node.data;
      if (paragraph.isTable) continue;
      yield paragraph.blocks
        .filter((block) => !block.commentRef && !block.footnoteId && !block.endnoteId && block.revision?.kind !== "del")
        .map((block) => block.text)
        .join("");
    }
  }
}

export function countCharacters(document: Document): number {
  let count = 0;
  for (const text of paragraphTexts(document)) {
    for (const char of text) if (/\S/u.test(char)) count += 1;
  }
  return count;
}

export function documentStats(document: Document): DocumentStats {
  const result = { words: 0, characters: 0, charactersWithSpaces: 0, paragraphs: 0 };
  for (const text of paragraphTexts(document)) {
    result.paragraphs += 1;
    for (const char of text) {
      if (/\S/u.test(char)) result.characters += 1;
      result.charactersWithSpaces += 1;
    }
    // 中文汉字逐字计数，拉丁字母、数字及带撇号的词按连续词计数。
    const words = text.replace(/\p{Script=Han}/gu, " $& ").match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’][\p{L}\p{N}\p{M}]+)*/gu);
    result.words += words?.length ?? 0;
  }
  return result;
}
