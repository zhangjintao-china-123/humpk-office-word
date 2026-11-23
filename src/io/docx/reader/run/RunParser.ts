import { Block } from "../../../../model/block/Block";
import { mergeRunStyle, type RunStyle } from "../../../../model/style/RunStyle";
import { attr, descendants, first, textOf } from "../../ooxml/XmlQuery";
import { DrawingParser } from "../drawing/DrawingParser";
import type { ParseContext } from "../ParseContext";
import { RunPropertiesParser } from "./RunPropertiesParser";

export class RunParser {
  private properties = new RunPropertiesParser();
  private drawings = new DrawingParser();

  parse(rNode: Element, ctx: ParseContext, inherited?: RunStyle): Block {
    const block = new Block();
    block.style = mergeRunStyle(inherited, this.properties.parse(first(rNode, "w:rPr")));

    const text = first(rNode, "w:t") ?? first(rNode, "w:delText");
    if (text) {
      block.text = textOf(text);
    }
    const footnote = first(rNode, "w:footnoteReference");
    if (footnote) {
      block.footnoteId = attr(footnote, "w:id");
    }
    const comment = first(rNode, "w:commentReference");
    if (comment) {
      block.commentRef = attr(comment, "w:id");
    }

    const tab = first(rNode, "w:tab");
    if (tab && !block.text) {
      block.text = "\t";
    }

    const br = first(rNode, "w:br");
    if (br) {
      block.charType = attr(br, "w:type") ?? "textWrapping";
    }

    const drawingNode = first(rNode, "w:drawing") ?? descendants(rNode, "w:drawing")[0];
    if (drawingNode) {
      const drawing = this.drawings.parse(drawingNode, ctx);
      if (drawing) {
        block.drawing = drawing;
      }
    }
    if (!block.drawing) {
      const pict = first(rNode, "w:pict") ?? descendants(rNode, "w:pict")[0];
      if (pict) {
        const drawing = this.drawings.parsePict(pict, ctx);
        if (drawing) {
          block.drawing = drawing;
        }
      }
    }

    return block;
  }
}
