import { CaretPos } from "./CaretPos";
import { SelRange, type SelMode } from "./SelRange";
import { storyEquals, type StoryRef } from "./StoryRef";

export class Selection {
  ranges: SelRange[] = [];
  primary = 0;
  dragging = false;

  isEmpty(): boolean {
    return this.ranges.length === 0;
  }

  isCollapsed(): boolean {
    return this.ranges.length === 1 && this.ranges[0].collapsed();
  }

  primaryRange(): SelRange | undefined {
    return this.ranges[this.primary] ?? this.ranges[0];
  }

  caret(): CaretPos | undefined {
    const range = this.primaryRange();
    if (!range) {
      return undefined;
    }
    return range.end;
  }

  collapse(pos: CaretPos): void {
    this.ranges = [new SelRange(pos.story, pos, pos)];
    this.primary = 0;
  }

  setRange(range: SelRange): void {
    this.ranges = [range];
    this.primary = 0;
  }

  addRange(range: SelRange): void {
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
    const keep = this.ranges.filter((range) => !stories.some((story) => storyEquals(story, range.story)));
    const next = stories.map((story) => factory(story));
    this.ranges = [...keep, ...next];
    this.primary = Math.max(0, this.ranges.length - 1);
  }

  clear(): void {
    this.ranges = [];
    this.primary = 0;
    this.dragging = false;
  }

  normalized(): SelRange[] {
    return this.ranges.map((range) => range.normalized());
  }
}
