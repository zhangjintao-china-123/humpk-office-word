import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import type { Table } from "../model/table/Table";
import { Word } from "../model/inline/Word";
import type { LinkedNode } from "../model/list/LinkedList";
import { CaretPos } from "../selection/CaretPos";
import type { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import { mergeRunStyle, type RunStyle } from "../model/style/RunStyle";
import { EditImpact, type EditStructure } from "./EditImpact";
import type { MutationPatch, RemovedParagraph, RemovedWord } from "./MutationPatch";

export class Mutator {
  insert(document: Document, story: StoryRef, pos: CaretPos, text: string, runStyle?: RunStyle): MutationPatch {
    const original = pos;
    const caret = this.prepare(document, story, pos);
    if (!caret.node || caret.node.data.kind === "table" || caret.node.data.kind === "page") {
      return this.emptyPatch(story, original);
    }
    if (caret.node.data.paragraph?.isTable) {
      return this.emptyPatch(story, original);
    }

    const inserted: LinkedNode<Word>[] = [];
    const created: MutationPatch["createdParagraphs"] = [];
    const dirty = new Set<Paragraph>();
    let structure: EditStructure = "none";
    let current = caret;

    for (const char of text) {
      if (char === "\n") {
        const split = this.insertEnter(document, story, current);
        inserted.push(...split.inserted);
        created.push(...split.created);
        for (const paragraph of split.dirty) {
          dirty.add(paragraph);
        }
        structure = "split";
        current = split.caret;
        continue;
      }
      const node = this.insertChar(document, current, char, runStyle);
      if (!node) {
        continue;
      }
      inserted.push(node);
      if (node.data.paragraph) {
        dirty.add(node.data.paragraph);
      }
      current = new CaretPos(story, node, true);
    }

    this.syncAll(document, dirty);
    return {
      story,
      impact: this.impact(story, dirty, structure),
      caret: current,
      originalCaret: original,
      inserted,
      removed: [],
      createdParagraphs: created,
      removedParagraphs: [],
    };
  }

  deleteRange(document: Document, story: StoryRef, range: SelRange): MutationPatch {
    const normalized = range.normalized();
    if (normalized.collapsed()) {
      return this.emptyPatch(story, normalized.end);
    }
    const nodes = this.nodesIn(normalized);
    return this.removeNodes(document, story, normalized.start, nodes);
  }

  deleteBackward(document: Document, story: StoryRef, pos: CaretPos): MutationPatch {
    const target = pos.after ? pos.node : pos.node?.pre ?? null;
    if (!target) {
      return this.emptyPatch(story, pos);
    }
    if (target.data.isEnterChar() && !this.nextParagraph(target.data.paragraph)) {
      return this.emptyPatch(story, pos);
    }
    return this.removeNodes(document, story, pos, [target]);
  }

  deleteForward(document: Document, story: StoryRef, pos: CaretPos): MutationPatch {
    let target: LinkedNode<Word> | null = null;
    if (pos.node && !pos.after && !pos.node.data.isEnterChar()) {
      target = pos.node;
    } else if (pos.after) {
      target = pos.node?.next ?? null;
    } else if (pos.node?.data.isEnterChar()) {
      target = pos.node;
    }
    if (!target) {
      return this.emptyPatch(story, pos);
    }
    if (target.data.isEnterChar() && !this.nextParagraph(target.data.paragraph)) {
      return this.emptyPatch(story, pos);
    }
    return this.removeNodes(document, story, pos, [target]);
  }

  invert(document: Document, patch: MutationPatch): EditImpact {
    if (patch.inserted.length) {
      for (const node of [...patch.inserted].reverse()) {
        if (this.inList(document, node)) {
          document.words.removeNode(node);
        }
      }
      for (const created of [...patch.createdParagraphs].reverse()) {
        if (created.paragraph.isTable) {
          document.removeParagraph(created.paragraph);
          continue;
        }
        this.absorbParagraph(document, created.paragraph);
      }
    }

    if (patch.removed.length) {
      for (const item of [...patch.removed].reverse()) {
        this.restoreWord(document, item);
      }
      for (const item of [...patch.removedParagraphs].reverse()) {
        this.restoreParagraph(document, item);
      }
    }

    const dirty = new Set(patch.impact.dirty);
    this.syncAll(document, dirty);
    return this.impact(patch.story, dirty, "none");
  }

  replay(document: Document, patch: MutationPatch): EditImpact {
    if (patch.inserted.length) {
      let pos = patch.originalCaret;
      for (const node of patch.inserted) {
        if (this.inList(document, node)) {
          continue;
        }
        if (pos.after && pos.node && this.inList(document, pos.node)) {
          document.words.insertNodeAfter(pos.node, node);
        } else if (pos.node && this.inList(document, pos.node)) {
          document.words.insertNodeBefore(pos.node, node);
        } else {
          document.words.appendNode(node);
        }
        pos = new CaretPos(patch.story, node, true);
      }
      for (const created of patch.createdParagraphs) {
        if (!created.paragraph.node) {
          if (created.after) {
            document.insertParagraphAfter(created.after, created.paragraph);
          } else if (document.paragraphs.head) {
            document.insertParagraphBefore(document.paragraphs.head.data, created.paragraph);
          } else {
            document.addParagraph(created.paragraph);
          }
        }
        for (const node of created.nodes) {
          node.data.paragraph = created.paragraph;
        }
      }
    }
    if (patch.removed.length) {
      for (const item of [...patch.removed].reverse()) {
        if (this.inList(document, item.node)) {
          document.words.removeNode(item.node);
        }
      }
      for (const item of patch.removedParagraphs) {
        this.absorbParagraph(document, item.paragraph, item.after ?? undefined);
      }
    }
    const dirty = new Set(patch.impact.dirty);
    this.syncAll(document, dirty);
    return patch.impact;
  }

  private removeNodes(
    document: Document,
    story: StoryRef,
    original: CaretPos,
    nodes: LinkedNode<Word>[],
  ): MutationPatch {
    const removed: RemovedWord[] = [];
    const removedParas: RemovedParagraph[] = [];
    const dirty = new Set<Paragraph>();
    let structure: EditStructure = "none";
    let caret = original;

    for (const node of nodes) {
      const paragraph = node.data.paragraph;
      if (paragraph) {
        dirty.add(paragraph);
      }
      removed.push({ node, prev: node.pre, next: node.next });
      const { nodeNext } = document.words.removeNode(node);
      caret = new CaretPos(story, nodeNext, false);
      if (node.data.isEnterChar() && paragraph) {
        const next = this.nextParagraph(paragraph);
        if (next) {
          removedParas.push({ paragraph: next, after: paragraph });
          this.absorbParagraph(document, next, paragraph);
          dirty.add(paragraph);
          dirty.delete(next);
          structure = "merge";
          caret = new CaretPos(story, nodeNext, false);
        }
      }
    }

    this.syncAll(document, dirty);
    return {
      story,
      impact: this.impact(story, dirty, structure),
      caret,
      originalCaret: original,
      inserted: [],
      removed,
      createdParagraphs: [],
      removedParagraphs: removedParas,
    };
  }

  applyRunStyle(document: Document, range: SelRange, patch: Partial<RunStyle>): { node: LinkedNode<Word>; block: Block | null }[] {
    const nodes = this.nodesIn(range.normalized());
    const dirty = new Set<Paragraph>();
    const snapshots: { node: LinkedNode<Word>; block: Block | null }[] = [];
    let lastKey = "";
    let lastBlock: Block | null = null;
    for (const node of nodes) {
      if (node.data.kind !== "text" || node.data.isEnterChar()) {
        continue;
      }
      snapshots.push({ node, block: node.data.block });
      const next = mergeRunStyle(node.data.block?.style, patch);
      const key = JSON.stringify(next);
      if (key !== lastKey || !lastBlock) {
        lastBlock = new Block();
        lastBlock.style = next;
        lastBlock.charType = node.data.block?.charType;
        lastKey = key;
      }
      node.data.block = lastBlock;
      if (node.data.paragraph) {
        dirty.add(node.data.paragraph);
      }
    }
    this.syncAll(document, dirty);
    return snapshots;
  }

  applyParagraphAttrs(
    document: Document,
    range: SelRange,
    patch: Partial<ParagraphAttrs>,
  ): { paragraph: Paragraph; attrs: Paragraph["attrs"] }[] {
    const paragraphs = this.paragraphsIn(range);
    const snapshots = paragraphs.map((paragraph) => ({ paragraph, attrs: { ...paragraph.attrs } }));
    for (const paragraph of paragraphs) {
      paragraph.attrs = { ...paragraph.attrs, ...patch };
      paragraph.changed = true;
    }
    this.syncAll(document, paragraphs);
    return snapshots;
  }

  restoreRunStyle(document: Document, snapshots: { node: LinkedNode<Word>; block: Block | null }[]): Paragraph[] {
    const dirty = new Set<Paragraph>();
    for (const item of snapshots) {
      item.node.data.block = item.block;
      if (item.node.data.paragraph) {
        dirty.add(item.node.data.paragraph);
      }
    }
    this.syncAll(document, dirty);
    return [...dirty];
  }

  restoreParagraphAttrs(snapshots: { paragraph: Paragraph; attrs: Paragraph["attrs"] }[]): Paragraph[] {
    for (const item of snapshots) {
      item.paragraph.attrs = item.attrs;
      item.paragraph.changed = true;
    }
    return snapshots.map((item) => item.paragraph);
  }

  private insertChar(document: Document, pos: CaretPos, char: string, runStyle?: RunStyle): LinkedNode<Word> | null {
    const paragraph = pos.node?.data.paragraph;
    if (!paragraph || paragraph.isTable) {
      return null;
    }
    const inherited = this.inheritBlock(pos, paragraph);
    const block = this.blockWithStyle(inherited, runStyle);
    const word = this.createText(char, block, paragraph);
    paragraph.changed = true;
    if (pos.after && pos.node) {
      return document.words.insertAfter(pos.node, word);
    }
    if (pos.node) {
      return document.words.insertBefore(pos.node, word);
    }
    return document.words.append(word);
  }

  private insertEnter(
    document: Document,
    story: StoryRef,
    pos: CaretPos,
  ): {
    inserted: LinkedNode<Word>[];
    created: MutationPatch["createdParagraphs"];
    dirty: Paragraph[];
    caret: CaretPos;
  } {
    const paragraph = pos.node?.data.paragraph;
    if (!paragraph || paragraph.isTable) {
      return { inserted: [], created: [], dirty: [], caret: pos };
    }
    const enter = this.createText("\n", this.inheritBlock(pos, paragraph), paragraph);
    const enterNode = pos.after && pos.node
      ? document.words.insertAfter(pos.node, enter)
      : pos.node
        ? document.words.insertBefore(pos.node, enter)
        : document.words.append(enter);

    const moved: LinkedNode<Word>[] = [];
    let current = enterNode.next;
    while (current && current.data.paragraph === paragraph) {
      moved.push(current);
      current = current.next;
    }

    const created = new Paragraph(document.nextParagraphId());
    created.changed = true;
    created.attrs = { ...paragraph.attrs };
    created.inheritedRunStyle = paragraph.inheritedRunStyle
      ? { ...paragraph.inheritedRunStyle }
      : undefined;
    created.addBlock(this.seedBlock(pos, paragraph));
    document.insertParagraphAfter(paragraph, created);
    for (const node of moved) {
      node.data.paragraph = created;
    }
    this.cloneBlocks(moved);
    paragraph.changed = true;

    const caretNode = moved[0] ?? enterNode;
    return {
      inserted: [enterNode],
      created: [{ paragraph: created, after: paragraph, nodes: moved }],
      dirty: [paragraph, created],
      caret: new CaretPos(story, caretNode, false),
    };
  }

  insertTable(document: Document, story: StoryRef, pos: CaretPos, table: Table): MutationPatch {
    const original = pos;
    const tablePara = new Paragraph(document.nextParagraphId());
    tablePara.isTable = true;
    tablePara.table = table;
    tablePara.changed = true;

    const word = new Word();
    word.kind = "table";
    word.table = table;
    word.paragraph = tablePara;

    const after = this.paragraphBeforeTable(document, pos);
    if (after) {
      document.insertParagraphAfter(after, tablePara);
    } else if (document.paragraphs.head) {
      document.insertParagraphBefore(document.paragraphs.head.data, tablePara);
    } else {
      document.addParagraph(tablePara);
    }

    const afterWord = after ? this.lastWordOf(document, after) : null;
    const tableNode = afterWord
      ? document.words.insertAfter(afterWord, word)
      : document.words.head
        ? document.words.insertBefore(document.words.head, word)
        : document.words.append(word);

    const created: MutationPatch["createdParagraphs"] = [
      { paragraph: tablePara, after, nodes: [tableNode] },
    ];
    const inserted = [tableNode];
    const dirty = new Set<Paragraph>([tablePara]);
    let caret = new CaretPos(story, tableNode, true);

    const next = tablePara.getNextParagraph();
    if (!next || next.isTable) {
      const empty = new Paragraph(document.nextParagraphId());
      empty.changed = true;
      empty.addBlock(new Block());
      document.insertParagraphAfter(tablePara, empty);
      const enter = this.createText("\n", empty.blocks[0], empty);
      const enterNode = document.words.insertAfter(tableNode, enter);
      created.push({ paragraph: empty, after: tablePara, nodes: [enterNode] });
      inserted.push(enterNode);
      dirty.add(empty);
      caret = new CaretPos(story, enterNode, false);
    } else {
      const first = this.firstWordOf(document, next);
      if (first) {
        caret = new CaretPos(story, first, false);
      }
    }

    return {
      story,
      impact: this.impact(story, dirty, "split"),
      caret,
      originalCaret: original,
      inserted,
      removed: [],
      createdParagraphs: created,
      removedParagraphs: [],
    };
  }

  private paragraphBeforeTable(document: Document, pos: CaretPos): Paragraph | null {
    const paragraph = pos.node?.data.paragraph;
    if (!paragraph) {
      return document.paragraphs.tail?.data ?? null;
    }
    if (paragraph.isTable) {
      return paragraph;
    }
    const first = this.firstWordOf(document, paragraph);
    if (first && pos.node === first && !pos.after) {
      return paragraph.getPreParagraph() ?? null;
    }
    return paragraph;
  }

  private firstWordOf(document: Document, paragraph: Paragraph): LinkedNode<Word> | null {
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph) {
        return node;
      }
      node = node.next;
    }
    return null;
  }

  private lastWordOf(document: Document, paragraph: Paragraph): LinkedNode<Word> | null {
    let last: LinkedNode<Word> | null = null;
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph) {
        last = node;
      }
      node = node.next;
    }
    return last;
  }

  private absorbParagraph(document: Document, from: Paragraph, into?: Paragraph): void {
    const target = into ?? from.getPreParagraph();
    if (!target || target.isTable) {
      document.removeParagraph(from);
      return;
    }
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === from) {
        node.data.paragraph = target;
      }
      node = node.next;
    }
    document.removeParagraph(from);
    target.changed = true;
  }

  private restoreWord(document: Document, item: RemovedWord): void {
    if (this.inList(document, item.node)) {
      return;
    }
    if (item.prev && this.inList(document, item.prev)) {
      document.words.insertNodeAfter(item.prev, item.node);
      return;
    }
    if (item.next && this.inList(document, item.next)) {
      document.words.insertNodeBefore(item.next, item.node);
      return;
    }
    document.words.appendNode(item.node);
  }

  private restoreParagraph(document: Document, item: RemovedParagraph): void {
    if (item.paragraph.node) {
      return;
    }
    if (item.after) {
      document.insertParagraphAfter(item.after, item.paragraph);
    } else {
      document.addParagraph(item.paragraph);
    }
    let node = document.words.head;
    let seenEnter = false;
    while (node) {
      if (node.data.paragraph === item.after && node.data.isEnterChar()) {
        seenEnter = true;
        node = node.next;
        continue;
      }
      if (seenEnter && item.after && node.data.paragraph === item.after) {
        node.data.paragraph = item.paragraph;
      }
      node = node.next;
    }
    item.paragraph.changed = true;
  }

  private prepare(document: Document, story: StoryRef, pos: CaretPos): CaretPos {
    if (document.words.length > 0 && pos.node) {
      return pos;
    }
    if (document.paragraphs.length === 0) {
      const paragraph = new Paragraph(1);
      paragraph.addBlock(new Block());
      document.addParagraph(paragraph);
    }
    if (document.words.length === 0) {
      const paragraph = document.paragraphs.head!.data;
      const enter = this.createText("\n", paragraph.blocks[0] ?? new Block(), paragraph);
      if (!paragraph.blocks.length) {
        paragraph.addBlock(enter.block!);
      }
      const node = document.words.append(enter);
      return new CaretPos(story, node, false);
    }
    return pos.node ? pos : new CaretPos(story, document.words.head, false);
  }

  private blockWithStyle(inherited: Block, runStyle?: RunStyle): Block {
    if (!runStyle || !this.hasRunStyle(runStyle)) {
      return inherited;
    }
    const style = mergeRunStyle(inherited.style, runStyle);
    const block = new Block();
    block.style = style;
    block.charType = inherited.charType;
    return block;
  }

  private inheritBlock(pos: CaretPos, paragraph: Paragraph): Block {
    const neighbor = pos.node?.data.block ?? pos.node?.pre?.data.block ?? paragraph.blocks.at(-1);
    if (neighbor) {
      return neighbor;
    }
    const block = this.seedBlock(pos, paragraph);
    paragraph.addBlock(block);
    return block;
  }

  private seedBlock(pos: CaretPos, paragraph: Paragraph): Block {
    const neighbor = pos.node?.data.block ?? pos.node?.pre?.data.block ?? paragraph.blocks.at(-1);
    const block = new Block();
    block.style = this.styleFrom(paragraph, neighbor);
    block.charType = neighbor?.charType;
    return block;
  }

  private styleFrom(paragraph: Paragraph, block?: Block | null): RunStyle {
    return mergeRunStyle(paragraph.inheritedRunStyle, block?.style);
  }

  private createText(char: string, block: Block, paragraph: Paragraph): Word {
    const word = new Word();
    word.char = char;
    word.intChar = char.charCodeAt(0);
    word.block = block;
    word.paragraph = paragraph;
    return word;
  }

  private cloneBlocks(nodes: LinkedNode<Word>[]): void {
    const clones = new Map<Block, Block>();
    for (const node of nodes) {
      const block = node.data.block;
      if (!block || node.data.kind !== "text") {
        continue;
      }
      let clone = clones.get(block);
      if (!clone) {
        clone = new Block();
        clone.style = { ...block.style };
        clone.drawing = block.drawing;
        clone.charType = block.charType;
        clones.set(block, clone);
      }
      node.data.block = clone;
    }
  }

  private syncAll(document: Document, dirty: Iterable<Paragraph>): void {
    for (const paragraph of dirty) {
      this.syncBlocks(document, paragraph);
    }
  }

  private syncBlocks(document: Document, paragraph: Paragraph): void {
    const nodes = this.nodesOf(document, paragraph);
    if (!nodes.length && !paragraph.node) {
      return;
    }
    const order: Block[] = [];
    const texts = new Map<Block, string>();
    for (const node of nodes) {
      const word = node.data;
      if (word.kind !== "text" || word.isEnterChar()) {
        continue;
      }
      if (!word.block) {
        word.block = order.at(-1) ?? new Block();
      }
      if (!texts.has(word.block)) {
        texts.set(word.block, "");
        order.push(word.block);
      }
      texts.set(word.block, `${texts.get(word.block)}${word.char}`);
    }
    for (const block of order) {
      block.text = texts.get(block) ?? "";
    }
    if (!order.length) {
      const empty = paragraph.blocks[0] ?? new Block();
      if (!this.hasRunStyle(empty.style)) {
        const styled = nodes.find((node) => node.data.block)?.data.block;
        empty.style = this.styleFrom(paragraph, styled);
      }
      empty.text = "";
      paragraph.blocks = [empty];
    } else {
      paragraph.blocks = order;
    }
    const enter = nodes.find((node) => node.data.isEnterChar());
    if (enter) {
      enter.data.block = paragraph.blocks.at(-1) ?? null;
    }
  }

  private nodesOf(document: Document, paragraph: Paragraph): LinkedNode<Word>[] {
    const nodes: LinkedNode<Word>[] = [];
    let node = document.words.head;
    while (node) {
      if (node.data.paragraph === paragraph) {
        nodes.push(node);
      }
      node = node.next;
    }
    return nodes;
  }

  private paragraphsIn(range: SelRange): Paragraph[] {
    const normalized = range.normalized();
    if (normalized.collapsed()) {
      const paragraph = normalized.start.node?.data.paragraph;
      return paragraph && !paragraph.isTable ? [paragraph] : [];
    }
    const unique: Paragraph[] = [];
    for (const node of this.nodesIn(normalized)) {
      const paragraph = node.data.paragraph;
      if (paragraph && !paragraph.isTable && !unique.includes(paragraph)) {
        unique.push(paragraph);
      }
    }
    return unique;
  }

  private nodesIn(range: SelRange): LinkedNode<Word>[] {
    const from = range.start.after ? (range.start.node?.next ?? null) : range.start.node;
    const to = range.end.after ? range.end.node : (range.end.node?.pre ?? null);
    const nodes: LinkedNode<Word>[] = [];
    let node = from;
    while (node) {
      nodes.push(node);
      if (node === to) {
        break;
      }
      node = node.next;
    }
    return nodes;
  }

  private nextParagraph(paragraph: Paragraph | null | undefined): Paragraph | undefined {
    return paragraph?.getNextParagraph();
  }

  private inList(document: Document, node: LinkedNode<Word>): boolean {
    let current = document.words.head;
    while (current) {
      if (current === node) {
        return true;
      }
      current = current.next;
    }
    return false;
  }

  private impact(story: StoryRef, dirty: Iterable<Paragraph>, structure: EditStructure): EditImpact {
    const unique: Paragraph[] = [];
    for (const paragraph of dirty) {
      if (!unique.includes(paragraph)) {
        unique.push(paragraph);
      }
    }
    return new EditImpact(story, unique, structure);
  }

  private hasRunStyle(style: RunStyle): boolean {
    return Object.keys(style).length > 0;
  }

  private emptyPatch(story: StoryRef, caret: CaretPos): MutationPatch {
    return {
      story,
      impact: new EditImpact(story, []),
      caret,
      originalCaret: caret,
      inserted: [],
      removed: [],
      createdParagraphs: [],
      removedParagraphs: [],
    };
  }
}
