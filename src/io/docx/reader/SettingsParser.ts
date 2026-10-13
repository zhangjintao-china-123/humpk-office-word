import { parseNumber } from "../../../shared/units";
import { attr, descendants, parseXml } from "../ooxml/XmlQuery";

export interface SettingsFlags {
  adjustLineHeightInTable: boolean;
  evenAndOddHeaders: boolean;
  defaultTabStopTwip?: number;
}

export class SettingsParser {
  parse(xml: string | undefined): SettingsFlags {
    if (!xml) {
      return { adjustLineHeightInTable: false, evenAndOddHeaders: false };
    }
    const doc = parseXml(xml);
    return {
      adjustLineHeightInTable: this.onOff(descendants(doc.documentElement, "w:adjustLineHeightInTable")[0]),
      evenAndOddHeaders: this.onOff(descendants(doc.documentElement, "w:evenAndOddHeaders")[0]),
      defaultTabStopTwip: parseNumber(attr(descendants(doc.documentElement, "w:defaultTabStop")[0], "w:val")),
    };
  }

  private onOff(flag: Element | undefined): boolean {
    if (!flag) {
      return false;
    }
    const value = attr(flag, "w:val");
    return value == null || value === "1" || value === "on" || value === "true";
  }
}
