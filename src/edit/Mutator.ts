import { Block } from "../model/block/Block";
import { Paragraph } from "../model/block/Paragraph";
import type { Document } from "../model/document/Document";
import type { Drawing } from "../model/inline/Drawing";
import type { AsianLayoutSpec } from "../model/inline/AsianLayout";
import type { EnclosedSpec } from "../model/inline/EnclosedChar";
import type { Table } from "../model/table/Table";
import { Word } from "../model/inline/Word";
import { paragraphStartWord } from "../model/flatten/WordStreamBuilder";
import type { LinkedNode } from "../model/list/LinkedList";
import { CaretPos } from "../selection/CaretPos";
import { SelRange } from "../selection/SelRange";
import type { StoryRef } from "../selection/StoryRef";
import type { ParagraphAttrs } from "../model/style/ParagraphAttrs";
import type { TextLink } from "../model/field/TextLink";
import { mergeRunStyle, type RunStyle } from "../model/style/RunStyle";
import { EditImpact, type EditStructure } from "./EditImpact";
import type { CreatedParagraph, MutationPatch, RemovedParagraph, RemovedWord } from "./MutationPatch";

export class Mutator {
  insert(document: Document, story: StoryRef, pos: CaretPos, text: string, runStyle?: RunStyle): MutationPatch {
    const original = pos;
    const caret = this.prepare(document, story, pos);
    if (!caret.node || caret.node.data.kind === "table" || caret.node.data.paragraph?.isTable) {
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

    const textAnchor = structure === "none" && inserted.length ? caret.node : undefined;
    this.syncAll(document, dirty, textAnchor);
    return {
      story,
      impact: this.impact(story, dirty, structure, textAnchor),
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
    this.syncAll(document, dirty, patch.impact.textAnchor);
    return this.impact(patch.story, dirty, "none", patch.impact.textAnchor);
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
    this.syncAll(document, dirty, patch.impact.textAnchor);
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
      if (node.data.isEnterChar() && paragraph?.coverTemplate && !paragraph.getNextParagraph()?.coverTemplate) {
        // 保留封面与正文的分界，避免正文文字并入封面后被一起删除。
        continue;
      }
      if (paragraph) {
        dirty.add(paragraph);
      }
      removed.push({ node, prev: node.pre, next: node.next });
      const { nodeNext } = document.words.removeNode(node);
      caret = new CaretPos(story, nodeNext, false);
      if (node.data.kind === "table" && paragraph?.isTable && !this.nodesOf(document, paragraph).length) {
        const neighbor = paragraph.getPreParagraph() ?? paragraph.getNextParagraph();
        removedParas.push({ paragraph, after: paragraph.getPreParagraph() ?? null });
        document.removeParagraph(paragraph);
        dirty.delete(paragraph);
        if (neighbor) {
          dirty.add(neighbor);
        } else if (document.paragraphs.head) {
          dirty.add(document.paragraphs.head.data);
        }
      }
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

    const created: CreatedParagraph[] = [];
    const inserted: LinkedNode<Word>[] = [];
    if (!document.paragraphs.head) {
      const empty = new Paragraph(document.nextParagraphId());
      empty.changed = true;
      empty.addBlock(new Block());
      document.addParagraph(empty);
      const enter = this.createText("\n", empty.blocks[0], empty);
      const enterNode = document.words.append(enter);
      created.push({ paragraph: empty, after: null, nodes: [enterNode] });
      inserted.push(enterNode);
      dirty.add(empty);
      caret = new CaretPos(story, enterNode, false);
    }

    this.syncAll(document, dirty);
    return {
      story,
      impact: this.impact(story, dirty, structure),
      caret,
      originalCaret: original,
      inserted,
      removed,
      createdParagraphs: created,
      removedParagraphs: removedParas,
    };
  }

  applyRunStyle(
    document: Document,
    range: SelRange,
    patch: Partial<RunStyle> | ((word: Word) => RunStyle | undefined),
  ): { node: LinkedNode<Word>; block: Block | null }[] {
    const nodes = this.nodesIn(range.normalized());
    const dirty = new Set<Paragraph>();
    const snapshots: { node: LinkedNode<Word>; block: Block | null }[] = [];
    let lastKey = "";
    let lastParagraph: Paragraph | null = null;
    let lastBlock: Block | null = null;
    for (const node of nodes) {
      const word = node.data;
      const emptyParagraph = word.isEnterChar() && node.pre?.data.paragraph !== word.paragraph;
      if (word.kind !== "text" || (word.isEnterChar() && !(typeof patch === "function" && emptyParagraph))) {
        lastBlock = null;
        continue;
      }
      const next = typeof patch === "function" ? patch(word) : mergeRunStyle(word.block?.style, patch);
      if (!next) {
        lastBlock = null;
        continue;
      }
      const source = word.block;
      snapshots.push({ node, block: source });
      const key = `${JSON.stringify(next)}|${linkKey(source)}|${reviewKey(source)}|${source?.field ?? ""}|${source?.fieldInstr ?? ""}|${JSON.stringify(source?.enclosed ?? null)}|${JSON.stringify(source?.asianLayout ?? null)}`;
      if (key !== lastKey || !lastBlock || word.paragraph !== lastParagraph) {
        lastBlock = copyRun(emptyParagraph ? null : source, next);
        lastKey = key;
        lastParagraph = word.paragraph;
      }
      word.block = lastBlock;
      if (word.paragraph) {
        dirty.add(word.paragraph);
      }
    }
    this.syncAll(document, dirty);
    return snapshots;
  }

  applyLink(document: Document, range: SelRange, link: TextLink | undefined): { node: LinkedNode<Word>; block: Block | null }[] {
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
      const style = linkStyle(node.data.block?.style, link);
      const key = `${JSON.stringify(style)}|${JSON.stringify(link ?? null)}|${node.data.block?.field ?? ""}`;
      if (key !== lastKey || !lastBlock) {
        lastBlock = copyRun(node.data.block, style);
        lastBlock.link = link ? { ...link } : undefined;
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

  applyComment(document: Document, range: SelRange, id: string): { node: LinkedNode<Word>; block: Block | null }[] {
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
      const ids = [...(node.data.block?.commentIds ?? [])];
      if (!ids.includes(id)) {
        ids.push(id);
      }
      const style = { ...node.data.block?.style };
      if (!style.backgroundColor) {
        style.backgroundColor = "#FFF2CC";
      }
      const key = `${ids.join(",")}|${JSON.stringify(style)}|${reviewKey(node.data.block)}`;
      if (key !== lastKey || !lastBlock) {
        lastBlock = copyRun(node.data.block, style);
        lastBlock.commentIds = ids;
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
    patch: Partial<ParagraphAttrs> | ((attrs: ParagraphAttrs) => Partial<ParagraphAttrs>),
  ): { paragraph: Paragraph; attrs: Paragraph["attrs"] }[] {
    const paragraphs = this.paragraphsIn(range);
    const snapshots = paragraphs.map((paragraph) => ({ paragraph, attrs: { ...paragraph.attrs } }));
    for (const paragraph of paragraphs) {
      const next = typeof patch === "function" ? patch(paragraph.attrs) : patch;
      paragraph.attrs = { ...paragraph.attrs, ...next };
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

  replaceWordChars(document: Document, updates: { node: LinkedNode<Word>; char: string }[]): Paragraph[] {
    const dirty = new Set<Paragraph>();
    for (const item of updates) {
      item.node.data.char = item.char;
      item.node.data.intChar = item.char.codePointAt(0) ?? item.char.charCodeAt(0);
      if (item.node.data.paragraph) {
        item.node.data.paragraph.changed = true;
        dirty.add(item.node.data.paragraph);
      }
    }
    this.syncAll(document, dirty);
    return [...dirty];
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
    created.coverTemplate = paragraph.coverTemplate;
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
    tablePara.coverTemplate = pos.node?.data.paragraph?.coverTemplate;
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
      empty.coverTemplate = tablePara.coverTemplate;
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
    if (from.isTable || !target || target.isTable) {
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
    if (item.paragraph.isTable) {
      if (item.after?.node) {
        document.insertParagraphAfter(item.after, item.paragraph);
      } else if (document.paragraphs.head) {
        document.insertParagraphBefore(document.paragraphs.head.data, item.paragraph);
      } else {
        document.addParagraph(item.paragraph);
      }
      item.paragraph.changed = true;
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

  insertDrawing(document: Document, story: StoryRef, pos: CaretPos, drawing: Drawing): MutationPatch {
    const original = pos;
    const caret = this.prepare(document, story, pos);
    const paragraph = caret.node?.data.paragraph;
    if (!caret.node || !paragraph || paragraph.isTable || caret.node.data.kind === "table") {
      return this.emptyPatch(story, original);
    }
    const block = new Block();
    block.drawing = drawing;
    const word = new Word();
    word.kind = "drawing";
    word.drawing = drawing;
    word.block = block;
    word.paragraph = paragraph;
    paragraph.changed = true;
    const node = caret.after
      ? document.words.insertAfter(caret.node, word)
      : document.words.insertBefore(caret.node, word);
    const after: LinkedNode<Word>[] = [];
    let current = node.next;
    while (current && current.data.paragraph === paragraph) {
      after.push(current);
      current = current.next;
    }
    this.cloneBlocks(after);
    const dirty = new Set<Paragraph>([paragraph]);
    this.syncAll(document, dirty);
    return {
      story,
      impact: this.impact(story, dirty, "split"),
      caret: new CaretPos(story, node, true),
      originalCaret: original,
      inserted: [node],
      removed: [],
      createdParagraphs: [],
      removedParagraphs: [],
    };
  }

  insertEnclosed(
    document: Document,
    story: StoryRef,
    pos: CaretPos,
    text: string,
    runStyle: RunStyle | undefined,
    enclosed: EnclosedSpec,
  ): MutationPatch {
    const original = pos;
    const caret = this.prepare(document, story, pos);
    const paragraph = caret.node?.data.paragraph;
    if (!caret.node || !paragraph || paragraph.isTable || caret.node.data.kind === "table" || !text) {
      return this.emptyPatch(story, original);
    }
    const inherited = this.inheritBlock(caret, paragraph);
    const block = this.blockWithStyle(isAtomicBlock(inherited) ? this.seedBlock(caret, paragraph) : inherited, runStyle);
    block.enclosed = { ...enclosed };
    block.text = text;
    const word = new Word();
    word.kind = "text";
    word.char = text;
    word.intChar = text.codePointAt(0) ?? text.charCodeAt(0);
    word.block = block;
    word.paragraph = paragraph;
    paragraph.changed = true;
    const node = caret.after
      ? document.words.insertAfter(caret.node, word)
      : document.words.insertBefore(caret.node, word);
    const after: LinkedNode<Word>[] = [];
    let current = node.next;
    while (current && current.data.paragraph === paragraph) {
      after.push(current);
      current = current.next;
    }
    this.cloneBlocks(after);
    const dirty = new Set<Paragraph>([paragraph]);
    this.syncAll(document, dirty);
    return {
      story,
      impact: this.impact(story, dirty, "none"),
      caret: new CaretPos(story, node, true),
      originalCaret: original,
      inserted: [node],
      removed: [],
      createdParagraphs: [],
      removedParagraphs: [],
    };
  }

  insertAsianLayout(
    document: Document,
    story: StoryRef,
    pos: CaretPos,
    text: string,
    runStyle: RunStyle | undefined,
    asianLayout: AsianLayoutSpec,
  ): MutationPatch {
    const original = pos;
    const caret = this.prepare(document, story, pos);
    const paragraph = caret.node?.data.paragraph;
    if (!caret.node || !paragraph || paragraph.isTable || caret.node.data.kind === "table" || !text) {
      return this.emptyPatch(story, original);
    }
    const inherited = this.inheritBlock(caret, paragraph);
    const block = this.blockWithStyle(isAtomicBlock(inherited) ? this.seedBlock(caret, paragraph) : inherited, runStyle);
    block.asianLayout = { ...asianLayout };
    block.text = text;
    const word = new Word();
    word.kind = "text";
    word.char = text;
    word.intChar = text.codePointAt(0) ?? text.charCodeAt(0);
    word.block = block;
    word.paragraph = paragraph;
    paragraph.changed = true;
    const node = caret.after
      ? document.words.insertAfter(caret.node, word)
      : document.words.insertBefore(caret.node, word);
    const after: LinkedNode<Word>[] = [];
    let current = node.next;
    while (current && current.data.paragraph === paragraph) {
      after.push(current);
      current = current.next;
    }
    this.cloneBlocks(after);
    const dirty = new Set<Paragraph>([paragraph]);
    this.syncAll(document, dirty);
    return {
      story,
      impact: this.impact(story, dirty, "none"),
      caret: new CaretPos(story, node, true),
      originalCaret: original,
      inserted: [node],
      removed: [],
      createdParagraphs: [],
      removedParagraphs: [],
    };
  }

  insertPageBreak(document: Document, story: StoryRef, pos: CaretPos): MutationPatch {
    const original = pos;
    const caret = this.prepare(document, story, pos);
    const paragraph = caret.node?.data.paragraph;
    if (!caret.node || !paragraph || paragraph.isTable || caret.node.data.kind === "table") {
      return this.emptyPatch(story, original);
    }
    const block = new Block();
    block.charType = "page";
    const word = new Word();
    word.kind = "page";
    word.block = block;
    word.paragraph = paragraph;
    paragraph.changed = true;
    const node = caret.after
      ? document.words.insertAfter(caret.node, word)
      : document.words.insertBefore(caret.node, word);
    const after: LinkedNode<Word>[] = [];
    let current = node.next;
    while (current && current.data.paragraph === paragraph) {
      after.push(current);
      current = current.next;
    }
    this.cloneBlocks(after);
    const dirty = new Set<Paragraph>([paragraph]);
    this.syncAll(document, dirty);
    return {
      story,
      impact: this.impact(story, dirty, "split"),
      caret: new CaretPos(story, node, true),
      originalCaret: original,
      inserted: [node],
      removed: [],
      createdParagraphs: [],
      removedParagraphs: [],
    };
  }

  private inheritBlock(pos: CaretPos, paragraph: Paragraph): Block {
    const neighbor = pos.node?.data.block ?? pos.node?.pre?.data.block ?? paragraph.blocks.at(-1);
    if (neighbor && !isAtomicBlock(neighbor)) {
      return neighbor;
    }
    const block = this.seedBlock(pos, paragraph);
    paragraph.addBlock(block);
    return block;
  }

  private seedBlock(pos: CaretPos, paragraph: Paragraph): Block {
    const neighbor = pos.node?.data.block ?? pos.node?.pre?.data.block ?? paragraph.blocks.at(-1);
    const block = new Block();
    block.style = this.styleFrom(paragraph, neighbor && !isAtomicBlock(neighbor) ? neighbor : undefined);
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

  private syncAll(document: Document, dirty: Iterable<Paragraph>, textAnchor?: LinkedNode<Word>): void {
    for (const paragraph of dirty) {
      this.syncBlocks(document, paragraph, textAnchor);
    }
  }

  private syncBlocks(document: Document, paragraph: Paragraph, textAnchor?: LinkedNode<Word>): void {
    const nodes = this.nodesOf(document, paragraph, textAnchor);
    if (!nodes.length && !paragraph.node) {
      return;
    }
    const order: Block[] = [];
    const texts = new Map<Block, string>();
    let previousSource: Block | null = null;
    let activeRun: Block | null = null;
    for (const node of nodes) {
      const word = node.data;
      if (word.isEnterChar()) {
        continue;
      }
      if (word.kind !== "text") {
        activeRun = null;
      }
      if (word.kind === "page") {
        const block = word.block ?? new Block();
        block.charType = "page";
        block.text = "";
        word.block = block;
        if (!order.includes(block)) {
          order.push(block);
        }
        continue;
      }
      if (word.kind === "drawing") {
        if (word.block && !order.includes(word.block)) {
          order.push(word.block);
        }
        continue;
      }
      if (word.kind !== "text") {
        continue;
      }
      const source: Block = word.block ?? activeRun ?? new Block();
      if (source !== previousSource || !activeRun) {
        activeRun = texts.has(source) ? Object.assign(new Block(), source) : source;
        previousSource = source;
        texts.set(activeRun, "");
        order.push(activeRun);
      }
      word.block = activeRun;
      texts.set(activeRun, `${texts.get(activeRun)}${word.char}`);
    }
    for (const block of order) {
      if (texts.has(block)) {
        block.text = texts.get(block) ?? "";
      }
    }
    const enter = nodes.find((node) => node.data.isEnterChar());
    if (!order.length) {
      const source = enter?.data.block ?? paragraph.blocks[0];
      let empty = source && !isAtomicBlock(source) ? source : new Block();
      if (!this.hasRunStyle(empty.style) && paragraph.inheritedRunStyle) {
        empty = copyRun(empty, this.styleFrom(paragraph, empty));
      }
      empty.text = "";
      paragraph.blocks = this.keepAnchors(paragraph.blocks, [empty]);
    } else {
      paragraph.blocks = this.keepAnchors(paragraph.blocks, order);
    }
    if (enter) {
      enter.data.block = order.at(-1) ?? paragraph.blocks.find((block) => !isAtomicBlock(block)) ?? null;
    }
  }

  private keepAnchors(previous: Block[], order: Block[]): Block[] {
    const anchors = previous.filter((block) => block.drawing?.position === "anchor" && !order.includes(block));
    if (!anchors.length) {
      return order;
    }
    const next = order.slice();
    for (const anchor of anchors) {
      const index = Math.min(Math.max(0, previous.indexOf(anchor)), next.length);
      next.splice(index, 0, anchor);
    }
    return next;
  }

  private nodesOf(document: Document, paragraph: Paragraph, textAnchor?: LinkedNode<Word>): LinkedNode<Word>[] {
    const nodes: LinkedNode<Word>[] = [];
    if (textAnchor?.data.paragraph === paragraph) {
      let node: LinkedNode<Word> | null = paragraphStartWord(textAnchor);
      while (node?.data.paragraph === paragraph) {
        nodes.push(node);
        node = node.next;
      }
      return nodes;
    }
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

  paragraphRanges(range: SelRange): SelRange[] {
    if (range.collapsed()) {
      const paragraph = range.start.node?.data.paragraph;
      return paragraph && !paragraph.isTable ? [range] : [];
    }
    const spans = new Map<Paragraph, { first: LinkedNode<Word>; last: LinkedNode<Word> }>();
    for (const node of this.nodesIn(range.normalized())) {
      const paragraph = node.data.paragraph;
      if (!paragraph || paragraph.isTable) {
        continue;
      }
      const span = spans.get(paragraph);
      if (span) {
        span.last = node;
      } else {
        spans.set(paragraph, { first: node, last: node });
      }
    }
    return [...spans.values()].map(({ first, last }) => new SelRange(
      range.story, new CaretPos(range.story, first, false), new CaretPos(range.story, last, true),
    ));
  }

  private nodesIn(range: SelRange): LinkedNode<Word>[] {
    const from = range.start.after ? (range.start.node?.next ?? null) : range.start.node;
    const stop = range.end.after ? range.end.node?.next : range.end.node;
    const nodes: LinkedNode<Word>[] = [];
    let node = from;
    while (node && node !== stop) {
      nodes.push(node);
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

  private impact(story: StoryRef, dirty: Iterable<Paragraph>, structure: EditStructure, textAnchor?: LinkedNode<Word>): EditImpact {
    const unique: Paragraph[] = [];
    for (const paragraph of dirty) {
      if (!unique.includes(paragraph)) {
        unique.push(paragraph);
      }
    }
    return new EditImpact(story, unique, structure, undefined, textAnchor);
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

function isAtomicBlock(block: Block): boolean {
  return (
    block.charType === "page" ||
    block.drawing != null ||
    block.math != null ||
    block.mathXml != null ||
    block.enclosed != null ||
    block.asianLayout != null
  );
}

function copyRun(source: Block | null | undefined, style: RunStyle): Block {
  const block = new Block();
  block.style = style;
  block.charType = source?.charType;
  block.field = source?.field;
  block.fieldInstr = source?.fieldInstr;
  block.link = source?.link ? { ...source.link } : undefined;
  block.revision = source?.revision ? { ...source.revision } : undefined;
  block.commentIds = source?.commentIds?.slice();
  block.commentRef = source?.commentRef;
  block.footnoteId = source?.footnoteId;
  block.enclosed = source?.enclosed ? { ...source.enclosed } : undefined;
  block.asianLayout = source?.asianLayout ? { ...source.asianLayout } : undefined;
  return block;
}

function reviewKey(block: Block | null | undefined): string {
  const revision = block?.revision;
  return `${revision?.kind ?? ""}:${revision?.id ?? ""}:${block?.commentIds?.join(",") ?? ""}:${block?.commentRef ?? ""}:${block?.footnoteId ?? ""}`;
}

function linkKey(block: Block | null | undefined): string {
  return JSON.stringify(block?.link ?? null);
}

function linkStyle(style: RunStyle | undefined, link: TextLink | undefined): RunStyle {
  if (!link) {
    return { ...style };
  }
  return {
    ...style,
    color: style?.color ?? "#0563C1",
    underline: style?.underline && style.underline !== "none" ? style.underline : "single",
  };
}
