export interface NumberingLevel {
  start: number;
  numFmt: string;
  lvlText: string;
  lvlJc?: string;
}

export interface TitleSerial extends NumberingLevel {
  serial: number;
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
}
