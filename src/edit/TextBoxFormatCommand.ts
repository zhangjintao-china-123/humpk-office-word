import type { Paragraph } from "../model/block/Paragraph";
import type { GraphicShape, TextBoxFormat } from "../model/graphic/Shape";
import type { StoryRef } from "../selection/StoryRef";
import type { EditCommand } from "./EditCommand";
import type { EditContext } from "./EditContext";
import { EditImpact } from "./EditImpact";

export function textBoxFormat(shape: GraphicShape): TextBoxFormat {
  return {
    preset: shape.preset,
    fill: shape.fill,
    line: shape.line,
    lineWidth: shape.lineWidth,
    textDirection: shape.textDirection,
    textAlign: shape.textAlign,
  };
}

export class TextBoxFormatCommand implements EditCommand {
  private readonly before: TextBoxFormat;
  private readonly after: TextBoxFormat;

  constructor(
    private readonly ctx: EditContext,
    private readonly shape: GraphicShape,
    private readonly story: StoryRef,
    private readonly paragraph: Paragraph,
    change: TextBoxFormat,
  ) {
    this.before = textBoxFormat(shape);
    this.after = { ...this.before, ...change };
  }

  changed(): boolean {
    return (
      this.before.preset !== this.after.preset ||
      this.before.fill !== this.after.fill ||
      this.before.line !== this.after.line ||
      this.before.lineWidth !== this.after.lineWidth ||
      (this.before.textDirection ?? "horizontal") !== (this.after.textDirection ?? "horizontal") ||
      (this.before.textAlign ?? "start") !== (this.after.textAlign ?? "start")
    );
  }

  do(): void {
    this.apply(this.after);
  }

  undo(): void {
    this.apply(this.before);
  }

  private apply(format: TextBoxFormat): void {
    const directionChanged = (this.shape.textDirection ?? "horizontal") !== (format.textDirection ?? "horizontal");
    Object.assign(this.shape, format);
    const impact = new EditImpact(this.story, [this.paragraph]);
    if (directionChanged) {
      this.ctx.relayout.apply(impact);
    }
    this.ctx.afterEdit(impact);
  }
}
