import type { Document } from "../../../model/document/Document";
import type { HeaderFooterType } from "../../../model/document/DocumentKind";
import type { Section } from "../../../model/document/Section";
import type { NumberingLevel } from "../../../model/style/Numbering";
import type { StyleDefinition } from "../../../model/style/StyleSheet";
import { pxToTwip } from "../../../shared/units";
import { DocxPackage } from "../ooxml/DocxPackage";
import { escapeXml } from "../ooxml/XmlEscape";
import { paragraphPropertiesXml } from "./paragraph/ParagraphPropertiesWriter";
import { PartAssets, type WrittenImage, type WrittenRel } from "./package/PartAssets";
import { rootRelsXml, stylesXml, wrapDocumentXml, wrapStoryXml } from "./package/DefaultParts";
import { RunSerializer } from "./run/RunSerializer";
import { StorySerializer } from "./story/StorySerializer";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const HEADER_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
const FOOTER_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";
const HEADER_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
const FOOTER_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

interface StoryPart {
  sectionIndex: number;
  kind: "header" | "footer";
  type: HeaderFooterType;
  path: string;
  xml: string;
  assets: PartAssets;
  relId?: string;
}

export class DocxWriter {
  private readonly runs = new RunSerializer();

  async write(document: Document): Promise<ArrayBuffer> {
    const imageSeq = { n: 1 };
    const relSeq = { n: 1 };
    const stylesId = nextId(relSeq);
    const numbering = document.numbering.entries();
    const numberingId = numbering.length ? nextId(relSeq) : undefined;
    const settingsId =
      document.evenAndOddHeaders || document.adjustLineHeightInTable ? nextId(relSeq) : undefined;

    const bands = this.collectBands(document, imageSeq);
    const relByPath = new Map<string, string>();
    for (const part of bands) {
      const existing = relByPath.get(part.path);
      if (existing) {
        part.relId = existing;
        continue;
      }
      const id = nextId(relSeq);
      part.relId = id;
      relByPath.set(part.path, id);
    }

    const bodyAssets = new PartAssets(relSeq, imageSeq);
    const lastIndex = Math.max(0, document.sections.length - 1);
    const body = new StorySerializer(bodyAssets).serializeBody(document, (paragraph) => {
      if (!paragraph.attrs.endsSection || paragraph.sectionIndex >= lastIndex) {
        return "";
      }
      const section = document.sections[paragraph.sectionIndex];
      return section ? this.sectPr(section, bands.filter((part) => part.sectionIndex === paragraph.sectionIndex)) : "";
    });
    const tail = document.sections.length ? bands.filter((part) => part.sectionIndex === lastIndex) : bands;
    const pack = new DocxPackage();
    pack.setXml("[Content_Types].xml", this.contentTypes(bands, bodyAssets.images, !!numberingId, !!settingsId));
    pack.setXml("_rels/.rels", rootRelsXml());
    pack.setXml("word/document.xml", wrapDocumentXml(body, this.sectPr(document.lastSection(), tail)));
    pack.setXml("word/_rels/document.xml.rels", this.documentRels(stylesId, numberingId, settingsId, bands, bodyAssets.rels));
    pack.setXml("word/styles.xml", this.styles(document.styles.list()));
    if (numberingId) {
      pack.setXml("word/numbering.xml", this.numberingXml(numbering));
    }
    if (settingsId) {
      pack.setXml("word/settings.xml", this.settingsXml(document.evenAndOddHeaders, document.adjustLineHeightInTable));
    }
    const written = new Set<string>();
    for (const part of bands) {
      if (written.has(part.path)) {
        continue;
      }
      written.add(part.path);
      pack.setXml(part.path, part.xml);
      if (part.assets.rels.length) {
        pack.setXml(relsPath(part.path), relsXml(part.assets.rels));
      }
      this.putImages(pack, part.assets.images);
    }
    this.putImages(pack, bodyAssets.images);
    return pack.generate();
  }

  private collectBands(document: Document, imageSeq: { n: number }): StoryPart[] {
    const parts: StoryPart[] = [];
    const seen = new Map<Document, { path: string; xml: string; assets: PartAssets }>();
    let headerCount = 0;
    let footerCount = 0;
    const take = (sectionIndex: number, kind: "header" | "footer", type: HeaderFooterType, story: Document | undefined) => {
      if (!story) {
        return;
      }
      const cached = seen.get(story);
      if (cached) {
        parts.push({ sectionIndex, kind, type, path: cached.path, xml: cached.xml, assets: cached.assets });
        return;
      }
      const assets = new PartAssets({ n: 1 }, imageSeq);
      const body = new StorySerializer(assets).serializeBody(story);
      const index = kind === "header" ? ++headerCount : ++footerCount;
      const path = `word/${kind}${index}.xml`;
      const xml = wrapStoryXml(kind === "header" ? "w:hdr" : "w:ftr", body);
      seen.set(story, { path, xml, assets });
      parts.push({ sectionIndex, kind, type, path, xml, assets });
    };
    document.sections.forEach((section, sectionIndex) => {
      for (const type of ["default", "first", "even"] as const) {
        take(sectionIndex, "header", type, section.headers.get(type));
        take(sectionIndex, "footer", type, section.footers.get(type));
      }
    });
    return parts;
  }

