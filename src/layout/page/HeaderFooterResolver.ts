import { Block } from "../../model/block/Block";
import { Paragraph } from "../../model/block/Paragraph";
import { Document } from "../../model/document/Document";
import type { HeaderFooterType } from "../../model/document/DocumentKind";
import type { Section } from "../../model/document/Section";

/**
 * 按节内页序号（从 1 计，与印刷页码无关）选出 first / even / default。
 * 缺 first/even 且对应开关打开时，继承上一节或补空白，不用 default 顶替。
 */
export class HeaderFooterResolver {
  static typeForPage(
    section: Section | undefined,
    pageInSection: number,
    evenAndOdd: boolean,
  ): HeaderFooterType {
    if (pageInSection <= 1 && section?.titlePg) {
      return "first";
    }
    if (evenAndOdd && pageInSection % 2 === 0) {
      return "even";
    }
    return "default";
  }

  static inherit(document: Document): void {
    this.inheritSlot(document.sections, "headers", "header", document.evenAndOddHeaders);
    this.inheritSlot(document.sections, "footers", "footer", document.evenAndOddHeaders);
  }

  private static inheritSlot(
    sections: Section[],
    mapKey: "headers" | "footers",
    kind: "header" | "footer",
    evenAndOdd: boolean,
  ): void {
    let lastDefault: Document | undefined;
    let lastFirst: Document | undefined;
    let lastEven: Document | undefined;

    for (const section of sections) {
      const map = section[mapKey];
      const currentDefault = map.get("default");
      if (currentDefault) {
        lastDefault = currentDefault;
      } else if (lastDefault) {
        map.set("default", lastDefault);
      }

      if (section.titlePg) {
        const currentFirst = map.get("first");
        if (currentFirst) {
          lastFirst = currentFirst;
        } else {
          lastFirst ??= emptyStory(kind);
          map.set("first", lastFirst);
        }
      }

      if (evenAndOdd) {
        const currentEven = map.get("even");
        if (currentEven) {
          lastEven = currentEven;
        } else {
          lastEven ??= emptyStory(kind);
          map.set("even", lastEven);
        }
      }
    }
  }
}

function emptyStory(kind: "header" | "footer"): Document {
  const document = new Document();
  document.kind = kind;
  const paragraph = new Paragraph(1);
  paragraph.addBlock(new Block());
  document.addParagraph(paragraph);
  return document;
}
