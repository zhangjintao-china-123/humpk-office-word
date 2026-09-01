import { Drawing, type WrapSide, type WrapType } from "../../../../model/inline/Drawing";
import { attr, children, first, descendants, textOf } from "../../ooxml/XmlQuery";
import type { ParseContext } from "../ParseContext";

const IMAGE_TYPES = ["png", "jpg", "jpeg", "gif", "bmp", "webp"];

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

  private parseGraphic(node: Element, ctx: ParseContext): Drawing | undefined {
    const extent = first(node, "wp:extent");
    const drawing = new Drawing();
    drawing.width = ctx.units.emuToPx(attr(extent, "cx")) ?? 0;
    drawing.height = ctx.units.emuToPx(attr(extent, "cy")) ?? 0;

    const blip = descendants(node, "a:blip")[0];
    const embedId = attr(blip, "r:embed");
    if (embedId) {
      const target = ctx.relationships.get(embedId);
      if (target) {
        const path = target.startsWith("word/") ? target : `word/${target}`;
        const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
        const data = ctx.pack?.mediaBase64(path);
        if (data && IMAGE_TYPES.some((type) => ext.includes(type))) {
          const mime = ext === "jpg" ? "jpeg" : ext;
          drawing.url = `data:image/${mime};base64,${data}`;
        }
      }
    }
    return drawing;
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
    if (value === "bothSides" || value === "largest") {
      return "both";
    }
    return undefined;
  }
}
