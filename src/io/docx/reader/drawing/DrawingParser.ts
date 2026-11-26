import { EMPTY_INSETS, shapePreset, type GraphicShape, type ShapeInsets } from "../../../../model/graphic/Shape";
import { Drawing, type WrapSide, type WrapType } from "../../../../model/inline/Drawing";
import { ptToPx } from "../../../../shared/units";
import { attr, children, first, descendants, matchesName, textOf } from "../../ooxml/XmlQuery";
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
    const shape = descendants(pict, "v:shape")[0] ?? descendants(pict, "v:rect")[0] ?? descendants(pict, "v:roundrect")[0] ?? descendants(pict, "v:oval")[0];
    if (!image && !shape) {
      return undefined;
    }
    const drawing = new Drawing();
    const style = attr(shape, "style") ?? "";
    drawing.width = styleLength(style, "width") ?? 0;
    drawing.height = styleLength(style, "height") ?? 0;
    if (image) {
      this.attachRel(drawing, attr(image, "r:id"), ctx, "primary");
    }
    if (!drawing.url && !drawing.sourceUrl) {
      const graphic = this.legacyShape(shape, ctx);
      if (!graphic) {
        return undefined;
      }
      drawing.shape = graphic;
      if (graphic.text) {
        drawing.lockAspect = false;
      }
    }
    return drawing;
  }

  private parseGraphic(node: Element, ctx: ParseContext): Drawing | undefined {
    const extent = first(node, "wp:extent");
    const drawing = new Drawing();
    drawing.width = ctx.units.emuToPx(attr(extent, "cx")) ?? 0;
    drawing.height = ctx.units.emuToPx(attr(extent, "cy")) ?? 0;
    const docPr = first(node, "wp:docPr");
    const docName = attr(docPr, "name");
    if (docName) {
      drawing.name = docName;
    }
    const hidden = attr(docPr, "hidden");
    if (hidden === "1" || hidden === "true") {
      drawing.hidden = true;
    }

    const blip = descendants(node, "a:blip")[0];
    this.attachRel(drawing, attr(blip, "r:embed") ?? attr(blip, "r:link"), ctx, "primary");
    const svg = blip ? descendants(blip, "asvg:svgBlip")[0] : undefined;
    this.attachRel(drawing, attr(svg ?? null, "r:embed"), ctx, "display");
    const wsp = !drawing.url && !drawing.sourceUrl ? descendants(node, "wps:wsp")[0] : undefined;
    if (!drawing.url && !drawing.sourceUrl) {
      if (!wsp) {
        return drawing.width > 0 || drawing.height > 0 ? drawing : undefined;
      }
      drawing.shape = this.wordShape(wsp, ctx);
      if (drawing.shape.text) {
        const locks = first(first(wsp, "wps:cNvSpPr"), "a:spLocks");
        const aspect = attr(locks, "noChangeAspect");
        drawing.lockAspect = aspect === "1" || aspect === "true";
      }
      this.useShapeExtent(drawing, wsp, ctx);
    }
    const xfrm = wsp ? first(first(wsp, "wps:spPr"), "a:xfrm") : descendants(node, "a:xfrm")[0];
    if (xfrm) {
      const rot = Number(attr(xfrm, "rot"));
      if (Number.isFinite(rot) && rot !== 0) {
        const deg = Math.round((((rot / 60000) % 360) + 360) % 360 * 100) / 100;
        if (deg !== 0 && deg !== 360) {
          drawing.rotation = deg;
        }
      }
      const flipH = attr(xfrm, "flipH");
      if (flipH === "1" || flipH === "true") {
        drawing.flipH = true;
      }
      const flipV = attr(xfrm, "flipV");
      if (flipV === "1" || flipV === "true") {
        drawing.flipV = true;
      }
    }
    return drawing;
  }

  private wordShape(wsp: Element, ctx: ParseContext): GraphicShape {
    const props = first(wsp, "wps:spPr");
    const style = first(wsp, "wps:style");
    const line = first(props, "a:ln");
    const body = first(wsp, "wps:bodyPr");
    const content = first(first(wsp, "wps:txbx"), "w:txbxContent");
    const fillRef = first(style, "a:fillRef");
    const lnRef = first(style, "a:lnRef");
    const fill = first(props, "a:noFill")
      ? undefined
      : colorOf(first(props, "a:solidFill")) ?? (attr(fillRef, "idx") !== "0" ? colorOf(fillRef) : undefined);
    const lineColor = first(line, "a:noFill")
      ? undefined
      : colorOf(first(line, "a:solidFill")) ?? (attr(lnRef, "idx") !== "0" ? colorOf(lnRef) : undefined);
    const shape: GraphicShape = {
      preset: shapePreset(attr(first(props, "a:prstGeom"), "prst")),
      fill,
      line: lineColor,
      lineWidth: ctx.units.emuToPx(attr(line, "w")),
      insets: insetsOf(body, ctx),
    };
    if (content && ctx.storyParser) {
      shape.text = ctx.storyParser.parseRoot(content, ctx, "textbox");
      if (attr(body, "vert") === "eaVert") {
        shape.textDirection = "vertical";
      }
      const anchor = attr(body, "anchor");
      if (anchor === "ctr" || anchor === "b") {
        shape.textAlign = anchor === "ctr" ? "center" : "end";
      }
    }
    return shape;
  }

  private legacyShape(shape: Element | undefined, ctx: ParseContext): GraphicShape | undefined {
    if (!shape) {
      return undefined;
    }
    const content = first(descendants(shape, "v:textbox")[0] ?? null, "w:txbxContent") ?? descendants(shape, "w:txbxContent")[0];
    const graphic: GraphicShape = {
      preset: legacyPreset(shape),
      fill: cssColor(attr(shape, "fillcolor")),
      line: cssColor(attr(shape, "strokecolor")),
      lineWidth: styleLength(attr(shape, "style") ?? "", "strokeweight"),
      insets: legacyInsets(attr(descendants(shape, "v:textbox")[0] ?? null, "inset")),
    };
    if (content && ctx.storyParser) {
      graphic.text = ctx.storyParser.parseRoot(content, ctx, "textbox");
    }
    return graphic;
  }

  private useShapeExtent(drawing: Drawing, wsp: Element, ctx: ParseContext): void {
    if (drawing.width > 0 && drawing.height > 0) {
      return;
    }
    const ext = first(first(first(wsp, "wps:spPr"), "a:xfrm"), "a:ext");
    if (!ext) {
      return;
    }
    drawing.width = drawing.width || ctx.units.emuToPx(attr(ext, "cx")) || 0;
    drawing.height = drawing.height || ctx.units.emuToPx(attr(ext, "cy")) || 0;
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
    const relHeight = Number(attr(anchor, "relativeHeight"));
    const set: NonNullable<Drawing["anchorSet"]> = {
      behind: attr(anchor, "behindDoc") === "1",
      zIndex: Number.isFinite(relHeight) && attr(anchor, "relativeHeight") ? relHeight : undefined,
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

const SCHEME: Record<string, string> = {
  dk1: "#000000",
  lt1: "#FFFFFF",
  dk2: "#44546A",
  lt2: "#E7E6E6",
  tx1: "#000000",
  bg1: "#FFFFFF",
  tx2: "#44546A",
  bg2: "#E7E6E6",
  accent1: "#5B9BD5",
  accent2: "#ED7D31",
  accent3: "#A9D08E",
  accent4: "#FFC000",
  accent5: "#4472C4",
  accent6: "#70AD47",
};

const PRESET_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  green: "#008000",
  blue: "#0000FF",
  yellow: "#FFFF00",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  gray: "#808080",
  grey: "#808080",
  dkGray: "#A9A9A9",
  darkGray: "#A9A9A9",
  ltGray: "#D3D3D3",
  lightGray: "#D3D3D3",
  dkRed: "#8B0000",
  darkRed: "#8B0000",
  dkGreen: "#006400",
  darkGreen: "#006400",
  dkBlue: "#00008B",
  darkBlue: "#00008B",
  dkCyan: "#008B8B",
  darkCyan: "#008B8B",
  dkMagenta: "#8B008B",
  darkMagenta: "#8B008B",
  dkYellow: "#808000",
  orange: "#FFA500",
  purple: "#800080",
  silver: "#C0C0C0",
  navy: "#000080",
  teal: "#008080",
};

function colorOf(fill: Element | null): string | undefined {
  if (!fill) {
    return undefined;
  }
  const srgb = attr(first(fill, "a:srgbClr"), "val");
  if (srgb) {
    return `#${srgb}`;
  }
  const scheme = attr(first(fill, "a:schemeClr"), "val");
  if (scheme && SCHEME[scheme]) {
    return SCHEME[scheme];
  }
  const prst = attr(first(fill, "a:prstClr"), "val");
  if (prst && PRESET_COLORS[prst]) {
    return PRESET_COLORS[prst];
  }
  const sys = first(fill, "a:sysClr");
  if (sys) {
    const last = attr(sys, "lastClr");
    if (last) {
      return `#${last}`;
    }
    const val = attr(sys, "val");
    if (val === "windowText") {
      return "#000000";
    }
    if (val === "window") {
      return "#FFFFFF";
    }
  }
  const scrgb = first(fill, "a:scrgbClr");
  if (scrgb) {
    const ch = (name: string) => {
      const pct = Number(attr(scrgb, name) ?? "0") / 100000;
      return Math.max(0, Math.min(255, Math.round(pct * 255)))
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
    };
    return `#${ch("r")}${ch("g")}${ch("b")}`;
  }
  return undefined;
}

function insetsOf(body: Element | null, ctx: ParseContext): ShapeInsets {
  if (!body) {
    return { ...EMPTY_INSETS };
  }
  const emu = (name: string) => ctx.units.emuToPx(attr(body, name)) ?? 0;
  return { left: emu("lIns"), top: emu("tIns"), right: emu("rIns"), bottom: emu("bIns") };
}

function legacyPreset(shape: Element): GraphicShape["preset"] {
  if (matchesName(shape, "v:oval")) {
    return "ellipse";
  }
  if (matchesName(shape, "v:roundrect")) {
    return "roundRect";
  }
  if (matchesName(shape, "v:line")) {
    return "line";
  }
  return "rect";
}

function cssColor(value: string | undefined): string | undefined {
  if (!value || value === "none") {
    return undefined;
  }
  return value.startsWith("#") ? value : undefined;
}

function legacyInsets(value: string | undefined): ShapeInsets {
  if (!value) {
    return { left: 6, top: 4, right: 6, bottom: 4 };
  }
  const parts = value.split(",").map((part) => {
    const token = /^(-?[\d.]+)\s*(pt|px)?$/i.exec(part.trim());
    if (!token) {
      return 4;
    }
    const amount = Number(token[1]);
    return (token[2] ?? "pt").toLowerCase() === "pt" ? ptToPx(amount) : amount;
  });
  return {
    left: parts[0] ?? 4,
    top: parts[1] ?? parts[0] ?? 4,
    right: parts[2] ?? parts[0] ?? 4,
    bottom: parts[3] ?? parts[1] ?? parts[0] ?? 4,
  };
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
