import { Paragraph } from "../../../../model/block/Paragraph";
import { mergeRunStyle } from "../../../../model/style/RunStyle";
import { attr, children, first, matchesName } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";
import { RunParser } from "../run/RunParser";
import { RunPropertiesParser } from "../run/RunPropertiesParser";
import { ParagraphPropertiesParser } from "./ParagraphPropertiesParser";

export class ParagraphParser {
  private properties = new ParagraphPropertiesParser();
  private runs = new RunParser();
  private runProperties = new RunPropertiesParser();

  parse(pNode: Element, ctx: ParseContext): Paragraph {
    const paragraph = new Paragraph(ctx.nextId());
    const pPr = first(pNode, "w:pPr");
    paragraph.attrs = this.properties.parse(pPr, ctx);

    if (paragraph.attrs.styleId) {
      paragraph.inheritedRunStyle = ctx.styles.getResolved(paragraph.attrs.styleId).runStyle;
    }
    const pPrRun = this.properties.parseDirectRun(pPr);
    if (pPrRun) {
      paragraph.inheritedRunStyle = mergeRunStyle(
        paragraph.inheritedRunStyle,
        this.runProperties.parse(pPrRun),
      );
    }

    const runNodes = this.collectRuns(pNode);
    if (runNodes.length === 0) {
      paragraph.addBlock(this.runs.parse(pPr ?? pNode, ctx, paragraph.inheritedRunStyle));
      paragraph.blocks[0].text = "";
      return paragraph;
    }

    for (const rNode of runNodes) {
      const block = this.runs.parse(rNode, ctx, paragraph.inheritedRunStyle);
      if (block.drawing?.position === "anchor") {
        paragraph.hasAnchor = true;
      }
      paragraph.addBlock(block);
    }
    return paragraph;
  }

  private collectRuns(pNode: Element): Element[] {
    const runs: Element[] = [];
    for (const child of Array.from(pNode.children)) {
      if (matchesName(child, "w:r")) {
        runs.push(child);
        continue;
      }
      if (matchesName(child, "w:hyperlink") || matchesName(child, "w:ins") || matchesName(child, "w:sdt")) {
        runs.push(...this.nestedRuns(child));
        continue;
      }
      if (matchesName(child, "w:fldSimple")) {
        const instr = attr(child, "w:instr") ?? "";
        if (instr.includes("SECTIONPAGES") || instr.includes("PAGE")) {
          const nested = first(child, "w:r");
          if (nested) {
            runs.push(nested);
          }
        }
      }
    }
    return runs;
  }

  private nestedRuns(node: Element): Element[] {
    const found = children(node, "w:r");
    if (found.length > 0) {
      return found;
    }
    const content = first(node, "w:sdtContent");
    return content ? children(content, "w:r") : [];
  }
}
