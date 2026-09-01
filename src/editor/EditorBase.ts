import { Document } from "../model/document/Document";
import { WordStreamBuilder } from "../model/flatten/WordStreamBuilder";
import { Emitter } from "../shared/events/Emitter";
import { Rect } from "../shared/geometry/Rect";
import { EditorEvents, type EditorEventName } from "./types/EditorEvents";
import type { EditorMode } from "./types/EditorMode";
import type { IDraw } from "./types/IDraw";
import type { IViewport } from "./types/IViewport";

export interface EditorBaseOptions {
  draw: IDraw;
  viewport: IViewport;
  mode?: EditorMode;
  box?: Rect;
  parent?: EditorBase;
}

export class EditorBase {
  document: Document | null = null;
  mode: EditorMode;
  box: Rect;
  parent: EditorBase | null;
  readonly draw: IDraw;
  readonly viewport: IViewport;

  private attached = false;
  private disposed = false;
  private layoutDirty = false;
  private renderDirty = false;
  private readonly emitter = new Emitter();
  private readonly words = new WordStreamBuilder();

  constructor(options: EditorBaseOptions) {
    this.draw = options.draw;
    this.viewport = options.viewport;
    this.mode = options.mode ?? "view";
    this.box = options.box?.clone() ?? new Rect();
    this.parent = options.parent ?? null;
  }

  get isAttached(): boolean {
    return this.attached && !this.disposed;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  absBox(): Rect {
    let x = this.box.x;
    let y = this.box.y;
    let current = this.parent;
    while (current) {
      x += current.box.x;
      y += current.box.y;
      current = current.parent;
    }
    return new Rect(x, y, this.box.width, this.box.height);
  }

  contains(x: number, y: number): boolean {
    return this.absBox().contains(x, y);
  }

  attach(): this {
    if (this.disposed) {
      return this;
    }
    this.attached = true;
    return this;
  }

  load(document: Document): this {
    if (this.disposed) {
      return this;
    }
    this.document = document;
    if (document.words.length === 0) {
      this.words.buildStoryOnly(document);
    }
    this.onLoad(document);
    this.emitter.emit(EditorEvents.loaded, document);
    this.requestLayout();
    return this;
  }

  requestLayout(): this {
    if (this.disposed) {
      return this;
    }
    this.layoutDirty = true;
    return this;
  }

  requestRender(): this {
    if (this.disposed) {
      return this;
    }
    this.renderDirty = true;
    return this;
  }

  flush(): this {
    if (this.disposed) {
      return this;
    }
    if (this.layoutDirty) {
      this.onLayout();
      this.layoutDirty = false;
      this.renderDirty = true;
      this.emitter.emit(EditorEvents.layout);
    }
    if (this.renderDirty && this.attached) {
      this.onRender();
      this.renderDirty = false;
      this.emitter.emit(EditorEvents.render);
    }
    return this;
  }

  on(event: EditorEventName, handler: (...args: unknown[]) => void): this {
    this.emitter.on(event, handler);
    return this;
  }

  off(event: EditorEventName, handler?: (...args: unknown[]) => void): this {
    this.emitter.off(event, handler);
    return this;
  }

  emit(event: EditorEventName, ...args: unknown[]): this {
    this.emitter.emit(event, ...args);
    return this;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.onDispose();
    this.disposed = true;
    this.attached = false;
    this.layoutDirty = false;
    this.renderDirty = false;
    this.document = null;
    this.parent = null;
    this.emitter.emit(EditorEvents.disposed);
    this.emitter.clear();
  }

  protected onLoad(_document: Document): void {}

  protected onLayout(): void {}

  protected onRender(): void {}

  protected onDispose(): void {}
}
