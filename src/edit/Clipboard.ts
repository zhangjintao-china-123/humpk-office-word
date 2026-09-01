import { ClipboardPayload } from "./ClipboardPayload";

export interface ClipboardIO {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

export class Clipboard {
  private memory = "";
  private payload?: ClipboardPayload;

  constructor(private readonly io?: ClipboardIO) {}

  async write(payload: ClipboardPayload): Promise<void> {
    this.payload = payload;
    this.memory = payload.text;
    const backend = this.io ?? systemClipboard();
    if (!backend) {
      return;
    }
    try {
      await backend.writeText(payload.text);
    } catch {
      // 权限或非安全上下文失败时保留内存副本
    }
  }

  async writeText(text: string): Promise<void> {
    await this.write(ClipboardPayload.plain(text));
  }

  async read(): Promise<ClipboardPayload> {
    const backend = this.io ?? systemClipboard();
    if (backend) {
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

function systemClipboard(): ClipboardIO | undefined {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return undefined;
  }
  return navigator.clipboard;
}
