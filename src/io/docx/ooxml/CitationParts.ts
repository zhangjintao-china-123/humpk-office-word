import { authorNames, splitName, type CitationSource, type CitationStyle } from "../../../model/reference/Citation";
import type { DocxPackage } from "./DocxPackage";
import { escapeXml } from "./XmlEscape";
import { attr, children, first, parseXml, textOf } from "./XmlQuery";

const BIB_NS = "http://schemas.openxmlformats.org/officeDocument/2006/bibliography";
const LEGACY_BIB_NS = "http://schemas.microsoft.com/office/word/2004/10/bibliography";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const ITEM = "customXml/item1.xml";
export const CITATION_REL = { type: `${REL_NS}/customXml`, target: `../${ITEM}` };
export const CITATION_PROPS_OVERRIDE = '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>';

export function readCitationParts(pack: DocxPackage): { style: CitationStyle; sources: CitationSource[] } {
  const relations = pack.xml("word/_rels/document.xml.rels");
  const sources = new Map<string, CitationSource>();
  let style: CitationStyle = "APA";
  if (!relations) return { style, sources: [] };
  for (const rel of children(parseXml(relations).documentElement, "Relationship")) {
    const target = attr(rel, "Target");
    if (!target || !attr(rel, "Type")?.endsWith("/customXml") || attr(rel, "TargetMode") === "External") continue;
    let root: Element;
    try {
      const path = new URL(target, "https://docx.invalid/word/document.xml").pathname;
      const xml = pack.xml(decodeURIComponent(path));
      if (!xml) continue;
      root = parseXml(xml).documentElement;
    } catch {
      continue;
    }
    if (root.localName !== "Sources" || (root.namespaceURI !== BIB_NS && root.namespaceURI !== LEGACY_BIB_NS)) continue;
    const selected = [attr(root, "StyleName"), attr(root, "SelectedStyle")].join(" ");
    if (/MLA/i.test(selected)) style = "MLA";
    for (const element of children(root, "Source")) {
      const value = (name: string) => textOf(first(element, name)).trim();
      const tag = value("Tag");
      if (!tag || sources.has(tag)) continue;
      const authors = first(first(element, "Author"), "Author");
      const names = children(first(authors, "NameList"), "Person").map((person) => {
        const last = textOf(first(person, "Last"));
        const given = ["First", "Middle"].map((part) => textOf(first(person, part))).filter(Boolean).join(" ");
        return [last, given].filter(Boolean).join(", ");
      });
      sources.set(tag, {
        tag,
        type: value("SourceType") || "Book",
        author: textOf(first(authors, "Corporate")) || names.join("；"),
        title: value("Title") || value("ShortTitle") || tag,
        year: value("Year"),
        container: value("JournalName") || value("InternetSiteTitle") || value("Publisher"),
        url: value("URL"),
        originalXml: root.namespaceURI === BIB_NS ? new XMLSerializer().serializeToString(element) : undefined,
      });
    }
  }
  return { style, sources: [...sources.values()] };
}

export function writeCitationParts(pack: DocxPackage, style: CitationStyle, sources: CitationSource[]): void {
  const sheet = style === "APA" ? "APA.XSL" : "MLA.XSL";
  pack.setXml(ITEM, `<?xml version="1.0" encoding="UTF-8"?><b:Sources xmlns:b="${BIB_NS}" StyleName="${style}" SelectedStyle="/${sheet}">${sources.map(sourceXml).join("")}</b:Sources>`);
  pack.setXml("customXml/_rels/item1.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/customXmlProps" Target="itemProps1.xml"/></Relationships>`);
  pack.setXml("customXml/itemProps1.xml", `<ds:datastoreItem xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml" ds:itemID="{3CF23B91-E7CA-4232-9E95-7988A813FA17}"><ds:schemaRefs><ds:schemaRef ds:uri="${BIB_NS}"/></ds:schemaRefs></ds:datastoreItem>`);
}

function sourceXml(source: CitationSource): string {
  if (source.originalXml) return source.originalXml;
  const tag = (name: string, value: string) => value ? `<b:${name}>${escapeXml(value)}</b:${name}>` : "";
  const persons = authorNames(source.author).map((author) => {
    const { first, last } = splitName(author);
    return `<b:Person>${tag("Last", last)}${tag("First", first)}</b:Person>`;
  }).join("");
  const authors = persons ? `<b:Author><b:Author><b:NameList>${persons}</b:NameList></b:Author></b:Author>` : "";
  const container = source.type === "JournalArticle" ? "JournalName" : source.type === "InternetSite" ? "InternetSiteTitle" : "Publisher";
  return `<b:Source>${tag("Tag", source.tag)}${tag("SourceType", source.type)}${authors}${tag("Title", source.title)}${tag("Year", source.year)}${tag(container, source.container)}${tag("URL", source.url)}</b:Source>`;
}
