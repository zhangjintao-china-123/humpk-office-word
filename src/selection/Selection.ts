import { CaretPos } from "./CaretPos";
import { SelRange, type SelMode } from "./SelRange";
import { storyEquals, type StoryRef } from "./StoryRef";

export interface FlowAnchor {
  anchor: CaretPos;
  focus: CaretPos;
}

export class Selection {
  ranges: SelRange[] = [];
  primary = 0;
  dragging = false;
  /** 正文和单元格按阅读顺序连成的一次选择。 */
  flow: FlowAnchor | null = null;

  isEmpty(): boolean {
    return this.ranges.length === 0;
  }

  isCollapsed(): boolean {
    if (this.flow && !this.flow.anchor.equals(this.flow.focus)) {
      return false;
    }
    return this.ranges.length === 1 && this.ranges[0].collapsed();
  }

  primaryRange(): SelRange | undefined {
    return this.ranges[this.primary] ?? this.ranges[0];
  }

  caret(): CaretPos | undefined {
    if (this.flow) {
      return this.flow.focus;
    }
    const range = this.primaryRange();
    if (!range) {
      return undefined;
    }
    return range.end;
  }

  collapse(pos: CaretPos): void {
    this.flow = null;
    this.ranges = [new SelRange(pos.story, pos, pos)];
    this.primary = 0;
  }

  setFlow(anchor: CaretPos, focus: CaretPos): void {
    if (anchor.equals(focus)) {
      this.collapse(focus);
      return;
    }
    this.flow = { anchor, focus };
    this.ranges = [new SelRange(focus.story, focus, focus)];
    this.primary = 0;
  }

  useRanges(ranges: SelRange[]): void {
    this.flow = null;
    this.ranges = ranges;
    this.primary = Math.max(0, ranges.length - 1);
  }

  setRange(range: SelRange): void {
    this.flow = null;
    this.ranges = [range];
    this.primary = 0;
  }

  addRange(range: SelRange): void {
    this.flow = null;
    const index = this.ranges.findIndex((item) => storyEquals(item.story, range.story));
    if (index >= 0) {
      this.ranges[index] = range;
      this.primary = index;
      return;
    }
    this.ranges.push(range);
    this.primary = this.ranges.length - 1;
  }

  extendInStory(pos: CaretPos, mode: SelMode = "text"): void {
    this.flow = null;
    const index = this.ranges.findIndex((item) => storyEquals(item.story, pos.story));
    if (index < 0) {
      this.addRange(new SelRange(pos.story, pos, pos, mode));
      return;
    }
    const current = this.ranges[index];
    this.ranges[index] = new SelRange(current.story, current.start, pos, mode);
    this.primary = index;
  }

  replaceStories(stories: StoryRef[], factory: (story: StoryRef) => SelRange): void {
    this.flow = null;
    const keep = this.ranges.filter((range) => !stories.some((story) => storyEquals(story, range.story)));
    const next = stories.map((story) => factory(story));
    this.ranges = [...keep, ...next];
    this.primary = Math.max(0, this.ranges.length - 1);
  }

  clear(): void {
    this.ranges = [];
    this.primary = 0;
    this.dragging = false;
    this.flow = null;
  }

  normalized(): SelRange[] {
    return this.ranges.map((range) => range.normalized());
  }
}
