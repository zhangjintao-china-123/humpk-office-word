import { describe, expect, it } from "vitest";
import { formatLevelNumber, formatOutlineLabel } from "../../src/model/style/OutlineLabel";
import type { NumberingLevel } from "../../src/model/style/Numbering";

function level(partial: Partial<NumberingLevel> & Pick<NumberingLevel, "numFmt" | "lvlText">): NumberingLevel {
  return { start: 1, ...partial };
}

describe("大纲编号符号", () => {
  it("按 lvlText 拼多级十进制", () => {
    const label = formatOutlineLabel(level({ numFmt: "decimal", lvlText: "%1.%2.%3" }), 2, 4, [1, 2], ["decimal", "decimal"]);
    expect(label).toBe("1.2.4 ");
  });

  it("中文序号、大写、圈号、罗马和字母", () => {
    expect(formatLevelNumber(11, "chineseCounting")).toBe("十一");
    expect(formatLevelNumber(21, "chineseCounting")).toBe("二十一");
    expect(formatLevelNumber(101, "chineseLegalSimplified")).toBe("壹佰零壹");
    expect(formatLevelNumber(1, "ideographTraditional")).toBe("甲");
    expect(formatLevelNumber(11, "ideographTraditional")).toBe("甲");
    expect(formatLevelNumber(1, "ideographZodiac")).toBe("子");
    expect(formatLevelNumber(1, "decimalEnclosedCircle")).toBe("①");
    expect(formatLevelNumber(20, "decimalEnclosedCircle")).toBe("⑳");
    expect(formatLevelNumber(1, "decimalEnclosedParen")).toBe("⑴");
    expect(formatLevelNumber(4, "lowerRoman")).toBe("iv");
    expect(formatLevelNumber(4, "upperRoman")).toBe("IV");
    expect(formatLevelNumber(27, "lowerLetter")).toBe("aa");
    expect(formatLevelNumber(3, "decimalZero")).toBe("03");
    expect(formatLevelNumber(11, "ideographDigital")).toBe("一一");
  });

  it("法律编号把上级也改成十进制", () => {
    const label = formatOutlineLabel(
      level({ numFmt: "chineseCounting", lvlText: "%1.%2", legal: true }),
      1,
      2,
      [3],
      ["chineseCounting"],
    );
    expect(label).toBe("3.2 ");
  });

  it("项目符号把 Wingdings 私用区换成可见符号", () => {
    const label = formatOutlineLabel(
      level({ numFmt: "bullet", lvlText: "\uF0B7", font: "Wingdings", suff: "nothing" }),
      0,
      1,
      [],
      [],
    );
    expect(label).toBe("•");
  });

  it("带括号的中文大纲", () => {
    const label = formatOutlineLabel(
      level({ numFmt: "chineseCounting", lvlText: "（%1）", suff: "nothing" }),
      0,
      2,
      [],
      [],
    );
    expect(label).toBe("（二）");
  });
});
