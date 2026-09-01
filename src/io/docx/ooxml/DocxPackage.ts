import JSZip from "jszip";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\//, "");
}

export class DocxPackage {
  private texts = new Map<string, string>();
  private media = new Map<string, string>();

  static async open(data: ArrayBuffer): Promise<DocxPackage> {
    const zip = await JSZip.loadAsync(data);
    const pkg = new DocxPackage();
    const names = Object.keys(zip.files);
    await Promise.all(
      names.map(async (name) => {
        const file = zip.files[name];
        if (!file || file.dir) {
          return;
        }
        const path = normalize(name);
        if (path.endsWith(".xml") || path.endsWith(".rels")) {
          pkg.texts.set(path, await file.async("text"));
          return;
        }
        if (path.startsWith("word/media/")) {
          pkg.media.set(path, await file.async("base64"));
        }
      }),
    );
    return pkg;
  }

  static fromParts(parts: { texts?: Record<string, string>; media?: Record<string, string> }): DocxPackage {
    const pkg = new DocxPackage();
    for (const [path, xml] of Object.entries(parts.texts ?? {})) {
      pkg.texts.set(normalize(path), xml);
    }
    for (const [path, data] of Object.entries(parts.media ?? {})) {
      pkg.media.set(normalize(path), data);
    }
    return pkg;
  }

  has(path: string): boolean {
    const key = normalize(path);
    return this.texts.has(key) || this.media.has(key);
  }

  xml(path: string): string | undefined {
    return this.texts.get(normalize(path));
  }

  mediaBase64(path: string): string | undefined {
    return this.media.get(normalize(path));
  }

  setXml(path: string, xml: string): void {
    this.texts.set(normalize(path), xml);
  }

  setMedia(path: string, base64: string): void {
    this.media.set(normalize(path), base64);
  }

  async generate(): Promise<ArrayBuffer> {
    const zip = new JSZip();
    for (const [path, xml] of this.texts) {
      zip.file(path, xml);
    }
    for (const [path, data] of this.media) {
      zip.file(path, data, { base64: true });
    }
    return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
  }
}
