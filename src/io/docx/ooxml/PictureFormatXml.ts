import { isPictureCrop, type PictureAppearance } from "../../../model/graphic/PictureAppearance";
import { emuToPx, pxToEmu } from "../../../shared/units";
import { attr, first } from "./XmlQuery";
import { hexColor } from "./XmlEscape";

export function readPictureFormat(picture: Element): PictureAppearance | undefined {
  const fill = first(picture, "pic:blipFill");
  const blip = first(fill, "a:blip");
  const props = first(picture, "pic:spPr");
  const rect = first(fill, "a:srcRect");
  const correction = first(blip, "a:lum");
  const alpha = first(blip, "a:alphaModFix");
  const line = first(props, "a:ln");
  const border = colorOf(first(first(line, "a:solidFill"), "a:srgbClr"));
  const effect = first(first(props, "a:effectLst"), "a:outerShdw");
  const shadowColor = first(effect, "a:srgbClr");
  const color = colorOf(shadowColor);
  const direction = (Number(attr(effect, "dir")) || 0) * (Math.PI / 10800000);
  const distance = emuToPx(Number(attr(effect, "dist")) || 0);
  const crop = { left: fraction(rect, "l"), top: fraction(rect, "t"), right: fraction(rect, "r"), bottom: fraction(rect, "b") };
  const format: PictureAppearance = {
    crop: rect && Object.values(crop).some(Boolean) && isPictureCrop(crop) ? crop : undefined,
    brightness: fraction(correction, "bright") || undefined,
    contrast: fraction(correction, "contrast") || undefined,
    color: first(blip, "a:biLevel") ? "mono" : first(blip, "a:grayscl") ? "gray" : undefined,
    opacity: alpha ? fraction(alpha, "amt", 1) : undefined,
    rounded: attr(first(props, "a:prstGeom"), "prst") === "roundRect" || undefined,
    border: border ? { color: border, width: emuToPx(Number(attr(line, "w")) || 9525) } : undefined,
    shadow: color ? {
      color,
      opacity: fraction(first(shadowColor, "a:alpha"), "val", 1),
      blur: emuToPx(Number(attr(effect, "blurRad")) || 0),
      x: Math.cos(direction) * distance,
      y: Math.sin(direction) * distance,
    } : undefined,
  };
  return Object.values(format).some((value) => value !== undefined) ? format : undefined;
}

export function pictureFormatXml(format?: PictureAppearance): { crop: string; blip: string; properties: string; geometry: string } {
  const { crop, border, shadow, opacity, color, brightness, contrast, rounded } = format ?? {};
  const cropXml = crop ? `<a:srcRect l="${percent(crop.left)}" t="${percent(crop.top)}" r="${percent(crop.right)}" b="${percent(crop.bottom)}"/>` : "";
  const alphaXml = opacity !== undefined && opacity < 1 ? `<a:alphaModFix amt="${percent(opacity)}"/>` : "";
  const correctionXml = brightness || contrast ? `<a:lum bright="${percent(brightness ?? 0)}" contrast="${percent(contrast ?? 0)}"/>` : "";
  const colorXml = color === "mono" ? '<a:biLevel thresh="50000"/>' : color === "gray" ? "<a:grayscl/>" : "";
  const borderColor = hexColor(border?.color);
  const borderXml = border && borderColor ? `<a:ln w="${pxToEmu(border.width)}"><a:solidFill><a:srgbClr val="${borderColor}"/></a:solidFill></a:ln>` : "";
  const shadowHex = hexColor(shadow?.color);
  const shadowXml = shadow && shadowHex
    ? `<a:effectLst><a:outerShdw blurRad="${pxToEmu(shadow.blur)}" dist="${pxToEmu(Math.hypot(shadow.x, shadow.y))}" dir="${Math.round(((Math.atan2(shadow.y, shadow.x) * 180 / Math.PI + 360) % 360) * 60000)}"><a:srgbClr val="${shadowHex}"><a:alpha val="${percent(shadow.opacity)}"/></a:srgbClr></a:outerShdw></a:effectLst>`
    : "";
  const geometry = rounded ? '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12000"/></a:avLst></a:prstGeom>'
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  return { crop: cropXml, blip: alphaXml + correctionXml + colorXml, properties: borderXml + shadowXml, geometry };
}

function percent(value: number): number {
  return Math.round(value * 100000);
}

function fraction(node: Element | null, key: string, fallback = 0): number {
  const value = attr(node, key);
  if (!value) return fallback;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number / (value.endsWith("%") ? 100 : 100000) : fallback;
}

function colorOf(node: Element | null): string | undefined {
  const hex = attr(node, "val");
  return hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : undefined;
}
