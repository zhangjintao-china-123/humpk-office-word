import type { Drawing } from "../inline/Drawing";

export interface PictureCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PictureBorder {
  color: string;
  width: number;
}

export interface PictureShadow {
  color: string;
  opacity: number;
  blur: number;
  x: number;
  y: number;
}

export interface PictureAppearance {
  crop?: PictureCrop;
  brightness?: number;
  contrast?: number;
  color?: "gray" | "mono";
  opacity?: number;
  border?: PictureBorder;
  rounded?: boolean;
  shadow?: PictureShadow;
}

export const NO_CROP: Readonly<PictureCrop> = { left: 0, top: 0, right: 0, bottom: 0 };
export const PICTURE_SHADOW: Readonly<PictureShadow> = { color: "#000000", opacity: 0.32, blur: 5, x: 2, y: 4 };

export const PICTURE_STYLES = {
  plain: { label: "无样式", format: {} },
  white: { label: "白色相框", format: { border: { color: "#ffffff", width: 5 }, shadow: PICTURE_SHADOW } },
  black: { label: "深色细框", format: { border: { color: "#26394e", width: 2 } } },
  round: { label: "圆角图片", format: { rounded: true } },
  shadow: { label: "柔和阴影", format: { shadow: PICTURE_SHADOW } },
} satisfies Record<string, { label: string; format: Partial<PictureAppearance> }>;

export type PictureStyle = keyof typeof PICTURE_STYLES;

export type PictureAppearanceAction =
  | { type: "style"; style: PictureStyle }
  | { type: "correction"; brightness: number; contrast: number }
  | { type: "color"; color?: PictureAppearance["color"] }
  | { type: "opacity"; opacity: number }
  | { type: "border"; border?: PictureBorder }
  | { type: "shadow"; enabled: boolean }
  | { type: "description"; text: string }
  | { type: "crop"; crop: PictureCrop }
  | { type: "ratio"; ratio: number }
  | { type: "reset" };

export function copyPictureAppearance(value?: PictureAppearance): PictureAppearance | undefined {
  if (!value) return undefined;
  const { crop, border, shadow, ...rest } = value;
  return { ...rest, crop: crop && { ...crop }, border: border && { ...border }, shadow: shadow && { ...shadow } };
}

export function isPictureCrop(crop: PictureCrop): boolean {
  return Object.values(crop).every((value) => Number.isFinite(value) && value >= 0 && value < 1) &&
    crop.left + crop.right <= 0.95 && crop.top + crop.bottom <= 0.95;
}

export function pictureVisibleFractions(crop: PictureCrop = NO_CROP): { width: number; height: number } {
  return { width: 1 - crop.left - crop.right, height: 1 - crop.top - crop.bottom };
}

export function centeredPictureCrop(width: number, height: number, ratio: number): PictureCrop {
  const w = Math.min(1, (height * ratio) / width);
  const h = Math.min(1, width / (height * ratio));
  const left = (1 - w) / 2;
  const top = (1 - h) / 2;
  return { left, right: left, top, bottom: top };
}

export function pictureFilter(format?: PictureAppearance): string {
  const filters: string[] = [];
  if (format?.brightness) filters.push(`brightness(${1 + format.brightness})`);
  if (format?.contrast) filters.push(`contrast(${1 + format.contrast})`);
  if (format?.color) filters.push("grayscale(1)");
  if (format?.color === "mono") filters.push("contrast(1000)");
  return filters.join(" ") || "none";
}

export function applyPictureAppearance(drawing: Drawing, action: PictureAppearanceAction): void {
  const format = { ...drawing.pictureAppearance };
  switch (action.type) {
    case "style": {
      const style: Partial<PictureAppearance> = PICTURE_STYLES[action.style].format;
      format.border = style.border;
      format.rounded = style.rounded;
      format.shadow = style.shadow;
      break;
    }
    case "correction":
      if (!Number.isFinite(action.brightness) || !Number.isFinite(action.contrast)) return;
      format.brightness = Math.max(-1, Math.min(1, action.brightness)) || undefined;
      format.contrast = Math.max(-1, Math.min(1, action.contrast)) || undefined;
      break;
    case "color": format.color = action.color; break;
    case "opacity":
      if (!Number.isFinite(action.opacity)) return;
      format.opacity = Math.max(0, Math.min(1, action.opacity));
      if (format.opacity === 1) format.opacity = undefined;
      break;
    case "border": format.border = action.border && { ...action.border }; break;
    case "shadow": format.shadow = action.enabled ? { ...PICTURE_SHADOW } : undefined; break;
    case "description":
      drawing.description = action.text.trim() || undefined;
      return;
    case "ratio": {
      const full = uncroppedSize(drawing);
      if (!Number.isFinite(action.ratio) || action.ratio <= 0 || full.width <= 0 || full.height <= 0) return;
      setCrop(drawing, format, centeredPictureCrop(full.width, full.height, action.ratio));
      return;
    }
    case "crop":
      setCrop(drawing, format, action.crop);
      return;
    case "reset":
      setCrop(drawing, {}, NO_CROP);
      return;
  }
  drawing.pictureAppearance = Object.values(format).some((value) => value !== undefined) ? format : undefined;
}

function setCrop(drawing: Drawing, format: PictureAppearance, crop: PictureCrop): void {
  if (!isPictureCrop(crop)) return;
  const full = uncroppedSize(drawing);
  const visible = pictureVisibleFractions(crop);
  drawing.width = full.width * visible.width;
  drawing.height = full.height * visible.height;
  format.crop = Object.values(crop).some(Boolean) ? { ...crop } : undefined;
  drawing.pictureAppearance = Object.values(format).some((value) => value !== undefined) ? format : undefined;
}

function uncroppedSize(drawing: Drawing): { width: number; height: number } {
  const visible = pictureVisibleFractions(drawing.pictureAppearance?.crop);
  return { width: drawing.width / visible.width, height: drawing.height / visible.height };
}
