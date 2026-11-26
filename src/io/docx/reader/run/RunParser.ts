import { Block } from "../../../../model/block/Block";
import type { AsianBrackets, AsianLayoutSpec } from "../../../../model/inline/AsianLayout";
import { mergeRunStyle, type RunStyle } from "../../../../model/style/RunStyle";
import { parseNumber, twipToPx } from "../../../../shared/units";
import { attr, descendants, first, textOf } from "../../ooxml/XmlQuery";
import { DrawingParser } from "../drawing/DrawingParser";
import type { ParseContext } from "../ParseContext";
import { RunPropertiesParser } from "./RunPropertiesParser";

export class RunParser {
  private properties = new RunPropertiesParser();
  private drawings = new DrawingParser();

  parse(rNode: Element, ctx: ParseContext, inherited?: RunStyle): Block {
    const block = new Block();
    const rPr = first(rNode, "w:rPr");
    const styleId = attr(first(rPr, "w:rStyle"), "w:val");
    const base = styleId ? mergeRunStyle(inherited, ctx.styles.getResolved(styleId).runStyle) : inherited;
    block.style = mergeRunStyle(base, this.properties.parse(rPr));
    if (styleId) {
      block.style.characterStyleId = styleId;
    }
    const asian = parseAsianLayout(rPr);
    if (asian) {
      block.asianLayout = asian;
    }

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

function parseAsianLayout(rPr: Element | null): AsianLayoutSpec | undefined {
  if (!rPr) {
    return undefined;
  }
  const fit = first(rPr, "w:fitText");
  if (fit) {
    const val = parseNumber(attr(fit, "w:val"));
    if (val != null && val > 0) {
      return { kind: "fitWidth", fitWidthPx: twipToPx(val) };
    }
  }
  const east = first(rPr, "w:eastAsianLayout");
  if (!east) {
    return undefined;
  }
  const combine = attr(east, "w:combine");
  if (combine === "1" || combine === "true" || combine === "on") {
    const brackets = attr(east, "w:combineBrackets") as AsianBrackets | undefined;
    if (brackets != null) {
      return { kind: "twoInOne", brackets };
    }
    return { kind: "combine" };
  }
  const vert = attr(east, "w:vert");
  if (vert === "1" || vert === "true" || vert === "on") {
    const compress = attr(east, "w:vertCompress");
    return { kind: "tatechuyoko", compress: compress !== "0" && compress !== "false" };
  }
  return undefined;
}
