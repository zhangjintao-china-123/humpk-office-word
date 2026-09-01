import { describe, expect, it } from "vitest";
import { Word } from "../../src/model/inline/Word";
import { Block } from "../../src/model/block/Block";
import { MeasurePass } from "../../src/layout/measure/MeasurePass";
import type { ITextMeasurer } from "../../src/layout/measure/ITextMeasurer";

describe("MeasurePass", () => {
  it("东亚字符宽度不低于字号，避免 canvas 测得过窄", () => {
    const measurer: ITextMeasurer = {
      measure: () => 10,
    };
    const word = new Word();
    word.char = "汉";
    word.intChar = 0x6c49;
    word.block = new Block();
    word.block.style = { fontSizePx: 18.666 };
    new MeasurePass().measureWord(word, measurer);
    expect(word.width).toBeCloseTo(18.666, 5);
    expect(word.kernedWidth).toBeCloseTo(18.666, 5);
  });
});
