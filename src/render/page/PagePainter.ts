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

  private paintCorners(draw: Draw, setup: PageSetup): void {
    const left = setup.contentLeft();
    const right = setup.contentRight();
    const top = setup.contentTop();
    const bottom = setup.contentBottom();
    const mark = CORNER_MARK;

    draw.setStroke(CORNER_COLOR, 1);
    draw.beginPath();
    this.corner(draw, left, top, -mark, -mark);
    this.corner(draw, right, top, mark, -mark);
    this.corner(draw, left, bottom, -mark, mark);
    this.corner(draw, right, bottom, mark, mark);
    draw.stroke();
  }

  private corner(draw: Draw, x: number, y: number, dx: number, dy: number): void {
    draw.moveTo(x, y);
    draw.lineTo(x + dx, y);
    draw.moveTo(x, y);
    draw.lineTo(x, y + dy);
  }
}
