export interface NumberingLevel {
  start: number;
  numFmt: string;
  lvlText: string;
  lvlJc?: string;
  /** 为真时各级占位都按十进制输出。 */
  legal?: boolean;
  /** tab / space / nothing */
  suff?: string;
  font?: string;
  ilvl?: number;
  leftTwip?: number;
  leftChars?: number;
  rightTwip?: number;
  rightChars?: number;
  firstLineTwip?: number;
  firstLineChars?: number;
  hangingTwip?: number;
  hangingChars?: number;
}

export interface TitleSerial extends NumberingLevel {
  serial: number;
  ilvl: number;
  /** 已经按 numFmt 和 lvlText 换好的大纲符号，例如 1.2、（一）、①。 */
  label: string;
  [key: `lvl_${number}`]: number;
}

export class Numbering {
  private levels = new Map<string, NumberingLevel>();

  setLevel(numId: string, ilvl: string, level: NumberingLevel): void {
    this.levels.set(`${numId}#${ilvl}`, level);
  }

  getLevel(numId: string, ilvl: string): NumberingLevel | undefined {
    return this.levels.get(`${numId}#${ilvl}`);
  }

  entries(): { numId: string; ilvl: string; level: NumberingLevel }[] {
    const result: { numId: string; ilvl: string; level: NumberingLevel }[] = [];
    for (const [key, level] of this.levels) {
      const split = key.indexOf("#");
      if (split < 0) {
        continue;
      }
      result.push({ numId: key.slice(0, split), ilvl: key.slice(split + 1), level });
    }
    return result;
  }
}
