import { Line } from "../../model/line/Line";
import type { LinkedNode } from "../../model/list/LinkedList";
import type { Word } from "../../model/inline/Word";
import { LayoutToken } from "../token/LayoutToken";
import { DEFAULT_FONT_SIZE } from "../LayoutConstants";
import { fontSizeOf } from "../measure/FontSpec";
import { LineMetrics } from "./LineMetrics";
import { LinePositioner } from "./LinePositioner";
import { PunctCompressor } from "./PunctCompressor";

export class LineBreaker {
  private readonly metrics = new LineMetrics();
  private readonly compressor = new PunctCompressor();
  private readonly positioner = new LinePositioner();

  setGridPitch(px?: number): void {
    this.metrics.gridPitchPx = px;
  }

  break(tokens: LayoutToken[], contentWidth: number): Line[] {
    const lines: Line[] = [];
    if (tokens.length === 0) {
      return lines;
    }

    const state: { line: Line | null } = { line: null };

    const commit = () => {
      const currentLine = state.line;
      if (!currentLine || (currentLine.length === 0 && !currentLine.startNode)) {
        state.line = null;
        return;
      }
      const last = currentLine.getLastNode();
      const next = last?.next;
      currentLine.isLast = !next || next.data.paragraph !== currentLine.paragraph;
      this.applyHeights(currentLine);
      this.positioner.place(currentLine, contentWidth);
      lines.push(currentLine);
      state.line = null;
    };

    const open = (token: LayoutToken) => {
      const prev = lines.at(-1);
      const isFirst = !prev || prev.paragraph !== token.start.data.paragraph || prev.isLast;
      state.line = this.startLine(token, isFirst);
      return state.line;
    };

    const current = (token: LayoutToken) => state.line ?? open(token);

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.kind === "break") {
        const target = current(token);
        this.append(target, token);
        commit();
        continue;
      }
      if (token.kind === "page" || token.kind === "table") {
        if (state.line && state.line.length > 0) {
          commit();
        }
        const special = open(token);
        this.append(special, token);
        special.type = token.kind;
        commit();
        continue;
      }

      const target = current(token);
      const available = this.available(target, contentWidth);
      const groupWidth = this.lookaheadWidth(tokens, i);
      const overflow = target.length > 0 && target.width + groupWidth > available;

      if (overflow) {
        const need = target.width + token.width - available;
        if (this.compressor.tryCompress(target, need) && target.width + token.width <= available) {
          this.append(target, token);
          continue;
        }
        if (token.canOverflow) {
          this.append(target, token);
          target.overflowPun = true;
          continue;
        }
        commit();
        this.placeToken(open(token), token, contentWidth, open, commit);
        continue;
      }

      if (target.length === 0 && token.width > available && token.length > 1) {
        this.placeToken(target, token, contentWidth, open, commit);
        continue;
      }

