import { Line } from "../../model/line/Line";
import type { Paragraph } from "../../model/block/Paragraph";
import { flagOn } from "../../model/style/ParagraphAttrs";

export class Paginator {
  paginate(lines: Line[], pageHeight: number): Line[] {
    const height = Math.max(1, pageHeight);
    const result: Line[] = [];
    let y = 0;

    const remaining = () => height - (y % height);
    const skipToNextPage = () => {
      const rest = remaining();
      if (rest < height) {
        y += rest;
      }
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.type === "page") {
        line.top = y;
        line.height = remaining() === height ? 0 : remaining();
        line.fullHeight = line.height;
        result.push(line);
        y += line.height;
        continue;
      }
      if (line.type === "table") {
        y = this.splitTable(line, y, height, result);
        y = this.afterSection(line, y, height);
        continue;
      }

      if (flagOn(line.paragraph?.attrs.pageBreakBefore) && line.isFirst && y > 0 && !atPageTop(y, height)) {
        skipToNextPage();
      }
      if (flagOn(line.paragraph?.attrs.keepLines) && line.isFirst && !line.type) {
        const span = this.spanHeight(lines, index, atPageTop(y, height));
        if (span <= height && remaining() < span && !atPageTop(y, height)) {
          skipToNextPage();
        }
      }
      y = this.holdWithPrevious(line, y, height, result);

      if (this.widowPushes(line, lines[index + 1], remaining(), height)) {
        skipToNextPage();
      }

      const needed = this.placeHeight(line, y, height);
      if (needed <= height && remaining() < needed) {
        if (this.isOrphan(line, result.at(-1), remaining())) {
          skipToNextPage();
          const prev = result.at(-1);
          if (prev) {
            prev.top = y;
            if (atPageTop(y, height)) {
              this.stripBefore(prev);
            }
            y += prev.height;
          }
        } else {
          skipToNextPage();
        }
      }

      if (atPageTop(y, height)) {
        this.stripBefore(line);
      }
      line.top = y;
      result.push(line);
      y += line.height;
      y = this.afterSection(line, y, height);
    }
    return result;
  }

  private afterSection(line: Line, y: number, height: number): number {
    const kind = line.paragraph?.sectionBreak;
    if (!line.isLast || !kind || kind === "continuous" || line.type === "page") {
      return y;
    }
    const skip = () => {
      const rest = height - (y % height);
      if (rest < height) {
        y += rest;
      }
    };
    skip();
    if (kind === "evenPage" || kind === "oddPage") {
      const next = Math.floor(y / height) + 1;
      const even = next % 2 === 0;
      if (kind === "evenPage" ? !even : even) {
        skip();
      }
    }
    return y;
  }

  private placeHeight(line: Line, y: number, pageHeight: number): number {
    if (atPageTop(y, pageHeight) && line.isFirst) {
      return line.height - line.beforeHeight;
    }
    return line.height;
  }

  private stripBefore(line: Line): void {
    if (!line.isFirst || line.beforeHeight <= 0 || line.type) {
      return;
    }
    line.height -= line.beforeHeight;
    line.fullHeight = line.height;
    line.beforeHeight = 0;
  }

  private spanHeight(lines: Line[], index: number, atTop: boolean): number {
    let sum = 0;
    const paragraph = lines[index]?.paragraph;
    for (let i = index; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.paragraph !== paragraph || line.type) {
        break;
      }
      sum += i === index && atTop ? line.height - line.beforeHeight : line.height;
      if (line.isLast) {
        break;
      }
    }
    return sum;
  }

  /** 上一段要求与下段同页，而下一行放不下时，把上一段整段推到下一页。 */
  private holdWithPrevious(line: Line, y: number, pageHeight: number, result: Line[]): number {
    if (!line.isFirst || line.type || !Number.isFinite(pageHeight)) {
      return y;
    }
    const prev = result.at(-1);
    if (!prev?.isLast || prev.paragraph === line.paragraph || !flagOn(prev.paragraph?.attrs.keepNext)) {
      return y;
    }
    const start = paragraphStart(result, prev.paragraph);
    if (!start || atPageTop(start.top, pageHeight)) {
      return y;
    }
    if (Math.floor(start.top / pageHeight) !== Math.floor(y / pageHeight)) {
      return y;
    }
    if (remainingAt(y, pageHeight) >= this.placeHeight(line, y, pageHeight)) {
      return y;
    }
    const nextTop = (Math.floor(start.top / pageHeight) + 1) * pageHeight;
    const shift = nextTop - start.top;
    for (let i = result.length - 1; i >= 0; i -= 1) {
      const item = result[i];
      if (item.paragraph !== prev.paragraph) {
        break;
      }
      item.top += shift;
    }
    const moved = paragraphStart(result, prev.paragraph);
    let dropped = 0;
    if (moved && atPageTop(moved.top, pageHeight)) {
      dropped = moved.beforeHeight;
      this.stripBefore(moved);
      if (dropped > 0) {
        let seen = false;
        for (const item of result) {
          if (item.paragraph !== prev.paragraph) {
            continue;
          }
          if (!seen) {
            seen = true;
            continue;
          }
          item.top -= dropped;
        }
      }
    }
    return y + shift - dropped;
  }

  private widowPushes(line: Line, next: Line | undefined, rem: number, pageHeight: number): boolean {
    if (line.paragraph?.attrs.widowControl === "0") {
      return false;
    }
    if (!line.isFirst || line.isLast || !next || next.paragraph !== line.paragraph) {
      return false;
    }
    const pair = line.height + next.height;
    return rem >= line.height && rem < pair && rem < pageHeight;
  }

  private isOrphan(line: Line, prev: Line | undefined, rem: number): boolean {
    if (line.paragraph?.attrs.widowControl === "0") {
      return false;
    }
    if (!line.isLast || line.isFirst || !prev || prev.paragraph !== line.paragraph) {
      return false;
    }
    return rem < line.height;
  }

  private splitTable(line: Line, y: number, pageHeight: number, result: Line[]): number {
    const table = line.startNode?.data.table;
    const heights = table?.rowHeights ?? [];
    if (!table || heights.length === 0) {
      const rem = pageHeight - (y % pageHeight);
      if (line.height <= pageHeight && rem < line.height && rem < pageHeight) {
        y += rem;
      }
      line.top = y;
      line.tableRowFrom = 0;
      line.tableRowTo = table?.rows.length ?? 0;
      result.push(line);
      return y + line.height;
    }

    let row = 0;
    while (row < heights.length) {
      let rem = pageHeight - (y % pageHeight);
      if (rem < (heights[row] ?? 0) && rem < pageHeight) {
        y += rem;
        rem = pageHeight;
      }
      const from = row;
      let used = 0;
      while (row < heights.length && used + (heights[row] ?? 0) <= rem) {
        used += heights[row] ?? 0;
        row += 1;
      }
      if (row === from) {
        used = heights[row] ?? 0;
        row += 1;
      }
      const slice = this.cloneTableLine(line, from, row, used);
      slice.top = y;
      result.push(slice);
      y += used;
    }
    return y;
  }

  private cloneTableLine(source: Line, from: number, to: number, height: number): Line {
    const line = new Line();
    line.startNode = source.startNode;
    line.length = source.length;
    line.paragraph = source.paragraph;
    line.isFirst = from === 0;
    line.isLast = true;
    line.type = "table";
    line.height = height;
    line.fullHeight = height;
    line.tableRowFrom = from;
    line.tableRowTo = to;
    return line;
  }
}

function atPageTop(y: number, pageHeight: number): boolean {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
    return false;
  }
  const rem = pageHeight - (y % pageHeight);
  return rem >= pageHeight - 0.5;
}

function remainingAt(y: number, pageHeight: number): number {
  return pageHeight - (y % pageHeight);
}

function paragraphStart(lines: Line[], paragraph: Paragraph | null): Line | undefined {
  let start: Line | undefined;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].paragraph !== paragraph) {
      break;
    }
    start = lines[i];
  }
  return start;
}