  private sectPr(section: Section | undefined, bands: StoryPart[]): string {
    const refs = bands
      .map((part) => {
        const tag = part.kind === "header" ? "w:headerReference" : "w:footerReference";
        return `<${tag} w:type="${part.type}" r:id="${part.relId}"/>`;
      })
      .join("");
    const width = section?.pageWidthPx != null ? pxToTwip(section.pageWidthPx) : 11906;
    const height = section?.pageHeightPx != null ? pxToTwip(section.pageHeightPx) : 16838;
    const top = section?.topMarginPx != null ? pxToTwip(section.topMarginPx) : 1440;
    const right = section?.rightMarginPx != null ? pxToTwip(section.rightMarginPx) : 1440;
    const bottom = section?.bottomMarginPx != null ? pxToTwip(section.bottomMarginPx) : 1440;
    const left = section?.leftMarginPx != null ? pxToTwip(section.leftMarginPx) : 1440;
    const header = section?.headerFromEdgePx != null ? pxToTwip(section.headerFromEdgePx) : 720;
    const footer = section?.footerFromEdgePx != null ? pxToTwip(section.footerFromEdgePx) : 720;
    const title = section?.titlePg ? "<w:titlePg/>" : "";
    const grid = this.docGrid(section);
    const breakType = section?.breakType && section.breakType !== "nextPage" ? `<w:type w:val="${section.breakType}"/>` : "";
    const numbering = pageNumTypeXml(section);
    return `<w:sectPr>${refs}${breakType}<w:pgSz w:w="${width}" w:h="${height}"/><w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="${header}" w:footer="${footer}"/>${numbering}${title}${grid}</w:sectPr>`;
  }

  private docGrid(section: Section | undefined): string {
    if (!section?.docGridType && section?.linePitchPx == null) {
      return "";
    }
    const type = section.docGridType ? ` w:type="${escapeXml(section.docGridType)}"` : "";
    const pitch = section.linePitchPx != null ? ` w:linePitch="${pxToTwip(section.linePitchPx)}"` : "";
    return `<w:docGrid${type}${pitch}/>`;
  }

