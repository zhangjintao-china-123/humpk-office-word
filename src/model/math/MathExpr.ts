/** 这一轮会排的公式节点。更复杂的结构在解析时收成文字。 */
export type MathExpr =
  | { type: "row"; items: MathExpr[] }
  | { type: "text"; text: string }
  | { type: "frac"; num: MathExpr; den: MathExpr }
  | { type: "sup"; base: MathExpr; sup: MathExpr }
  | { type: "sub"; base: MathExpr; sub: MathExpr }
  | { type: "subsup"; base: MathExpr; sub: MathExpr; sup: MathExpr }
  | { type: "rad"; body: MathExpr }
  | { type: "delim"; open: string; close: string; body: MathExpr };

export interface MathGlyph {
  kind: "text" | "line";
  x: number;
  y: number;
  text?: string;
  size?: number;
  x2?: number;
  y2?: number;
  width?: number;
}

/** 公式排好后的盒子。y 对文字是基线，对线段是起点。 */
export interface MathView {
  width: number;
  height: number;
  baseline: number;
  glyphs: MathGlyph[];
}
