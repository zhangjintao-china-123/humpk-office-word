import { pictureVisibleFractions } from "../model/graphic/PictureAppearance";
import type { Drawing } from "../model/inline/Drawing";
import { imageCache } from "../render/image/ImageCache";

export function canEditPicturePixels(url?: string): boolean {
  return /^data:image\/(?:png|jpeg|bmp);base64,/i.test(url ?? "");
}

export async function editPicturePixels(drawing: Drawing, action: "compress" | "remove-background"): Promise<string | undefined> {
  const url = drawing.url;
  if (!url || !canEditPicturePixels(url)) return undefined;
  await imageCache.decode(url);
  const picture = imageCache.get(url);
  if (!picture) return undefined;
  const w = picture.naturalWidth;
  const h = picture.naturalHeight;
  const visible = pictureVisibleFractions(drawing.pictureAppearance?.crop);
  const displayScale = Math.max(drawing.width / (visible.width * w), drawing.height / (visible.height * h));
  const scale = action === "compress" ? Math.min(1, displayScale * (150 / 96)) : Math.min(1, Math.sqrt(10_000_000 / (w * h)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
  if (action === "compress") {
    const compressed = canvas.toDataURL(url.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png", 0.82);
    return compressed.length < url.length ? compressed : undefined;
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!removeSolidBackground(pixels)) return undefined;
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

/** 只有四角颜色相近时才从边缘擦除连通的背景像素。 */
export function removeSolidBackground(image: ImageData): boolean {
  const { width, height, data } = image;
  const size = width * height;
  const corners = [0, width - 1, size - width, size - 1].map((pixel) => pixel * 4);
  const base = corners[0];
  const threshold = 32;
  const matches = (at: number): boolean => data[at + 3] > 0 &&
    Math.max(Math.abs(data[at] - data[base]), Math.abs(data[at + 1] - data[base + 1]), Math.abs(data[at + 2] - data[base + 2])) <= threshold;
  if (corners.some((at) => !matches(at))) return false;
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  const visit = (pixel: number) => {
    const at = pixel * 4;
    if (!matches(at)) return;
    data[at + 3] = 0;
    queue[tail++] = pixel;
  };
  for (let col = 0; col < width; col += 1) {
    visit(col);
    visit(size - width + col);
  }
  for (let row = 1; row < height - 1; row += 1) {
    visit(row * width);
    visit((row + 1) * width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const col = pixel % width;
    if (col > 0) visit(pixel - 1);
    if (col < width - 1) visit(pixel + 1);
    if (pixel >= width) visit(pixel - width);
    if (pixel < size - width) visit(pixel + width);
  }
  return tail > 0 && tail < size;
}
