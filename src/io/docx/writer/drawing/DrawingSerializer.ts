import type { Drawing, WrapSide, WrapType } from "../../../../model/inline/Drawing";
import { pxToEmu } from "../../../../shared/units";
import type { PartAssets } from "../package/PartAssets";

export class DrawingSerializer {
  private docPr = 1;

  serialize(drawing: Drawing, assets: PartAssets | undefined): string | undefined {
    const relId = assets?.embedImage(drawing.url);
    if (!relId) {
      return undefined;
    }
    const cx = pxToEmu(drawing.width);
    const cy = pxToEmu(drawing.height);
    const graphic = `<a:graphic><a:graphicData><a:blip r:embed="${relId}"/></a:graphicData></a:graphic>`;
    const body =
      drawing.position === "anchor"
        ? this.anchor(drawing, cx, cy, graphic)
        : `<wp:inline><wp:extent cx="${cx}" cy="${cy}"/>${graphic}</wp:inline>`;
    return `<w:r><w:drawing>${body}</w:drawing></w:r>`;
  }

  private anchor(drawing: Drawing, cx: number, cy: number, graphic: string): string {
    const set = drawing.anchorSet;
    const id = this.docPr;
    this.docPr += 1;
    const behind = set?.behind ? "1" : "0";
    const dist = `distT="${pxToEmu(set?.distTop ?? 0)}" distB="${pxToEmu(set?.distBottom ?? 0)}" distL="${pxToEmu(set?.distLeft ?? 0)}" distR="${pxToEmu(set?.distRight ?? 0)}"`;
    return `<wp:anchor behindDoc="${behind}" ${dist}>${this.axis("wp:positionH", set?.leftFrom ?? "column", set?.left, set?.leftAlign)}${this.axis("wp:positionV", set?.topFrom ?? "paragraph", set?.top, set?.topAlign)}<wp:extent cx="${cx}" cy="${cy}"/>${this.wrap(set?.wrapType, set?.wrapSide, set?.polygon)}<wp:docPr id="${id}" name="Picture ${id}"/>${graphic}</wp:anchor>`;
  }

  private axis(tag: string, from: string, offset: number | undefined, align: string | undefined): string {
    const body =
      offset != null
        ? `<wp:posOffset>${pxToEmu(offset)}</wp:posOffset>`
        : `<wp:align>${align || "left"}</wp:align>`;
    return `<${tag} relativeFrom="${from}">${body}</${tag}>`;
  }

  private wrap(type: WrapType | undefined, side: WrapSide | undefined, polygon: { x: number; y: number }[] | undefined): string {
    if (type === "none") {
      return "<wp:wrapNone/>";
    }
    if (type === "nowrap") {
      return "<wp:wrapTopAndBottom/>";
    }
    const wrapText = side === "left" || side === "right" ? side : "bothSides";
    if (type === "tight" || type === "through") {
      const tag = type === "tight" ? "wp:wrapTight" : "wp:wrapThrough";
      return `<${tag} wrapText="${wrapText}">${this.polygon(polygon)}</${tag}>`;
    }
    return `<wp:wrapSquare wrapText="${wrapText}"/>`;
  }

  private polygon(points: { x: number; y: number }[] | undefined): string {
    if (!points || points.length < 3) {
      return "";
    }
    const [start, ...rest] = points;
    const lines = rest
      .map((point) => `<wp:lineTo x="${pxToEmu(point.x)}" y="${pxToEmu(point.y)}"/>`)
      .join("");
    return `<wp:wrapPolygon><wp:start x="${pxToEmu(start.x)}" y="${pxToEmu(start.y)}"/>${lines}</wp:wrapPolygon>`;
  }
}
