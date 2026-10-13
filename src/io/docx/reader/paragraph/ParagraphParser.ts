import { Paragraph } from "../../../../model/block/Paragraph";
import { mergeRunStyle } from "../../../../model/style/RunStyle";
import { fieldKind, type FieldKind } from "../../../../model/document/PageLabel";
import type { TocHint } from "../../../../model/toc/Toc";
import { attr, children, descendants, first, matchesName, textOf } from "../../ooxml/XmlQuery";
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

    const styleId = paragraph.attrs.styleId ?? (ctx.applyDefaults ? ctx.styles.defaultParagraphStyleId : undefined);
    const fromStyle = styleId ? ctx.styles.getResolved(styleId).runStyle : undefined;
    paragraph.inheritedRunStyle = ctx.applyDefaults ? mergeRunStyle(ctx.styles.docDefaultRun, fromStyle) : fromStyle;
    const pPrRun = this.properties.parseDirectRun(pPr);
    if (pPrRun) {
      paragraph.inheritedRunStyle = mergeRunStyle(
        paragraph.inheritedRunStyle,
        this.runProperties.parse(pPrRun),
      );
    }

    const probe = this.probe(pNode);
    paragraph.bookmarks = probe.bookmarks;
    if (probe.instruction || probe.fieldEnd || probe.anchor) {
      paragraph.tocHint = { instruction: probe.instruction, fieldEnd: probe.fieldEnd, anchor: probe.anchor };
    }

    const runNodes = this.collectRuns(pNode);
    if (runNodes.length === 0) {
      paragraph.addBlock(this.runs.parse(pPr ?? pNode, ctx, paragraph.inheritedRunStyle));
      paragraph.blocks[0].text = "";
      return paragraph;
    }

    for (const source of runNodes) {
      const block = this.runs.parse(source.node, ctx, paragraph.inheritedRunStyle);
      if (source.field) {
        block.field = source.field;
      }
      if (block.drawing?.position === "anchor") {
        paragraph.hasAnchor = true;
      }
      paragraph.addBlock(block);
    }
    return paragraph;
  }

  private collectRuns(pNode: Element): { node: Element; field?: FieldKind }[] {
    const runs: { node: Element; field?: FieldKind }[] = [];
    let instruction = "";
    let active: FieldKind | undefined;
    let inResult = false;
    for (const child of Array.from(pNode.children)) {
      if (matchesName(child, "w:r")) {
        const marker = fieldMarker(child);
        if (marker === "begin") {
          instruction = "";
          active = undefined;
          inResult = false;
          continue;
        }
        if (marker === "instr") {
          instruction += textOf(first(child, "w:instrText"));
          active = fieldKind(instruction) ?? active;
          continue;
        }
        if (marker === "separate") {
          inResult = true;
          active = fieldKind(instruction) ?? active;
          continue;
        }
        if (marker === "end") {
          inResult = false;
          active = undefined;
          continue;
        }
        runs.push({ node: child, field: inResult ? active : undefined });
        continue;
      }
      if (matchesName(child, "mc:AlternateContent")) {
        const branch = first(child, "mc:Choice") ?? first(child, "mc:Fallback");
        for (const run of descendants(branch, "w:r")) {
          runs.push({ node: run });
        }
        continue;
      }
      if (matchesName(child, "w:hyperlink") || matchesName(child, "w:ins") || matchesName(child, "w:sdt")) {
        runs.push(...this.nestedRuns(child).map((node) => ({ node })));
        continue;
      }
      if (matchesName(child, "w:fldSimple")) {
        const field = fieldKind(attr(child, "w:instr") ?? "");
        for (const nested of children(child, "w:r")) {
          runs.push({ node: nested, field });
        }
      }
    }
    return runs;
  }

  private probe(pNode: Element): TocHint & { bookmarks: string[] } {
    const bookmarks = children(pNode, "w:bookmarkStart")
      .map((el) => attr(el, "w:name"))
      .filter((name): name is string => !!name);
    const instructions: string[] = [];
    let fieldEnd = false;
    let anchor: string | undefined;
    const walk = (node: Element): void => {
      for (const child of Array.from(node.children)) {
        if (matchesName(child, "w:hyperlink")) {
          anchor = anchor ?? attr(child, "w:anchor");
        }
        if (matchesName(child, "w:fldSimple")) {
          const instr = attr(child, "w:instr");
          if (instr) {
            instructions.push(instr);
          }
        }
        if (matchesName(child, "w:instrText")) {
          const text = textOf(child).trim();
          if (text) {
            instructions.push(text);
          }
        }
        if (matchesName(child, "w:fldChar") && attr(child, "w:fldCharType") === "end") {
          fieldEnd = true;
        }
        walk(child);
      }
    };
    walk(pNode);
    return { bookmarks, instruction: instructions.join(" "), fieldEnd, anchor };
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

function fieldMarker(run: Element): "begin" | "separate" | "end" | "instr" | undefined {
  const kind = attr(first(run, "w:fldChar"), "w:fldCharType");
  if (kind === "begin" || kind === "separate" || kind === "end") {
    return kind;
  }
  if (first(run, "w:instrText")) {
    return "instr";
  }
  return undefined;
}
