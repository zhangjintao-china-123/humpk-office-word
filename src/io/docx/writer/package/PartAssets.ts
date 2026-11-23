export interface WrittenRel {
  id: string;
  type: string;
  target: string;
  external?: boolean;
}

export interface WrittenImage {
  path: string;
  base64: string;
  ext: string;
}

export class PartAssets {
  readonly rels: WrittenRel[] = [];
  readonly images: WrittenImage[] = [];

  constructor(
    private readonly relSeq: { n: number } = { n: 1 },
    private readonly imageSeq: { n: number } = { n: 1 },
  ) {}

  nextRelId(): string {
    const id = `rId${this.relSeq.n}`;
    this.relSeq.n += 1;
    return id;
  }

  hyperlink(url: string): string {
    const existing = this.rels.find((rel) => rel.external && rel.target === url);
    if (existing) {
      return existing.id;
    }
    const id = this.nextRelId();
    this.rels.push({
      id,
      type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
      target: url,
      external: true,
    });
    return id;
  }

  embedImage(url: string | undefined): string | undefined {
    const parsed = parseDataUrl(url);
    if (!parsed) {
      return undefined;
    }
    const index = this.imageSeq.n;
    this.imageSeq.n += 1;
    const filename = `image${index}.${parsed.ext}`;
    this.images.push({
      path: `word/media/${filename}`,
      base64: parsed.base64,
      ext: parsed.ext,
    });
    const id = this.nextRelId();
    this.rels.push({
      id,
      type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
      target: `media/${filename}`,
    });
    return id;
  }
}

function extensionOf(subtype: string): string {
  if (subtype === "jpeg") {
    return "jpg";
  }
  if (subtype === "svg+xml") {
    return "svg";
  }
  if (subtype === "x-emf") {
    return "emf";
  }
  if (subtype === "x-wmf") {
    return "wmf";
  }
  if (subtype === "tif") {
    return "tiff";
  }
  return subtype;
}

function parseDataUrl(url: string | undefined): { ext: string; base64: string } | undefined {
  if (!url) {
    return undefined;
  }
  const match = /^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) {
    return undefined;
  }
  const subtype = match[1].toLowerCase();
  return { ext: extensionOf(subtype), base64: match[2] };
}
