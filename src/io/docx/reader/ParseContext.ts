import { Numbering } from "../../../model/style/Numbering";
import { StyleSheet } from "../../../model/style/StyleSheet";
import { DocxPackage } from "../ooxml/DocxPackage";
import { OoxmlUnits } from "../ooxml/OoxmlUnits";
import { relsPathFor } from "../ooxml/PartPath";
import { RelationshipParser } from "./RelationshipParser";
import type { StoryParser } from "./story/StoryParser";

export class ParseContext {
  relationships = new Map<string, string>();
  styles = new StyleSheet();
  numbering = new Numbering();
  units = new OoxmlUnits();
  titleSerial = new Map<string, number>();
  nextParagraphId = 1;
  storyParser?: StoryParser;

  constructor(public readonly pack?: DocxPackage) {}

  nextId(): number {
    const id = this.nextParagraphId;
    this.nextParagraphId += 1;
    return id;
  }

  /**
   * 页眉/页脚等独立 part：共享样式与编号，换自己的 rels，序号隔离。
   * 单元格仍用当前 context（正文流）。
   */
  forkForPart(partPath: string): ParseContext {
    const next = new ParseContext(this.pack);
    next.styles = this.styles;
    next.numbering = this.numbering;
    next.units = this.units;
    next.storyParser = this.storyParser;
    const relsXml = this.pack?.xml(relsPathFor(partPath));
    const partRels = new RelationshipParser().parse(relsXml);
    next.relationships = partRels.size > 0 ? partRels : new Map(this.relationships);
    return next;
  }
}
