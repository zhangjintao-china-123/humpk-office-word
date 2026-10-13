/** 把 Word 媒体转成浏览器能画的 data URL，并保留原始字节供写回。 */

export interface ResolvedImage {
  /** 画布使用。EMF/WMF/TIFF 会换成从中抽出的位图。 */
  display?: string;
  /** 写回使用，保持 docx 里的原始格式。 */
  source: string;
}

const NATIVE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
};

export function resolveImage(ext: string, base64: string): ResolvedImage {
  const kind = ext.toLowerCase().replace(/^\./, "");
  const source = dataUrl(sourceMime(kind), base64);
  const native = NATIVE[kind];
  if (native) {
    return { display: dataUrl(native, base64), source };
  }
  const bytes = base64ToBytes(base64);
  const sniffed = sniffImage(bytes);
  if (sniffed) {
    return { display: sniffed, source };
  }
  if (kind === "tif" || kind === "tiff") {
    const tiff = tiffDib(bytes);
    return tiff ? { display: bmpDataUrl(tiff), source } : { source };
  }
  const embedded = embeddedBitmap(bytes);
  if (embedded.display) {
    return { display: embedded.display, source };
  }
  return embedded.dib ? { display: bmpDataUrl(embedded.dib), source } : { source };
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function sourceMime(ext: string): string {
  if (ext === "jpg") {
    return "image/jpeg";
  }
  if (ext === "svg") {
    return "image/svg+xml";
  }
  if (ext === "tif") {
    return "image/tiff";
  }
  return NATIVE[ext] ?? `image/${ext || "png"}`;
}

function dataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

function bmpDataUrl(dib: Uint8Array): string {
  return dataUrl("image/bmp", bytesToBase64(bmpFile(dib)));
}

function sniffImage(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return dataUrl("image/png", bytesToBase64(bytes));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return dataUrl("image/jpeg", bytesToBase64(bytes));
  }
  return undefined;
}

/** EMF 的 STRETCHDIBITS，以及文件里直接嵌着的 DIB。 */
function embeddedBitmap(bytes: Uint8Array): { dib?: Uint8Array; display?: string } {
  let best: Uint8Array | undefined;
  let bestPixels = 0;
  let display: string | undefined;
  const consider = (dib: Uint8Array | undefined) => {
    if (!dib || dib.length < 40) {
      return;
    }
    const pixels = Math.abs(readI32(dib, 4)) * Math.abs(readI32(dib, 8));
    if (pixels > bestPixels) {
      best = dib;
      bestPixels = pixels;
    }
  };
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const type = readU32(bytes, offset);
    const size = readU32(bytes, offset + 4);
    if (size < 8 || offset + size > bytes.length) {
      break;
    }
    if (type === 81) {
      const found = stretchBitmap(bytes, offset);
      display = found.display ?? display;
      consider(found.dib);
    }
    if (type === 14) {
      break;
    }
    offset += size;
  }
  consider(scanDib(bytes));
  return { dib: best, display };
}

function stretchBitmap(bytes: Uint8Array, record: number): { dib?: Uint8Array; display?: string } {
  if (record + 64 > bytes.length) {
    return {};
  }
  const offBmi = readU32(bytes, record + 48);
  const cbBmi = readU32(bytes, record + 52);
  const offBits = readU32(bytes, record + 56);
  const cbBits = readU32(bytes, record + 60);
  if (cbBits > 0 && record + offBits + cbBits <= bytes.length) {
    const bits = bytes.subarray(record + offBits, record + offBits + cbBits);
    const sniffed = sniffImage(bits);
    if (sniffed) {
      return { display: sniffed };
    }
  }
  if (cbBmi < 40 || record + offBmi + cbBmi > bytes.length || record + offBits + cbBits > bytes.length) {
    return {};
  }
  const bmi = bytes.subarray(record + offBmi, record + offBmi + cbBmi);
  const bits = bytes.subarray(record + offBits, record + offBits + cbBits);
  const compression = readU32(bmi, 16);
  if (compression === 4 || compression === 5) {
    return {};
  }
  const dib = new Uint8Array(bmi.length + bits.length);
  dib.set(bmi, 0);
  dib.set(bits, bmi.length);
  return { dib };
}

function scanDib(bytes: Uint8Array): Uint8Array | undefined {
  let best: Uint8Array | undefined;
  let bestPixels = 0;
  for (let i = 0; i + 40 < bytes.length; i += 1) {
    if (readU32(bytes, i) !== 40) {
      continue;
    }
    const width = readI32(bytes, i + 4);
    const height = Math.abs(readI32(bytes, i + 8));
    const planes = readU16(bytes, i + 12);
    const bitCount = readU16(bytes, i + 14);
    const compression = readU32(bytes, i + 16);
    if (planes !== 1 || width < 1 || width > 8000 || height < 1 || height > 8000) {
      continue;
    }
    if (![1, 4, 8, 24, 32].includes(bitCount) || (compression !== 0 && compression !== 3)) {
      continue;
    }
    const palette = paletteBytes(bitCount, compression, readU32(bytes, i + 32));
    const row = Math.floor((bitCount * width + 31) / 32) * 4;
    const total = 40 + palette + row * height;
    if (i + total > bytes.length) {
      continue;
    }
    const pixels = width * height;
    if (pixels > bestPixels) {
      bestPixels = pixels;
      best = bytes.slice(i, i + total);
    }
  }
  return best;
}

