import { Block } from "../../../../model/block/Block";
import { mergeRunStyle, type RunStyle } from "../../../../model/style/RunStyle";
import { attr, first, textOf } from "../../ooxml/XmlQuery";
import { DrawingParser } from "../drawing/DrawingParser";
import type { ParseContext } from "../ParseContext";
import { RunPropertiesParser } from "./RunPropertiesParser";

export class RunParser {
  private properties = new RunPropertiesParser();
  private drawings = new DrawingParser();

  parse(rNode: Element, ctx: ParseContext, inherited?: RunStyle): Block {
    const block = new Block();
    block.style = mergeRunStyle(inherited, this.properties.parse(first(rNode, "w:rPr")));

    const text = first(rNode, "w:t");
    if (text) {
      block.text = textOf(text);
    }

    const tab = first(rNode, "w:tab");
    if (tab && !block.text) {
      block.text = "\t";
    }

    const br = first(rNode, "w:br");
    if (br) {
      block.charType = attr(br, "w:type") ?? "textWrapping";
    }

    const drawingNode = first(rNode, "w:drawing");
    if (drawingNode) {
      const drawing = this.drawings.parse(drawingNode, ctx);
      if (drawing) {
        block.drawing = drawing;
      }
    }

    return block;
  }
}
