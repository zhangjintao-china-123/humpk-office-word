import type { Draw } from "../canvas/Draw";
import type { PageSetup } from "./PageSetup";

const CORNER_MARK = 20;
const CORNER_COLOR = "#8B0000";

export class PagePainter {
  paint(draw: Draw, setup: PageSetup, x: number, y: number, _pageIndex = 0): void {
    draw.save();
    draw.translate(x, y);
    draw.setFill("#ffffff");
    draw.fillRect(0, 0, setup.width, setup.height);
    this.paintCorners(draw, setup);
    draw.restore();
  }

  paintGrid(draw: Draw, setup: PageSetup, x: number, y: number): void {
    const left = x + setup.contentLeft();
    const right = x + setup.contentRight();
    const top = y + setup.contentTop();
    const bottom = y + setup.contentBottom();
    const step = 20;
    draw.save();
    draw.setStroke("#e5eaf0", 0.7);
    draw.beginPath();
    for (let column = left; column <= right; column += step) {
      draw.moveTo(column, top);
      draw.lineTo(column, bottom);
    }
    for (let row = top; row <= bottom; row += step) {
      draw.moveTo(left, row);
      draw.lineTo(right, row);
    }
    draw.stroke();
    draw.restore();
  }

  private paintCorners(draw: Draw, setup: PageSetup): void {
    const left = setup.contentLeft();
    const right = setup.contentRight();
    const top = setup.contentTop();
    const bottom = setup.contentBottom();
    const mark = CORNER_MARK;

    draw.setStroke(CORNER_COLOR, 1);
    draw.beginPath();
    for (const item of textAreaCorners(left, top, right, bottom, mark)) {
      this.corner(draw, item.x, item.y, item.dx, item.dy);
    }
    draw.stroke();
  }

  private corner(draw: Draw, x: number, y: number, dx: number, dy: number): void {
    draw.moveTo(x, y);
    draw.lineTo(x + dx, y);
    draw.moveTo(x, y);
    draw.lineTo(x, y + dy);
  }
}

/** 版心四角的直角标：上边伸进页眉，下边伸进页脚。 */
export function textAreaCorners(left: number, top: number, right: number, bottom: number, mark = CORNER_MARK) {
  return [
    { x: left, y: top, dx: -mark, dy: -mark },
    { x: right, y: top, dx: mark, dy: -mark },
    { x: left, y: bottom, dx: -mark, dy: mark },
    { x: right, y: bottom, dx: mark, dy: mark },
  ];
}
