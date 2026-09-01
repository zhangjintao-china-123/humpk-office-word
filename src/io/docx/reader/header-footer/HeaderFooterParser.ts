import { Document } from "../../../../model/document/Document";
import type { DocumentKind, HeaderFooterType } from "../../../../model/document/DocumentKind";
import { Section } from "../../../../model/document/Section";
import { resolveWordPart } from "../../ooxml/PartPath";
import { attr, children, first, matchesName, parseXml } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";
import { SectionPropertiesParser } from "../section/SectionPropertiesParser";
import type { StoryParser } from "../story/StoryParser";

const HEADER_FOOTER_TYPES: HeaderFooterType[] = ["default", "first", "even"];

function asType(value: string | undefined): HeaderFooterType {
  if (value && HEADER_FOOTER_TYPES.includes(value as HeaderFooterType)) {
    return value as HeaderFooterType;
  }
  return "default";
}

/** 从 sectPr 取出页眉页脚引用，复用 StoryParser 解析对应 part。 */
export class HeaderFooterParser {
  private readonly properties = new SectionPropertiesParser();

  constructor(private readonly story: StoryParser) {}

  attach(body: Element, ctx: ParseContext, document: Document): void {
    const cache = new Map<string, Document>();
    for (const sectPr of this.findSectPrs(body)) {
      const section = new Section();
      this.properties.apply(sectPr, section);
      this.fillRefs(sectPr, "w:headerReference", "header", ctx, cache, section.headers);
      this.fillRefs(sectPr, "w:footerReference", "footer", ctx, cache, section.footers);
      document.sections.push(section);
    }
  }

  private fillRefs(
    sectPr: Element,
    tag: string,
    kind: Extract<DocumentKind, "header" | "footer">,
    ctx: ParseContext,
    cache: Map<string, Document>,
    target: Map<HeaderFooterType, Document>,
  ): void {
    for (const ref of children(sectPr, tag)) {
      const parsed = this.loadPart(attr(ref, "r:id"), kind, ctx, cache);
      if (parsed) {
        target.set(asType(attr(ref, "w:type")), parsed);
      }
    }
  }

  private loadPart(
    rId: string | undefined,
    kind: Extract<DocumentKind, "header" | "footer">,
    ctx: ParseContext,
    cache: Map<string, Document>,
  ): Document | undefined {
    if (!rId) {
      return undefined;
    }
    const target = ctx.relationships.get(rId);
    if (!target) {
      return undefined;
    }
    const partPath = resolveWordPart(target);
    const cached = cache.get(partPath);
    if (cached) {
      return cached;
    }
    const xml = ctx.pack?.xml(partPath);
    if (!xml) {
      return undefined;
    }
    const xmlDoc = parseXml(xml);
    const rootName = kind === "header" ? "w:hdr" : "w:ftr";
    const root = matchesName(xmlDoc.documentElement, rootName)
      ? xmlDoc.documentElement
      : first(xmlDoc.documentElement, rootName);
    const nested = this.story.parseRoot(root, ctx.forkForPart(partPath), kind, partPath);
    cache.set(partPath, nested);
    return nested;
  }

  private findSectPrs(body: Element): Element[] {
    const result: Element[] = [];
    for (const child of Array.from(body.children)) {
      if (matchesName(child, "w:sectPr")) {
        result.push(child);
        continue;
      }
      if (matchesName(child, "w:p")) {
        const sectPr = first(first(child, "w:pPr"), "w:sectPr");
        if (sectPr) {
          result.push(sectPr);
        }
      }
    }
    return result;
  }
}
