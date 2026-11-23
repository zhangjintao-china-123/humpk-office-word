import { clipboardHtml, parseClipboardHtml } from "./ClipboardHtml";
import { ClipboardPayload } from "./ClipboardPayload";

export interface ClipboardIO {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
  writeHtml?(html: string, text: string): Promise<void>;
  readHtml?(): Promise<string>;
}

export class Clipboard {
  private memory = "";
  private payload?: ClipboardPayload;

  constructor(
    private readonly io?: ClipboardIO,
    private readonly readLimitMs = 800,
  ) {}

  async write(payload: ClipboardPayload): Promise<void> {
    this.payload = payload;
    this.memory = payload.text;
    const backend = this.io ?? systemClipboard();
    if (!backend) {
      return;
    }
    try {
      if (backend.writeHtml) {
        await backend.writeHtml(clipboardHtml(payload), payload.text);
      } else {
        await backend.writeText(payload.text);
      }
    } catch {
      try {
        await backend.writeText(payload.text);
      } catch {
        // 权限或非安全上下文失败时保留内存副本
      }
    }
  }

  async writeText(text: string): Promise<void> {
    await this.write(ClipboardPayload.plain(text));
  }

  async read(): Promise<ClipboardPayload> {
    const backend = this.io ?? systemClipboard();
    if (backend) {
      if (backend.readHtml) {
        try {
          const html = await withTimeout(backend.readHtml(), this.readLimitMs);
          const parsed = html ? parseClipboardHtml(html) : undefined;
          if (parsed && !parsed.empty) {
            this.payload = parsed;
            this.memory = parsed.text;
            return parsed;
          }
        } catch {
          // 没有 HTML 或权限框不返回时继续读纯文本
        }
      }
      try {
        const text = await backend.readText();
        if (this.payload && text === this.payload.text) {
          return this.payload;
        }
        this.memory = text;
        this.payload = undefined;
        return ClipboardPayload.plain(text);
      } catch {
        return this.payload ?? ClipboardPayload.plain(this.memory);
      }
    }
    return this.payload ?? ClipboardPayload.plain(this.memory);
  }

  async readText(): Promise<string> {
    return (await this.read()).text;
  }
}

/** 粘贴事件里同步拿到的内容。有 HTML 时优先于纯文本。 */
export function payloadFromData(data: { getData(format: string): string } | null | undefined): ClipboardPayload | undefined {
  if (!data) {
    return undefined;
  }
  let html = "";
  let text = "";
  try {
    html = data.getData("text/html");
    text = data.getData("text/plain");
  } catch {
    return undefined;
  }
  const parsed = html ? parseClipboardHtml(html) : undefined;
  if (parsed && !parsed.empty) {
    return parsed;
  }
  return text ? ClipboardPayload.plain(text) : undefined;
}

function systemClipboard(): ClipboardIO | undefined {
  const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clip && typeof document === "undefined") {
    return undefined;
  }
  return {
    writeText: async (text) => {
      if (writeWithCommand("", text)) {
        return;
      }
      await clip?.writeText(text);
    },
    readText: async () => {
      if (!clip) {
        throw new Error("clipboard");
      }
      return clip.readText();
    },
    writeHtml: async (html, text) => {
      if (writeWithCommand(html, text)) {
        return;
      }
      const Item = globalThis.ClipboardItem;
      if (!clip?.write || typeof Item !== "function") {
        await clip?.writeText(text);
        return;
      }
      await clip.write([
        new Item({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
    },
    readHtml: async () => {
      if (!clip?.read) {
        return "";
      }
      const items = await clip.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          return await (await item.getType("text/html")).text();
        }
      }
      return "";
    },
  };
}

function writeWithCommand(html: string, text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }
  let wrote = false;
  const onCopy = (event: ClipboardEvent): void => {
    if (!event.clipboardData) {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
    if (html) {
      event.clipboardData.setData("text/html", html);
    }
    wrote = true;
  };
  document.addEventListener("copy", onCopy);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.removeEventListener("copy", onCopy);
  }
  return ok && wrote;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