      this.append(target, token);
    }

    if (state.line && (state.line.length > 0 || lines.length === 0)) {
      commit();
    }
    this.metrics.collapseAdjacent(lines);
    return lines;
  }

  collapseAdjacent(lines: Line[]): void {
    this.metrics.collapseAdjacent(lines);
  }

  private startLine(token: LayoutToken, isFirst: boolean): Line {
    const line = new Line();
    line.startNode = token.start;
    line.paragraph = token.start.data.paragraph;
    line.isFirst = isFirst;
    line.leftBlankWidth = this.metrics.leftBlank(line.paragraph, isFirst, token.start.data);
    line.rightBlankWidth = this.metrics.rightBlank(line.paragraph);
    return line;
  }

  private available(line: Line, contentWidth: number): number {
    return Math.max(24, contentWidth - line.leftBlankWidth - line.rightBlankWidth);
  }

  /** 词比行宽时按字切开，避免第二行起整串数字/英文画出纸外。 */
  private placeToken(
    line: Line,
    token: LayoutToken,
    contentWidth: number,
    open: (token: LayoutToken) => Line,
    commit: () => void,
  ): void {
    let remaining: LayoutToken | null = token;
    let target = line;
    while (remaining) {
      const room = this.available(target, contentWidth) - target.width;
      if (remaining.width <= room || remaining.length <= 1) {
        this.append(target, remaining);
        return;
      }
      const fit = this.fitLength(remaining, room);
      if (fit <= 0) {
        if (target.length > 0) {
          commit();
          target = open(remaining);
          continue;
        }
        this.append(target, this.slice(remaining, 1));
        remaining = this.rest(remaining, 1);
        if (remaining) {
          commit();
          target = open(remaining);
        }
        continue;
      }
      this.append(target, this.slice(remaining, fit));
      remaining = this.rest(remaining, fit);
      if (remaining) {
        commit();
        target = open(remaining);
      }
    }
  }

  private fitLength(token: LayoutToken, room: number): number {
    let used = 0;
    let count = 0;
    let node: LinkedNode<Word> | null = token.start;
    for (let i = 0; i < token.length && node; i += 1) {
      const width = node.data.kernedWidth;
      if (count > 0 && used + width > room) {
        break;
      }
      used += width;
      count += 1;
      node = node.next;
    }
    return count;
  }

  private slice(token: LayoutToken, length: number): LayoutToken {
    const part = new LayoutToken(token.start);
    part.kind = token.kind;
    part.length = length;
    part.width = this.widthOf(token.start, length);
    return part;
  }

  private rest(token: LayoutToken, skip: number): LayoutToken | null {
    if (skip >= token.length) {
      return null;
    }
    let node: LinkedNode<Word> | null = token.start;
    for (let i = 0; i < skip; i += 1) {
      node = node?.next ?? null;
    }
    if (!node) {
      return null;
    }
    const part = new LayoutToken(node);
    part.kind = token.kind;
    part.length = token.length - skip;
    part.width = this.widthOf(node, part.length);
    return part;
  }

  private widthOf(start: LinkedNode<Word>, length: number): number {
    let width = 0;
    let node: LinkedNode<Word> | null = start;
    for (let i = 0; i < length && node; i += 1) {
      width += node.data.kernedWidth;
      node = node.next;
    }
    return width;
  }

  private append(line: Line, token: LayoutToken): void {
    if (!line.startNode) {
      line.startNode = token.start;
      line.paragraph = token.start.data.paragraph;
    }
    line.length += token.length;
    line.width += token.width;
  }

  private lookaheadWidth(tokens: LayoutToken[], index: number): number {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token.glueNext && next && next.kind !== "break" && next.kind !== "page" && next.kind !== "table") {
      return token.width + next.width;
    }
    return token.width;
  }

  private applyHeights(line: Line): void {
    let maxFont = DEFAULT_FONT_SIZE;
    let node = line.startNode;
    for (let i = 0; i < line.length; i += 1) {
      if (!node) {
        break;
      }
      if (node.data.kind === "drawing" && node.data.drawing) {
        maxFont = Math.max(maxFont, node.data.drawing.height);
      } else {
        maxFont = Math.max(maxFont, fontSizeOf(node.data.getStyle()), node.data.height);
      }
      node = node.next;
    }
    line.maxCharHeight = maxFont;
    line.beforeHeight = this.metrics.beforeHeight(line.paragraph, line.isFirst);
    line.afterHeight = this.metrics.afterHeight(line.paragraph, line.isLast);
    const content = this.metrics.lineHeight(line.paragraph, maxFont);
    const rule = line.paragraph?.attrs.lineRule;
    const box = rule === "exact" ? content : Math.max(content, maxFont);
    line.contentOffsetY = rule === "exact" ? this.metrics.exactOffset(content, maxFont) : 0;
    line.height = box + line.beforeHeight + line.afterHeight;
    line.fullHeight = line.height;
  }
}
