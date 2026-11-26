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

  it("带圈字符按缩小文字与增大圈号分别测量宽高并保证圈内字宽不溢框", () => {
    const measurer: ITextMeasurer = {
      measure: (text) => text.length * 10,
    };

    const shrinkWord = new Word();
    shrinkWord.char = "字";
    shrinkWord.block = new Block();
    shrinkWord.block.text = "字";
    shrinkWord.block.style = { fontSizePx: 16 };
    shrinkWord.block.enclosed = { shape: "circle", mode: "shrink" };
    new MeasurePass().measureWord(shrinkWord, measurer);
    expect(shrinkWord.width).toBeGreaterThanOrEqual(16);
    expect(shrinkWord.height).toBeCloseTo(shrinkWord.width, 5);

    const enlargeWord = new Word();
    enlargeWord.char = "12";
    enlargeWord.block = new Block();
    enlargeWord.block.text = "12";
    enlargeWord.block.style = { fontSizePx: 16 };
    enlargeWord.block.enclosed = { shape: "square", mode: "enlarge" };
    new MeasurePass().measureWord(enlargeWord, measurer);
    expect(enlargeWord.width).toBeGreaterThan(shrinkWord.width);
    expect(enlargeWord.height).toBeCloseTo(enlargeWord.width, 5);
  });

  it("中文版式按调整宽度/双行合一/纵横混排测量尺寸", () => {
    const measurer: ITextMeasurer = {
      measure: (text) => text.length * 10,
    };

    const fit = new Word();
    fit.char = "调整";
    fit.block = new Block();
    fit.block.text = "调整";
    fit.block.style = { fontSizePx: 16 };
    fit.block.asianLayout = { kind: "fitWidth", fitWidthPx: 72 };
    new MeasurePass().measureWord(fit, measurer);
    expect(fit.width).toBeCloseTo(72, 5);

    const two = new Word();
    two.char = "双行合一";
    two.block = new Block();
    two.block.text = "双行合一";
    two.block.style = { fontSizePx: 16 };
    two.block.asianLayout = { kind: "twoInOne", brackets: "round" };
    new MeasurePass().measureWord(two, measurer);
    expect(two.width).toBeGreaterThanOrEqual(16);

    const tate = new Word();
    tate.char = "2026";
    tate.block = new Block();
    tate.block.text = "2026";
    tate.block.style = { fontSizePx: 16 };
    tate.block.asianLayout = { kind: "tatechuyoko", compress: true };
    new MeasurePass().measureWord(tate, measurer);
    expect(tate.width).toBeLessThanOrEqual(16 * 1.35 + 0.01);
  });
});
