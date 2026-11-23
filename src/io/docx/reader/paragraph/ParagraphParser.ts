import { Block } from "../../../../model/block/Block";
import { Paragraph } from "../../../../model/block/Paragraph";
import { Drawing } from "../../../../model/inline/Drawing";
import { parseMath, serializeElement } from "../math/MathParser";
import { mergeRunStyle } from "../../../../model/style/RunStyle";
import { fieldKind, type FieldKind } from "../../../../model/document/PageLabel";
import { hyperlinkTarget, type TextLink } from "../../../../model/field/TextLink";
import type { RevisionMark } from "../../../../model/review/Review";
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

    const runNodes = this.collectRuns(pNode, ctx);
    if (runNodes.length === 0) {
      paragraph.addBlock(this.runs.parse(pPr ?? pNode, ctx, paragraph.inheritedRunStyle));
      paragraph.blocks[0].text = "";
      return paragraph;
    }

    for (const source of runNodes) {
      if (source.math) {
        paragraph.addBlock(mathBlock(source.node));
        continue;
      }
      const block = this.runs.parse(source.node, ctx, paragraph.inheritedRunStyle);
      if (source.field) {
        block.field = source.field;
        block.fieldInstr = source.instr;
      }
      if (source.link) {
        block.link = source.link;
        if (!block.style.color) {
          block.style.color = "#0563C1";
        }
        if (!block.style.underline || block.style.underline === "none") {
          block.style.underline = "single";
        }
      }
      if (source.revision) {
        block.revision = source.revision;
        if (source.revision.kind === "ins") {
          block.style.color = block.style.color ?? "#2E75B6";
          block.style.underline = block.style.underline && block.style.underline !== "none" ? block.style.underline : "single";
        } else {
          block.style.color = block.style.color ?? "#C00000";
          block.style.strike = block.style.strike ?? "single";
        }
      }
      if (source.commentIds?.length) {
        block.commentIds = source.commentIds;
      }
      if (block.drawing?.position === "anchor") {
        paragraph.hasAnchor = true;
      }
      paragraph.addBlock(block);
    }
    return paragraph;
  }

  private collectRuns(pNode: Element, ctx: ParseContext): RunSource[] {
    const runs: RunSource[] = [];
    const openComments: string[] = [];
    let instruction = "";
    let active: FieldKind | undefined;
    let inResult = false;
    for (const child of Array.from(pNode.children)) {
      if (matchesName(child, "m:oMath") || matchesName(child, "m:oMathPara")) {
        runs.push({ node: child, math: true });
        continue;
      }
      if (matchesName(child, "w:commentRangeStart")) {
        const id = attr(child, "w:id");
        if (id && !openComments.includes(id)) {
          openComments.push(id);
        }
        continue;
      }
      if (matchesName(child, "w:commentRangeEnd")) {
        const id = attr(child, "w:id");
        const at = id ? openComments.indexOf(id) : -1;
        if (at >= 0) {
          openComments.splice(at, 1);
        }
        continue;
      }
      if (matchesName(child, "w:ins") || matchesName(child, "w:del")) {
        runs.push(...revisionRuns(child, openComments.slice()));
        continue;
      }
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
          instruction = "";
          continue;
        }
        runs.push({ node: child, commentIds: openComments.slice(), ...markedRun(inResult, active, instruction) });
        continue;
      }
      if (matchesName(child, "mc:AlternateContent")) {
        const branch = first(child, "mc:Choice") ?? first(child, "mc:Fallback");
        for (const run of descendants(branch, "w:r")) {
          runs.push({ node: run });
        }
        continue;
      }
      if (matchesName(child, "w:hyperlink")) {
        const link = linkFromElement(child, ctx);
        runs.push(...this.nestedRuns(child).map((node) => ({ node, link })));
        continue;
      }
      if (matchesName(child, "w:sdt")) {
        runs.push(...this.nestedRuns(child).map((node) => ({ node, commentIds: openComments.slice() })));
        continue;
      }
      if (matchesName(child, "w:fldSimple")) {
        const instr = attr(child, "w:instr") ?? "";
        const marked = markedRun(true, fieldKind(instr), instr);
        for (const nested of children(child, "w:r")) {
          runs.push({ node: nested, ...marked });
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

interface RunSource {
  node: Element;
  field?: FieldKind;
  instr?: string;
  link?: TextLink;
  revision?: RevisionMark;
  commentIds?: string[];
  math?: boolean;
}

function mathBlock(node: Element): Block {
  const block = new Block();
  block.math = parseMath(node);
  block.mathXml = serializeElement(node);
  const drawing = new Drawing();
  drawing.width = 16;
  drawing.height = 18;
  block.drawing = drawing;
  return block;
}

function revisionRuns(node: Element, commentIds: string[]): RunSource[] {
  const revision = revisionOf(node);
  const found: RunSource[] = [];
  for (const child of Array.from(node.children)) {
    if (matchesName(child, "w:r")) {
      found.push({ node: child, revision, commentIds });
      continue;
    }
    if (matchesName(child, "w:ins") || matchesName(child, "w:del")) {
      found.push(...revisionRuns(child, commentIds));
    }
  }
  return found;
}

function revisionOf(node: Element): RevisionMark {
  return {
    kind: matchesName(node, "w:del") ? "del" : "ins",
    id: attr(node, "w:id") ?? "0",
    author: attr(node, "w:author"),
    date: attr(node, "w:date"),
  };
}

function markedRun(inResult: boolean, kind: FieldKind | undefined, instruction: string): Pick<RunSource, "field" | "instr" | "link"> {
  if (!inResult) {
    return {};
  }
  const link = hyperlinkTarget(instruction);
  if (link || kind === "HYPERLINK") {
    return { link };
  }
  if (!kind) {
    return {};
  }
  return { field: kind, instr: instruction.trim() || kind };
}

function linkFromElement(node: Element, ctx: ParseContext): TextLink | undefined {
  const anchor = attr(node, "w:anchor");
  const relId = attr(node, "r:id");
  const target = relId ? ctx.relationships.get(relId) : undefined;
  const url = target ? decodeTarget(target) : undefined;
  if (!anchor && !url) {
    return undefined;
  }
  return { anchor: anchor || undefined, url: url || undefined };
}

function decodeTarget(target: string): string {
  try {
    return decodeURI(target);
  } catch {
    return target;
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