  private documentRels(
    stylesId: string,
    numberingId: string | undefined,
    settingsId: string | undefined,
    bands: StoryPart[],
    images: WrittenRel[],
  ): string {
    const rels: WrittenRel[] = [
      {
        id: stylesId,
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
        target: "styles.xml",
      },
    ];
    if (numberingId) {
      rels.push({
        id: numberingId,
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
        target: "numbering.xml",
      });
    }
    if (settingsId) {
      rels.push({
        id: settingsId,
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings",
        target: "settings.xml",
      });
    }
    const seen = new Set<string>();
    for (const part of bands) {
      if (!part.relId || seen.has(part.path)) {
        continue;
      }
      seen.add(part.path);
      rels.push({
        id: part.relId,
        type: part.kind === "header" ? HEADER_TYPE : FOOTER_TYPE,
        target: part.path.replace(/^word\//, ""),
      });
    }
    rels.push(...images);
    return relsXml(rels);
  }

  private contentTypes(bands: StoryPart[], images: WrittenImage[], numbering: boolean, settings: boolean): string {
    const defaults = new Map<string, string>([
      ["rels", "application/vnd.openxmlformats-package.relationships+xml"],
      ["xml", "application/xml"],
    ]);
    for (const image of images) {
      defaults.set(image.ext, imageContentType(image.ext));
    }
    for (const part of bands) {
      for (const image of part.assets.images) {
        defaults.set(image.ext, imageContentType(image.ext));
      }
    }
    const defaultXml = [...defaults]
      .map(([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`)
      .join("");
    const overrides = [
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`,
    ];
    if (numbering) {
      overrides.push(
        `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`,
      );
    }
    if (settings) {
      overrides.push(
        `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>`,
      );
    }
    const seen = new Set<string>();
    for (const part of bands) {
      if (seen.has(part.path)) {
        continue;
      }
      seen.add(part.path);
      const content = part.kind === "header" ? HEADER_CT : FOOTER_CT;
      overrides.push(`<Override PartName="/${part.path}" ContentType="${content}"/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaultXml}${overrides.join("")}</Types>`;
  }

  private styles(definitions: StyleDefinition[]): string {
    if (!definitions.length) {
      return stylesXml();
    }
    const body = definitions
      .map((style) => {
        const type = escapeXml(style.type || "paragraph");
        const based = style.basedOn ? `<w:basedOn w:val="${escapeXml(style.basedOn)}"/>` : "";
        const pPr = paragraphPropertiesXml(style.paragraphAttrs ?? {}, true);
        const rPr = this.runs.propertiesOf(style.runStyle);
        const name = escapeXml(style.name || style.styleId);
        return `<w:style w:type="${type}" w:styleId="${escapeXml(style.styleId)}"><w:name w:val="${name}"/>${based}${pPr}${rPr}</w:style>`;
      })
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>
    <w:pPrDefault/>
  </w:docDefaults>
  ${body}
</w:styles>`;
  }

  private numberingXml(entries: { numId: string; ilvl: string; level: NumberingLevel }[]): string {
    const byNum = new Map<string, { ilvl: string; level: NumberingLevel }[]>();
    for (const entry of entries) {
      const list = byNum.get(entry.numId) ?? [];
      list.push({ ilvl: entry.ilvl, level: entry.level });
      byNum.set(entry.numId, list);
    }
    const abstracts: string[] = [];
    const nums: string[] = [];
    let abstractId = 0;
    for (const [numId, levels] of byNum) {
      const lvls = levels
        .map((item) => {
          const jc = item.level.lvlJc ? `<w:lvlJc w:val="${escapeXml(item.level.lvlJc)}"/>` : "";
          const legal = item.level.legal ? "<w:isLgl/>" : "";
          const suff = item.level.suff ? `<w:suff w:val="${escapeXml(item.level.suff)}"/>` : "";
          const font = item.level.font
            ? `<w:rPr><w:rFonts w:ascii="${escapeXml(item.level.font)}" w:hAnsi="${escapeXml(item.level.font)}"/></w:rPr>`
            : "";
          return `<w:lvl w:ilvl="${escapeXml(item.ilvl)}"><w:start w:val="${item.level.start}"/>${legal}<w:numFmt w:val="${escapeXml(item.level.numFmt)}"/><w:lvlText w:val="${escapeXml(item.level.lvlText)}"/>${jc}${suff}${font}</w:lvl>`;
        })
        .join("");
      abstracts.push(`<w:abstractNum w:abstractNumId="${abstractId}">${lvls}</w:abstractNum>`);
      nums.push(`<w:num w:numId="${escapeXml(numId)}"><w:abstractNumId w:val="${abstractId}"/></w:num>`);
      abstractId += 1;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W_NS}">${abstracts.join("")}${nums.join("")}</w:numbering>`;
  }

  private settingsXml(evenAndOdd: boolean, adjustTable: boolean): string {
    const flags = [
      evenAndOdd ? "<w:evenAndOddHeaders/>" : "",
      adjustTable ? "<w:adjustLineHeightInTable/>" : "",
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W_NS}">${flags}</w:settings>`;
  }

  private putImages(pack: DocxPackage, images: WrittenImage[]): void {
    for (const image of images) {
      pack.setMedia(image.path, image.base64);
    }
  }
}

function pageNumTypeXml(section: Section | undefined): string {
  if (!section || (section.pageNumFmt == null && section.pageNumStart == null)) {
    return "";
  }
  const fmt = section.pageNumFmt ? ` w:fmt="${escapeXml(section.pageNumFmt)}"` : "";
  const start = section.pageNumStart != null ? ` w:start="${section.pageNumStart}"` : "";
  return `<w:pgNumType${fmt}${start}/>`;
}

function nextId(seq: { n: number }): string {
  const id = `rId${seq.n}`;
  seq.n += 1;
  return id;
}

function relsXml(rels: WrittenRel[]): string {
  const body = rels
    .map((rel) => `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeXml(rel.target)}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}">${body}</Relationships>`;
}

function relsPath(partPath: string): string {
  const slash = partPath.lastIndexOf("/");
  const dir = partPath.slice(0, slash);
  const name = partPath.slice(slash + 1);
  return `${dir}/_rels/${name}.rels`;
}

function imageContentType(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") {
    return "image/jpeg";
  }
  if (ext === "gif") {
    return "image/gif";
  }
  if (ext === "bmp") {
    return "image/bmp";
  }
  if (ext === "webp") {
    return "image/webp";
  }
  return "image/png";
}
