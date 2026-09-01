import type { Document } from "../model/document/Document";
import type { HeaderFooterType } from "../model/document/DocumentKind";
import { StoryEditor, type PageOrigin } from "./StoryEditor";

/** 同一槽位（页眉或页脚）下 first / even / default 各一份编辑器。 */
export class BandEditors {
  private readonly editors = new Map<HeaderFooterType, StoryEditor>();

  constructor(private readonly create: () => StoryEditor) {}

  load(docs: Map<HeaderFooterType, Document>): void {
    this.dispose();
    for (const [type, document] of docs) {
      const editor = this.create();
      editor.attach().load(document).flush();
      this.editors.set(type, editor);
    }
  }

  editor(type: HeaderFooterType): StoryEditor | undefined {
    return this.editors.get(type);
  }

  asRecord(): Partial<Record<HeaderFooterType, StoryEditor>> {
    return Object.fromEntries(this.editors);
  }

  maxExtent(): number {
    let max = 0;
    for (const editor of this.editors.values()) {
      const last = editor.lines.at(-1);
      if (last) {
        max = Math.max(max, last.top + last.height);
      }
    }
    return max;
  }

  paintOnPages(origins: PageOrigin[], typeAt: (pageIndex: number) => HeaderFooterType): void {
    origins.forEach((origin, index) => {
      this.editor(typeAt(index))?.paintOnPages([origin]);
    });
  }

  dispose(): void {
    for (const editor of this.editors.values()) {
      editor.dispose();
    }
    this.editors.clear();
  }
}
