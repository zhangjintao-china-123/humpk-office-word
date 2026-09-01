import { Line } from "../../model/line/Line";

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
        continue;
      }

      if (this.widowPushes(line, lines[index + 1], remaining(), height)) {
        skipToNextPage();
      }

      if (line.height <= height && remaining() < line.height) {
        if (this.isOrphan(line, result.at(-1), remaining())) {
          skipToNextPage();
          const prev = result.at(-1);
          if (prev) {
            prev.top = y;
            y += prev.height;
          }
        } else {
          skipToNextPage();
        }
      }

      line.top = y;
      result.push(line);
      y += line.height;
    }
    return result;
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
