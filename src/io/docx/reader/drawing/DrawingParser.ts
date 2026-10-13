import { Drawing, type WrapSide, type WrapType } from "../../../../model/inline/Drawing";
import { ptToPx } from "../../../../shared/units";
import { attr, children, first, descendants, textOf } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";
import { resolveImage } from "./RasterImage";

export class DrawingParser {
  parse(drawingNode: Element, ctx: ParseContext): Drawing | undefined {
    const inline = first(drawingNode, "wp:inline");
    if (inline) {
      const drawing = this.parseGraphic(inline, ctx);
      if (drawing) {
        drawing.position = "inline";
      }
      return drawing;
    }

    const anchor = first(drawingNode, "wp:anchor");
    if (anchor) {
      const drawing = this.parseGraphic(anchor, ctx);
      if (drawing) {
        drawing.position = "anchor";
        drawing.anchorSet = this.parseAnchor(anchor, ctx);
      }
      return drawing;
    }
    return undefined;
  }

  /** 旧版 w:pict / v:imagedata。尺寸写在 style 里，单位通常是磅。 */
  parsePict(pict: Element, ctx: ParseContext): Drawing | undefined {
    const image = descendants(pict, "v:imagedata")[0];
    if (!image) {
      return undefined;
    }
    const drawing = new Drawing();
    const shape = descendants(pict, "v:shape")[0] ?? descendants(pict, "v:rect")[0];
    const style = attr(shape, "style") ?? "";
    drawing.width = styleLength(style, "width") ?? 0;
    drawing.height = styleLength(style, "height") ?? 0;
    this.attachRel(drawing, attr(image, "r:id"), ctx, "primary");
    if (!drawing.url && !drawing.sourceUrl) {
      return undefined;
    }
    return drawing;
  }

  private parseGraphic(node: Element, ctx: ParseContext): Drawing | undefined {
    const extent = first(node, "wp:extent");
    const drawing = new Drawing();
    drawing.width = ctx.units.emuToPx(attr(extent, "cx")) ?? 0;
    drawing.height = ctx.units.emuToPx(attr(extent, "cy")) ?? 0;

    const blip = descendants(node, "a:blip")[0];
    this.attachRel(drawing, attr(blip, "r:embed") ?? attr(blip, "r:link"), ctx, "primary");
    const svg = blip ? descendants(blip, "asvg:svgBlip")[0] : undefined;
    this.attachRel(drawing, attr(svg ?? null, "r:embed"), ctx, "display");
    return drawing;
  }

  private attachRel(drawing: Drawing, relId: string | undefined, ctx: ParseContext, role: "primary" | "display"): void {
    const media = mediaOf(relId, ctx);
    if (!media) {
      return;
    }
    const resolved = resolveImage(media.ext, media.data);
    if (role === "primary") {
      drawing.sourceUrl = resolved.source;
      if (resolved.display) {
        drawing.url = resolved.display;
      }
      return;
    }
    if (resolved.display) {
      drawing.url = resolved.display;
    }
  }

  private parseAnchor(anchor: Element, ctx: ParseContext) {
    const set: NonNullable<Drawing["anchorSet"]> = {
      behind: attr(anchor, "behindDoc") === "1",
      distLeft: ctx.units.emuToPx(attr(anchor, "distL")) ?? 0,
      distRight: ctx.units.emuToPx(attr(anchor, "distR")) ?? 0,
      distTop: ctx.units.emuToPx(attr(anchor, "distT")) ?? 0,
      distBottom: ctx.units.emuToPx(attr(anchor, "distB")) ?? 0,
    };

    const posH = first(anchor, "wp:positionH");
    if (posH) {
      set.leftFrom = attr(posH, "relativeFrom");
      set.left = ctx.units.emuToPx(textOf(first(posH, "wp:posOffset")));
      set.leftAlign = attr(first(posH, "wp:align"), "w:val") || textOf(first(posH, "wp:align")) || undefined;
    }
    const posV = first(anchor, "wp:positionV");
    if (posV) {
      set.topFrom = attr(posV, "relativeFrom");
      set.top = ctx.units.emuToPx(textOf(first(posV, "wp:posOffset")));
      set.topAlign = attr(first(posV, "wp:align"), "w:val") || textOf(first(posV, "wp:align")) || undefined;
    }

    const wrap = this.parseWrap(anchor, ctx);
    set.wrapType = wrap.type;
    set.wrapSide = wrap.side;
    set.polygon = wrap.polygon;
    return set;
  }

  private parseWrap(
    anchor: Element,
    ctx: ParseContext,
  ): { type: WrapType; side?: WrapSide; polygon?: { x: number; y: number }[] } {
    if (first(anchor, "wp:wrapTopAndBottom")) {
      return { type: "nowrap" };
    }
    if (first(anchor, "wp:wrapNone")) {
      return { type: "none" };
    }
    const square = first(anchor, "wp:wrapSquare");
    if (square) {
      return { type: "square", side: this.wrapSide(attr(square, "wrapText")) };
    }
    const tight = first(anchor, "wp:wrapTight");
    if (tight) {
      return { type: "tight", side: this.wrapSide(attr(tight, "wrapText")), polygon: this.parsePolygon(tight, ctx) };
    }
    const through = first(anchor, "wp:wrapThrough");
    if (through) {
      return {
        type: "through",
        side: this.wrapSide(attr(through, "wrapText")),
        polygon: this.parsePolygon(through, ctx),
      };
    }
    return { type: "square" };
  }

  private parsePolygon(wrap: Element, ctx: ParseContext): { x: number; y: number }[] | undefined {
    const polygon = first(wrap, "wp:wrapPolygon");
    if (!polygon) {
      return undefined;
    }
    const start = first(polygon, "wp:start");
    const points = [start, ...children(polygon, "wp:lineTo")]
      .filter((node): node is Element => node != null)
      .map((node) => ({
        x: ctx.units.emuToPx(attr(node, "x")) ?? 0,
        y: ctx.units.emuToPx(attr(node, "y")) ?? 0,
      }));
    return points.length >= 3 ? points : undefined;
  }

  private wrapSide(value: string | undefined): WrapSide | undefined {
    if (value === "left") {
      return "left";
    }
    if (value === "right") {
      return "right";
    }
    if (value === "largest") {
      return "largest";
    }
    if (value === "bothSides") {
      return "both";
    }
    return undefined;
  }
}

function mediaOf(relId: string | undefined, ctx: ParseContext): { ext: string; data: string } | undefined {
  if (!relId) {
    return undefined;
  }
  const target = ctx.relationships.get(relId);
  if (!target || target.includes("://")) {
    return undefined;
  }
  const path = target.startsWith("word/") || target.startsWith("/") ? target.replace(/^\//, "") : `word/${target.replace(/^\.\//, "")}`;
  const data = ctx.pack?.mediaBase64(path);
  if (!data) {
    return undefined;
  }
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return { ext, data };
}

function styleLength(style: string, name: string): number | undefined {
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(style);
  if (!match) {
    return undefined;
  }
  const token = /^(-?[\d.]+)\s*(pt|px|in|cm|mm|pc)?$/i.exec(match[1].trim());
  if (!token) {
    return undefined;
  }
  const value = Number(token[1]);
  const unit = (token[2] ?? "px").toLowerCase();
  if (unit === "pt") {
    return ptToPx(value);
  }
  if (unit === "in") {
    return value * 96;
  }
  if (unit === "cm") {
    return (value * 96) / 2.54;
  }
  if (unit === "mm") {
    return (value * 96) / 25.4;
  }
  if (unit === "pc") {
    return ptToPx(value * 12);
  }
  return value;
}
