import { describe, expect, it } from "vitest";
import { LinePositioner } from "../../src/layout/line/LinePositioner";
import { Paragraph } from "../../src/model/block/Paragraph";
import { Word } from "../../src/model/inline/Word";
import { Line } from "../../src/model/line/Line";
import { LinkedList } from "../../src/model/list/LinkedList";

describe("制表位", () => {
  it("中部和对齐把制表符后面的文字放到停止位上", () => {
    const chars = [
      word("左", 40),
      word("\t", 8),
      word("中", 20),
      word("\t", 8),
      word("右", 20),
    ];
    const list = new LinkedList<Word>();
    for (const item of chars) {
      list.append(item);
    }
    const line = new Line();
    line.startNode = list.head;
    line.length = chars.length;
    const paragraph = new Paragraph(1);
    paragraph.attrs.tabs = [
      { posPx: 276, val: "center" },
      { posPx: 553, val: "right" },
    ];
    line.paragraph = paragraph;
    new LinePositioner().place(line, 600);
    expect(chars[2].left).toBeCloseTo(266, 0);
    expect(chars[4].left + chars[4].kernedWidth).toBeCloseTo(553, 0);
  });
});

function word(char: string, width: number): Word {
  const item = new Word();
  item.char = char;
  item.kernedWidth = width;
  item.width = width;
  item.height = 16;
  return item;
}
