import { DEFAULT_SHAPE_LINE_WIDTH, type GraphicShape } from "../../../../model/graphic/Shape";
import type { Drawing } from "../../../../model/inline/Drawing";
import { drawingOutline, WORD_WRAP_EXTENT } from "../../../../model/graphic/DrawingOutline";
import { pxToEmu } from "../../../../shared/units";
import { escapeXml, hexColor } from "../../ooxml/XmlEscape";
import { pictureFormatXml } from "../../ooxml/PictureFormatXml";
import type { PartAssets } from "../package/PartAssets";
import { StorySerializer } from "../story/StorySerializer";

export class DrawingSerializer {
  private docPr = 1;

  serialize(drawing: Drawing, assets: PartAssets | undefined): string | undefined {
    const cx = pxToEmu(drawing.width);
    const cy = pxToEmu(drawing.height);
    if (drawing.shape) {
      const graphic = this.shapeGraphic(drawing, drawing.shape, cx, cy, assets);
      const body =
        drawing.position === "anchor"
          ? this.anchor(drawing, cx, cy, graphic)
          : `<wp:inline><wp:extent cx="${cx}" cy="${cy}"/>${this.docName(drawing)}${graphic}</wp:inline>`;
      return `<w:r><w:drawing>${body}</w:drawing></w:r>`;
    }
    const relId = assets?.embedImage(drawing.sourceUrl ?? drawing.url);
    if (!relId) {
      return undefined;
    }
    const xfrm = this.xfrmAttrs(drawing);
    const format = pictureFormatXml(drawing.pictureAppearance);
    const locks = `<a:picLocks noChangeAspect="${drawing.lockAspect ? 1 : 0}"/>`;
    const graphic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name=""/><pic:cNvPicPr>${locks}</pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}">${format.blip}</a:blip>${format.crop}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm${xfrm}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>${format.geometry}${format.properties}</pic:spPr></pic:pic></a:graphicData></a:graphic>`;
    const body =
      drawing.position === "anchor"
        ? this.anchor(drawing, cx, cy, graphic)
        : `<wp:inline><wp:extent cx="${cx}" cy="${cy}"/>${this.docName(drawing)}${graphic}</wp:inline>`;
    return `<w:r><w:drawing>${body}</w:drawing></w:r>`;
  }

  private shapeGraphic(
    drawing: Drawing,
    shape: GraphicShape,
    cx: number,
    cy: number,
    assets: PartAssets | undefined,
  ): string {
    const preset = shape.preset === "unknown" ? "rect" : shape.preset;
    const fill = hexColor(shape.fill);
    const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : "<a:noFill/>";
    const line = hexColor(shape.line);
    const lineWidth = shape.lineWidth || (shape.text ? DEFAULT_SHAPE_LINE_WIDTH : 1);
    const lineFill = line ? `<a:solidFill><a:srgbClr val="${line}"/></a:solidFill>` : "<a:noFill/>";
    const lineXml = line || shape.text ? `<a:ln w="${pxToEmu(lineWidth)}">${lineFill}</a:ln>` : "";
    const text = shape.text
      ? `<wps:txbx><w:txbxContent>${new StorySerializer(assets).serializeBody(shape.text)}</w:txbxContent></wps:txbx>`
      : "";
    const locks = drawing.lockAspect ? '<a:spLocks noChangeAspect="1"/>' : "";
    const nonVisual = shape.text ? `<wps:cNvSpPr txBox="1">${locks}</wps:cNvSpPr>` : "<wps:cNvSpPr/>";
    const vertical = shape.textDirection === "vertical" ? ' vert="eaVert"' : "";
    const anchor = shape.textAlign === "center" ? ' anchor="ctr"' : shape.textAlign === "end" ? ' anchor="b"' : "";
    const insets = `lIns="${pxToEmu(shape.insets.left)}" tIns="${pxToEmu(shape.insets.top)}" rIns="${pxToEmu(shape.insets.right)}" bIns="${pxToEmu(shape.insets.bottom)}"`;
    const xfrm = this.xfrmAttrs(drawing);
    return `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>${nonVisual}<wps:spPr><a:xfrm${xfrm}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>${fillXml}${lineXml}</wps:spPr>${text}<wps:bodyPr ${insets}${vertical}${anchor}/></wps:wsp></a:graphicData></a:graphic>`;
  }

  private xfrmAttrs(drawing: Drawing): string {
    const parts: string[] = [];
    const rot = drawing.rotation ? Math.round((((drawing.rotation % 360) + 360) % 360) * 60000) : 0;
    if (rot) {
      parts.push(`rot="${rot}"`);
    }
    if (drawing.flipH) {
      parts.push('flipH="1"');
    }
    if (drawing.flipV) {
      parts.push('flipV="1"');
    }
    return parts.length ? ` ${parts.join(" ")}` : "";
  }

  private docName(drawing: Drawing, id = this.nextId()): string {
    const fallback = drawing.shape?.text ? `Text Box ${id}` : drawing.shape ? `Shape ${id}` : `Picture ${id}`;
    const name = escapeXml(drawing.name || fallback);
    const hidden = drawing.hidden ? ' hidden="1"' : "";
    const description = drawing.description ? ` descr="${escapeXml(drawing.description)}"` : "";
    return `<wp:docPr id="${id}" name="${name}"${hidden}${description}/>`;
  }

  private nextId(): number {
    const id = this.docPr;
    this.docPr += 1;
    return id;
  }

  private anchor(drawing: Drawing, cx: number, cy: number, graphic: string): string {
    const set = drawing.anchorSet;
    const id = this.nextId();
    const behind = set?.behind ? "1" : "0";
    const relHeight = set?.zIndex != null && Number.isFinite(set.zIndex) ? Math.round(set.zIndex) : id;
    const dist = `distT="${pxToEmu(set?.distTop ?? 0)}" distB="${pxToEmu(set?.distBottom ?? 0)}" distL="${pxToEmu(set?.distLeft ?? 0)}" distR="${pxToEmu(set?.distRight ?? 0)}"`;
    const simple = set?.simplePosition;
    const effects = set?.effectExtent;
    const effect = effects ? `<wp:effectExtent l="${pxToEmu(effects.left)}" t="${pxToEmu(effects.top)}" r="${pxToEmu(effects.right)}" b="${pxToEmu(effects.bottom)}"/>` : "";
    return `<wp:anchor behindDoc="${behind}" ${dist} simplePos="${simple ? 1 : 0}" relativeHeight="${relHeight}" locked="0" layoutInCell="${set?.layoutInCell === false ? 0 : 1}" allowOverlap="${set?.allowOverlap === false ? 0 : 1}"><wp:simplePos x="${pxToEmu(simple?.x ?? 0)}" y="${pxToEmu(simple?.y ?? 0)}"/>${this.axis("wp:positionH", set?.leftFrom ?? "column", set?.left, set?.leftAlign)}${this.axis("wp:positionV", set?.topFrom === "character" ? "line" : set?.topFrom ?? "paragraph", set?.top, set?.topAlign)}<wp:extent cx="${cx}" cy="${cy}"/>${effect}${this.wrap(drawing)}${this.docName(drawing, id)}${graphic}</wp:anchor>`;
  }

  private axis(tag: string, from: string, offset: number | undefined, align: string | undefined): string {
    const body =
      align ? `<wp:align>${align}</wp:align>` : `<wp:posOffset>${pxToEmu(offset ?? 0)}</wp:posOffset>`;
    return `<${tag} relativeFrom="${from}">${body}</${tag}>`;
  }

  private wrap(drawing: Drawing): string {
    const type = drawing.anchorSet?.wrapType ?? "none";
    const side = drawing.anchorSet?.wrapSide;
    if (type === "none") {
      return "<wp:wrapNone/>";
    }
    if (type === "nowrap") {
      return "<wp:wrapTopAndBottom/>";
    }
    const wrapText = side === "left" || side === "right" || side === "largest" ? side : "bothSides";
    if (type === "tight" || type === "through") {
      const tag = type === "tight" ? "wp:wrapTight" : "wp:wrapThrough";
      return `<${tag} wrapText="${wrapText}">${this.polygon(drawing)}</${tag}>`;
    }
    return `<wp:wrapSquare wrapText="${wrapText}"/>`;
  }

  private polygon(drawing: Drawing): string {
    const [start, ...rest] = drawingOutline(drawing);
    const point = (tag: string, x: number, y: number) =>
      `<wp:${tag} x="${Math.round(x * WORD_WRAP_EXTENT / (drawing.width || 1))}" y="${Math.round(y * WORD_WRAP_EXTENT / (drawing.height || 1))}"/>`;
    return `<wp:wrapPolygon>${point("start", start.x, start.y)}${rest.map(({ x, y }) => point("lineTo", x, y)).join("")}</wp:wrapPolygon>`;
  }
}
