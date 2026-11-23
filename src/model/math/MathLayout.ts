import type { RunStyle } from "../style/RunStyle";
import { fontSizeOf } from "../../layout/measure/FontSpec";
import type { ITextMeasurer } from "../../layout/measure/ITextMeasurer";
import type { MathExpr, MathGlyph, MathView } from "./MathExpr";

export function layoutMath(expr: MathExpr, measurer: ITextMeasurer, style: RunStyle | undefined): MathView {
  return layout(expr, measurer, Math.max(8, fontSizeOf(style)));
}

function layout(expr: MathExpr, measurer: ITextMeasurer, size: number): MathView {
  switch (expr.type) {
    case "text":
      return layoutText(expr.text, measurer, size);
    case "row":
      return layoutRow(expr.items, measurer, size);
    case "frac":
      return layoutFrac(expr.num, expr.den, measurer, size);
    case "sup":
      return layoutScript(expr.base, expr.sup, undefined, measurer, size);
    case "sub":
      return layoutScript(expr.base, undefined, expr.sub, measurer, size);
    case "subsup":
      return layoutScript(expr.base, expr.sup, expr.sub, measurer, size);
    case "rad":
      return layoutRadical(expr.body, measurer, size);
    case "delim":
      return layoutDelim(expr.open, expr.close, expr.body, measurer, size);
    default:
      return empty(size);
  }
}

function layoutText(text: string, measurer: ITextMeasurer, size: number): MathView {
  const shown = text || "";
  const width = shown
    ? measurer.measure(shown, { fontSizePx: size, italic: true }, shown.codePointAt(0) ?? 0)
    : size * 0.4;
  const height = size * 1.25;
  const baseline = size;
  return {
    width: Math.max(width, size * 0.3),
    height,
    baseline,
    glyphs: shown ? [{ kind: "text", x: 0, y: baseline, text: shown, size }] : [],
  };
}

function layoutRow(items: MathExpr[], measurer: ITextMeasurer, size: number): MathView {
  if (!items.length) {
    return empty(size);
  }
  const boxes = items.map((item) => layout(item, measurer, size));
  return alignRow(boxes, size * 0.15);
}

function alignRow(boxes: MathView[], gap: number): MathView {
  const baseline = Math.max(...boxes.map((box) => box.baseline));
  const descent = Math.max(...boxes.map((box) => box.height - box.baseline));
  const glyphs: MathGlyph[] = [];
  let x = 0;
  boxes.forEach((box, index) => {
    const shift = baseline - box.baseline;
    for (const glyph of box.glyphs) {
      glyphs.push(move(glyph, x, shift));
    }
    x += box.width;
    if (index < boxes.length - 1) {
      x += gap;
    }
  });
  return { width: x, height: baseline + descent, baseline, glyphs };
}

function layoutFrac(num: MathExpr, den: MathExpr, measurer: ITextMeasurer, size: number): MathView {
  const over = layout(num, measurer, size * 0.72);
  const under = layout(den, measurer, size * 0.72);
  const pad = size * 0.35;
  const gap = size * 0.28;
  const width = Math.max(over.width, under.width) + pad;
  const bar = over.height + gap / 2;
  const height = over.height + gap + under.height;
  const glyphs: MathGlyph[] = [];
  shift(glyphs, over, (width - over.width) / 2, 0);
  glyphs.push({ kind: "line", x: pad / 2, y: bar, x2: width - pad / 2, y2: bar, width: Math.max(1, size * 0.06) });
  shift(glyphs, under, (width - under.width) / 2, over.height + gap);
  return { width, height, baseline: bar, glyphs };
}

function layoutScript(
  baseExpr: MathExpr,
  supExpr: MathExpr | undefined,
  subExpr: MathExpr | undefined,
  measurer: ITextMeasurer,
  size: number,
): MathView {
  const base = layout(baseExpr, measurer, size);
  const sup = supExpr ? layout(supExpr, measurer, size * 0.65) : undefined;
  const sub = subExpr ? layout(subExpr, measurer, size * 0.65) : undefined;
  const rise = size * 0.45;
  const drop = base.height - size * 0.15;
  const scriptWidth = Math.max(sup?.width ?? 0, sub?.width ?? 0);
  const top = sup ? Math.max(0, rise) : 0;
  const glyphs: MathGlyph[] = [];
  shift(glyphs, base, 0, top);
  if (sup) {
    shift(glyphs, sup, base.width + size * 0.05, Math.max(0, top + base.baseline - rise - sup.height));
  }
  if (sub) {
    shift(glyphs, sub, base.width + size * 0.05, top + drop);
  }
  const height = Math.max(top + base.height, sub ? top + drop + sub.height : 0, sup ? sup.height : 0);
  return { width: base.width + scriptWidth + size * 0.08, height, baseline: top + base.baseline, glyphs };
}

function layoutRadical(bodyExpr: MathExpr, measurer: ITextMeasurer, size: number): MathView {
  const body = layout(bodyExpr, measurer, size);
  const hook = size * 0.55;
  const lift = size * 0.18;
  const width = body.width + hook + size * 0.2;
  const height = body.height + lift;
  const glyphs: MathGlyph[] = [];
  const thick = Math.max(1, size * 0.06);
  glyphs.push({ kind: "line", x: size * 0.05, y: height * 0.72, x2: hook * 0.45, y2: height - size * 0.05, width: thick });
  glyphs.push({ kind: "line", x: hook * 0.45, y: height - size * 0.05, x2: hook, y2: lift * 0.4, width: thick });
  glyphs.push({ kind: "line", x: hook, y: lift * 0.4, x2: width - size * 0.05, y2: lift * 0.4, width: thick });
  shift(glyphs, body, hook + size * 0.08, lift);
  return { width, height, baseline: body.baseline + lift, glyphs };
}

function layoutDelim(open: string, close: string, bodyExpr: MathExpr, measurer: ITextMeasurer, size: number): MathView {
  const body = layout(bodyExpr, measurer, size);
  const left = layoutText(open || "(", measurer, size);
  const right = layoutText(close || ")", measurer, size);
  return alignRow([left, body, right], size * 0.06);
}

function shift(target: MathGlyph[], box: MathView, dx: number, dy: number): void {
  for (const glyph of box.glyphs) {
    target.push(move(glyph, dx, dy));
  }
}

function move(glyph: MathGlyph, dx: number, dy: number): MathGlyph {
  return {
    ...glyph,
    x: glyph.x + dx,
    y: glyph.y + dy,
    x2: glyph.x2 == null ? undefined : glyph.x2 + dx,
    y2: glyph.y2 == null ? undefined : glyph.y2 + dy,
  };
}

function empty(size: number): MathView {
  return { width: size * 0.4, height: size * 1.25, baseline: size, glyphs: [] };
}
