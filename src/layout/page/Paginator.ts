import { Line } from "../../model/line/Line";
import type { Paragraph } from "../../model/block/Paragraph";
import { flagOn } from "../../model/style/ParagraphAttrs";
import { headerRowCount } from "../table/TableMetrics";

export interface TablePageSlice {
  from: number;
  to: number;
  clipTop: number;
  height: number;
  headerRows: number;
  top: number;
}

/** 按页切开表格。放得下的整行挪到下一页；一行高过一页时只占用本页版心，余下的跳过页脚接到后页。 */
export function paginateTableRows(
  heights: number[],
  headerCount: number,
  startY: number,
  pageHeight: number,
): { slices: TablePageSlice[]; y: number } {
  const slices: TablePageSlice[] = [];
  const page = Math.max(1, pageHeight);
  let y = startY;
  let row = 0;
  let into = 0;
  let guard = 0;

  while (row < heights.length && guard < 100000) {
    guard += 1;
    let rem = page - (y % page);
    if (rem < 0.5) {
      y += rem;
      rem = page;
    }
    const rowLeft = Math.max(0, (heights[row] ?? 0) - into);
    const headers = row >= headerCount ? sumHeights(heights, 0, headerCount) : 0;
    const headerFits = headers > 0.5 && headers < page - 0.5;
    const atTop = rem >= page - 0.5;
    const freshBody = page - (headerFits ? headers : 0);
    if (into < 0.5 && rowLeft <= freshBody + 0.5 && !atTop) {
      const need = (headerFits ? headers : 0) + rowLeft;
      if (rem < need - 0.5) {
        y += rem;
        continue;
      }
    }

    let prefix = 0;
    let room = rem;
    if (headerFits && atTop) {
      prefix = headers;
      room -= headers;
    }

    const from = row;
    const clipTop = into;
    let used = 0;
    while (row < heights.length) {
      const left = Math.max(0, (heights[row] ?? 0) - (row === from ? into : 0));
      if (left <= room + 0.5) {
        used += left;
        room -= left;
        row += 1;
        into = 0;
        continue;
      }
      break;
    }

    if (row < heights.length && used <= 0.5) {
      const left = Math.max(0, (heights[row] ?? 0) - into);
      const take = Math.min(left, Math.max(0, room));
      if (take <= 0.5) {
        if (!atTop) {
          y += rem;
          continue;
        }
        break;
      }
      used = take;
      into += take;
      if (into >= (heights[row] ?? 0) - 0.5) {
        into = 0;
        row += 1;
      }
    }

    if (prefix + used <= 0.5) {
      if (!atTop) {
        y += rem;
        continue;
      }
      break;
    }

    slices.push({
      from,
      to: row === from ? from + 1 : row,
      clipTop,
      height: prefix + used,
      headerRows: prefix > 0 ? headerCount : 0,
      top: y,
    });
    y += prefix + used;
  }

  return { slices, y };
}

function sumHeights(heights: number[], start: number, count: number): number {
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    sum += heights[start + i] ?? 0;
  }
  return sum;
}

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
        line.height = pageBreakAdvance(y, height, result.at(-1)?.type === "page");
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

    const laid = paginateTableRows(heights, headerRowCount(table), y, pageHeight);
    for (const slice of laid.slices) {
      const copy = this.cloneTableLine(line, slice.from, slice.to, slice.height);
      copy.tableHeaderRows = slice.headerRows;
      copy.tableClipTop = slice.clipTop;
      copy.isFirst = slice.from === 0 && slice.clipTop <= 0;
      copy.top = slice.top;
      result.push(copy);
    }
    return laid.y;
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
    line.leftBlankWidth = source.leftBlankWidth;
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

/** 分页符把后面的内容推到下页。紧挨着的第二个分页符在页顶时再占满一页，形成空白页。 */
export function pageBreakAdvance(y: number, pageHeight: number, prevIsPage: boolean): number {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
    return 0;
  }
  const rem = pageHeight - (y % pageHeight);
  if (atPageTop(y, pageHeight)) {
    return prevIsPage ? pageHeight : 0;
  }
  return rem;
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
