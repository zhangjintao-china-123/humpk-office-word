import { Drawing } from "../model/inline/Drawing";

export function fitImageSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.min(1, Math.max(32, maxWidth) / w, Math.max(32, maxHeight) / h);
  return { width: w * scale, height: h * scale };
}

export function drawingFromSize(url: string, width: number, height: number, maxWidth: number, maxHeight: number): Drawing {
  const size = fitImageSize(width, height, maxWidth, maxHeight);
  const drawing = new Drawing();
  drawing.url = url;
  drawing.sourceUrl = url;
  drawing.position = "inline";
  drawing.width = size.width;
  drawing.height = size.height;
  return drawing;
}

export function drawingFromFile(file: File, maxWidth: number, maxHeight: number): Promise<Drawing> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read image"));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      const image = new Image();
      image.onload = () => {
        resolve(drawingFromSize(url, image.naturalWidth || 320, image.naturalHeight || 240, maxWidth, maxHeight));
      };
      image.onerror = () => reject(new Error("decode image"));
      image.src = url;
    };
    reader.readAsDataURL(file);
  });
}