function paletteBytes(bitCount: number, compression: number, colorsUsed: number): number {
  if (bitCount <= 8) {
    const colors = colorsUsed === 0 ? 1 << bitCount : colorsUsed;
    return colors * 4;
  }
  return compression === 3 ? 12 : 0;
}

function tiffDib(bytes: Uint8Array): Uint8Array | undefined {
  const le = bytes[0] === 0x49 && bytes[1] === 0x49;
  const be = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if ((!le && !be) || readU16At(bytes, 2, le) !== 42) {
    return undefined;
  }
  const tags = readIfd(bytes, readU32At(bytes, 4, le), le);
  const width = tagValue(tags, 256);
  const height = tagValue(tags, 257);
  const compression = tagValue(tags, 259) ?? 1;
  const photo = tagValue(tags, 262) ?? 2;
  const spp = tagValue(tags, 277) ?? (photo === 2 ? 3 : 1);
  if (!width || !height || compression !== 1 || (photo !== 2 && photo !== 1) || spp < 1 || spp > 4) {
    return undefined;
  }
  const strips = tagValues(bytes, tags.get(273), le);
  const counts = tagValues(bytes, tags.get(279), le);
  if (!strips.length || strips.length !== counts.length) {
    return undefined;
  }
  const rowsPerStrip = tagValue(tags, 278) ?? height;
  const bgr = new Uint8Array(width * height * 3);
  let row = 0;
  for (let strip = 0; strip < strips.length; strip += 1) {
    const src = bytes.subarray(strips[strip], strips[strip] + counts[strip]);
    const rows = Math.min(rowsPerStrip, height - row);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sample = (y * width + x) * spp;
        const red = photo === 2 ? src[sample] ?? 0 : src[sample] ?? 0;
        const green = photo === 2 ? src[sample + 1] ?? red : red;
        const blue = photo === 2 ? src[sample + 2] ?? red : red;
        const at = ((row + y) * width + x) * 3;
        bgr[at] = blue;
        bgr[at + 1] = green;
        bgr[at + 2] = red;
      }
    }
    row += rows;
  }
  return dib24(width, height, bgr, true);
}

function dib24(width: number, height: number, bgrTopDown: Uint8Array, topDown: boolean): Uint8Array {
  const row = Math.floor((width * 24 + 31) / 32) * 4;
  const header = new Uint8Array(40);
  writeU32(header, 0, 40);
  writeI32(header, 4, width);
  writeI32(header, 8, height);
  writeU16(header, 12, 1);
  writeU16(header, 14, 24);
  const bits = new Uint8Array(row * height);
  for (let y = 0; y < height; y += 1) {
    const srcY = topDown ? y : height - 1 - y;
    const destY = height - 1 - srcY;
    bits.set(bgrTopDown.subarray(srcY * width * 3, (srcY + 1) * width * 3), destY * row);
  }
  const dib = new Uint8Array(40 + bits.length);
  dib.set(header, 0);
  dib.set(bits, 40);
  return dib;
}

function bmpFile(dib: Uint8Array): Uint8Array {
  const headerSize = readU32(dib, 0);
  const bitCount = readU16(dib, 14);
  const compression = readU32(dib, 16);
  const colors = readU32(dib, 32);
  const pixelOffset = 14 + headerSize + paletteBytes(bitCount, compression, colors);
  const file = new Uint8Array(14 + dib.length);
  file[0] = 0x42;
  file[1] = 0x4d;
  writeU32(file, 2, file.length);
  writeU32(file, 10, pixelOffset);
  file.set(dib, 14);
  return file;
}

interface TiffTag {
  type: number;
  count: number;
  value: number;
}

function readIfd(bytes: Uint8Array, offset: number, le: boolean): Map<number, TiffTag> {
  const tags = new Map<number, TiffTag>();
  if (offset + 2 > bytes.length) {
    return tags;
  }
  const count = readU16At(bytes, offset, le);
  for (let i = 0; i < count; i += 1) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > bytes.length) {
      break;
    }
    tags.set(readU16At(bytes, entry, le), {
      type: readU16At(bytes, entry + 2, le),
      count: readU32At(bytes, entry + 4, le),
      value: readU32At(bytes, entry + 8, le),
    });
  }
  return tags;
}

function tagValue(tags: Map<number, TiffTag>, id: number): number | undefined {
  const tag = tags.get(id);
  if (!tag) {
    return undefined;
  }
  if (tag.type === 3 && tag.count === 1) {
    return tag.value & 0xffff;
  }
  return tag.value;
}

function tagValues(bytes: Uint8Array, tag: TiffTag | undefined, le: boolean): number[] {
  if (!tag) {
    return [];
  }
  const width = tag.type === 3 ? 2 : 4;
  if (tag.count === 1) {
    return [tag.type === 3 ? tag.value & 0xffff : tag.value];
  }
  const values: number[] = [];
  for (let i = 0; i < tag.count; i += 1) {
    const at = tag.value + i * width;
    values.push(width === 2 ? readU16At(bytes, at, le) : readU32At(bytes, at, le));
  }
  return values;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readI32(bytes: Uint8Array, offset: number): number {
  return readU32(bytes, offset) | 0;
}

function readU16At(bytes: Uint8Array, offset: number, le: boolean): number {
  if (offset + 2 > bytes.length) {
    return 0;
  }
  return le ? readU16(bytes, offset) : (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32At(bytes: Uint8Array, offset: number, le: boolean): number {
  if (offset + 4 > bytes.length) {
    return 0;
  }
  return le ? readU32(bytes, offset) : ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function writeI32(bytes: Uint8Array, offset: number, value: number): void {
  writeU32(bytes, offset, value >>> 0);
}
