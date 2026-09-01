import type { Paragraph } from "../../../../model/block/Paragraph";
import { escapeXml } from "../../ooxml/XmlEscape";
import { RunSerializer } from "../run/RunSerializer";

export class ParagraphSerializer {
  private readonly runs = new RunSerializer();

  serialize(paragraph: Paragraph): string {
    if (paragraph.isTable) {
      return "";
    }
    const pPr = this.properties(paragraph);
    const runs = paragraph.blocks.map((block) => this.runs.serialize(block)).join("");
    return `<w:p>${pPr}${runs}</w:p>`;
  }

  private properties(paragraph: Paragraph): string {
    const jc = this.align(paragraph.attrs.textAlign);
    if (!jc) {
      return "";
    }
    return `<w:pPr><w:jc w:val="${escapeXml(jc)}"/></w:pPr>`;
  }

  private align(value: string | undefined): string | undefined {
    if (!value || value === "left" || value === "start") {
      return undefined;
    }
    if (value === "end") {
      return "right";
    }
    if (value === "justify") {
      return "both";
    }
    return value;
  }
}
