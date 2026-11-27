import { SOURCE_TYPES, type CitationDetails, type CitationStyle } from "../../model/reference/Citation";
import type { CaptionKind, CrossReferenceKind } from "../../model/reference/References";
import type { NoteKind } from "../../model/review/Review";
import type { Workspace } from "../workspace/Workspace";
import { RibbonIcons } from "./RibbonIcons";

export type ReferenceHost = Pick<Workspace, "referenceState" | "insertToc" | "setTocLevel" | "addFootnote" | "showNote" |
  "insertCitation" | "setCitationStyle" | "insertBibliography" | "insertCaption" | "insertFigureList" | "insertCrossReference">;

type FormMode = "citation" | "footnote" | "endnote" | "caption" | "cross" | "notes";

export function referenceMarkup(): string {
  return `<div class="ho-word-ribbon-page ho-word-reference-page" data-page="references" hidden>
    <section class="ho-word-group">
      <div class="ho-word-group-body">
        ${button("toc", "目录", RibbonIcons.wordCount)}
        <div class="ho-word-stack">
          <select data-reference-level aria-label="目录级别">
            <option value="10">正文级</option>
            ${Array.from({ length: 9 }, (_, index) => `<option value="${index + 1}">级别 ${index + 1}</option>`).join("")}
          </select>
          ${button("update-toc", "更新目录")}
        </div>
      </div><span>目录</span>
    </section>
    <section class="ho-word-group">
      <div class="ho-word-group-body">
        ${button("footnote", "插入脚注", RibbonIcons.pageNumber)}
        ${button("endnote", "插入尾注", RibbonIcons.footer)}
        <div class="ho-word-stack">
          ${button("next-note", "下一条脚注")}
          ${button("notes", "显示备注")}
        </div>
      </div><span>脚注与尾注</span>
    </section>
    <section class="ho-word-group">
      <div class="ho-word-group-body">
        ${button("citation", "插入引文", RibbonIcons.newComment)}
        <div class="ho-word-stack">
          <select data-reference-style aria-label="引文样式"><option value="APA">APA</option><option value="MLA">MLA</option></select>
          ${button("bibliography", "插入书目")}
        </div>
      </div><span>引文与书目</span>
    </section>
    <section class="ho-word-group">
      <div class="ho-word-group-body">
        ${button("caption", "插入题注", RibbonIcons.picture)}
        <div class="ho-word-stack">
          ${button("figures", "插入图表目录")}
          ${button("cross", "交叉引用")}
        </div>
      </div><span>题注</span>
    </section>
    <span class="ho-word-reference-status" data-reference-status role="status"></span>
  </div>`;
}

function button(action: string, label: string, icon?: string): string {
  return `<button type="button"${icon ? ' class="ho-word-big"' : ""} data-reference-action="${action}">${icon ?? ""}<span>${label}</span></button>`;
}

export class ReferenceTools {
  private readonly panel: HTMLElement;
  private readonly dialog = document.createElement("dialog");
  private readonly form: HTMLFormElement;
  private readonly content: HTMLElement;
  private readonly submit: HTMLButtonElement;
  private readonly close: HTMLButtonElement;
  private mode: FormMode = "citation";
  private nextNoteId?: string;

  constructor(root: HTMLElement, private readonly host?: ReferenceHost) {
    this.panel = root.querySelector('[data-page="references"]')!;
    this.panel.addEventListener("click", this.onClick);
    this.panel.addEventListener("change", this.onChange);
    this.dialog.className = "ho-word-reference-dialog";
    this.dialog.innerHTML = `
      <h2></h2>
      <form>
        <div class="ho-word-reference-fields"></div>
        <div class="ho-word-reference-actions">
          <button type="button" data-close>取消</button><button type="submit">插入</button>
        </div>
      </form>`;
    this.form = this.dialog.querySelector("form")!;
    this.content = this.dialog.querySelector(".ho-word-reference-fields")!;
    this.submit = this.form.querySelector('button[type="submit"]')!;
    this.close = this.form.querySelector("[data-close]")!;
    this.close.addEventListener("click", () => this.dialog.close());
    this.form.addEventListener("submit", this.onSubmit);
    document.body.append(this.dialog);
  }

  destroy(): void {
    this.panel.removeEventListener("click", this.onClick);
    this.panel.removeEventListener("change", this.onChange);
    this.dialog.remove();
  }

  sync(hasDoc: boolean): void {
    const state = this.host?.referenceState();
    const enabled: Record<string, boolean> = {
      toc: true, "update-toc": !!state?.hasToc, caption: true,
      footnote: !!state?.canAddNote, endnote: !!state?.canAddNote,
      "next-note": !!state?.footnotes.length, notes: !!(state?.footnotes.length || state?.endnotes.length),
      citation: !!state?.canInsertField, bibliography: !!state?.sources.length,
      figures: !!state?.targets.some((item) => item.caption), cross: !!(state?.canInsertField && state.targets.length),
    };
    for (const button of this.panel.querySelectorAll<HTMLButtonElement>("[data-reference-action]")) {
      button.disabled = !hasDoc || !state || !enabled[button.dataset.referenceAction!];
      if (button.dataset.referenceAction === "bibliography") button.querySelector("span")!.textContent = state?.hasBibliography ? "更新书目" : "插入书目";
    }
    const level = this.panel.querySelector<HTMLSelectElement>("[data-reference-level]")!;
    level.disabled = !hasDoc || !state?.canOutline;
    level.value = String(state?.outlineLevel ?? 10);
    const style = this.panel.querySelector<HTMLSelectElement>("[data-reference-style]")!;
    style.disabled = !hasDoc || !state;
    style.value = state?.style ?? "APA";
    this.nextNoteId = state?.footnotes.some(({ id }) => id === this.nextNoteId) ? this.nextNoteId : undefined;
  }

  private onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.matches("[data-reference-level]")) this.host?.setTocLevel(Number(target.value));
    if (target.matches("[data-reference-style]")) this.host?.setCitationStyle(target.value as CitationStyle);
  };

  private onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-reference-action]");
    if (!button || button.disabled || !this.host) return;
    this.feedback("");
    const action = button.dataset.referenceAction;
    if (action === "toc" || action === "update-toc") this.host.insertToc();
    else if (action === "bibliography") {
      if (!this.host.insertBibliography()) this.feedback("请先在正文插入引文。");
    } else if (action === "figures") this.host.insertFigureList();
    else if (action === "next-note") {
      const { footnotes } = this.host.referenceState();
      if (!footnotes.length) return;
      const index = (footnotes.findIndex((note) => note.id === this.nextNoteId) + 1) % footnotes.length;
      const note = footnotes[index];
      this.nextNoteId = note.id;
      this.host.showNote(note.id);
      this.feedback(`脚注 ${index + 1}　${note.text}`);
    } else if (action === "footnote" || action === "endnote" || action === "caption" ||
      action === "citation" || action === "cross" || action === "notes") {
      this.open(action);
    }
  };

  private open(mode: FormMode): void {
    if (!this.host || this.dialog.open) return;
    const state = this.host.referenceState();
    const titles = {
      citation: "插入引文", footnote: "插入脚注", endnote: "插入尾注",
      caption: "插入题注", cross: "交叉引用", notes: "脚注与尾注",
    };
    this.mode = mode;
    this.dialog.querySelector("h2")!.textContent = titles[mode];
    this.dialog.setAttribute("aria-label", titles[mode]);
    this.submit.hidden = mode === "notes";
    this.close.textContent = mode === "notes" ? "关闭" : "取消";
    if (mode === "citation") {
      this.content.innerHTML = `
        <label>来源<select name="source"></select></label>
        <fieldset>
          <label>来源类型<select name="type"></select></label>
          <label>题名<input name="title" required></label>
          <label>作者<input name="author" placeholder="多位作者以分号隔开"></label>
          <label>年份<input name="year" inputmode="numeric"></label>
          <label>出版单位、期刊或网站<input name="container"></label>
          <label>网址或 DOI<input name="url"></label>
        </fieldset>`;
      const select = this.content.querySelector<HTMLSelectElement>('select[name="source"]')!;
      options(select, [...state.sources.map((item) => [item.tag, [item.author, item.title, item.year].filter(Boolean).join(" · ")] as const), ["", "新建来源"]]);
      options(this.content.querySelector('select[name="type"]')!, Object.entries(SOURCE_TYPES));
      const fields = this.content.querySelector("fieldset")!;
      const update = () => { fields.disabled = fields.hidden = !!select.value; };
      select.addEventListener("change", update);
      update();
    } else if (mode === "caption") {
      this.content.innerHTML = '<label>标签<select name="kind"><option value="Figure">图</option><option value="Table">表</option></select></label><label>题注文字<input name="text" required></label>';
      this.content.querySelector("select")!.value = state.captionKind;
    } else if (mode === "cross") {
      this.content.innerHTML = '<label>引用目标<select name="target" required></select></label><label>引用内容<select name="kind"><option value="text">标题、书签或题注文字</option><option value="page">页码</option></select></label>';
      options(this.content.querySelector('select[name="target"]')!, state.targets.map(({ id, text }) => [String(id), text]));
    } else if (mode === "notes") {
      this.content.replaceChildren();
      for (const [kind, label, notes] of [
        ["footnote", "脚注", state.footnotes], ["endnote", "尾注", state.endnotes],
      ] as const) {
        for (const [index, note] of notes.entries()) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "ho-word-reference-note";
          button.textContent = `${label} ${index + 1}　${note.text}`;
          button.addEventListener("click", () => {
            this.dialog.close();
            this.host?.showNote(note.id, kind);
          });
          this.content.append(button);
        }
      }
    } else {
      this.content.innerHTML = '<label>备注内容<textarea name="text" rows="4" required></textarea></label>';
    }
    this.dialog.showModal();
    this.content.querySelector<HTMLElement>('input:not([disabled]), textarea, select, button')?.focus();
  }

  private readonly onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const host = this.host;
    if (!host || this.mode === "notes") return;
    const values = new FormData(this.form);
    const get = (key: string) => String(values.get(key) ?? "").trim();
    const text = get("text");
    const citation: CitationDetails = {
      type: get("type"), author: get("author"), title: get("title"), year: get("year"), container: get("container"), url: get("url"),
    };
    if ((this.mode === "footnote" || this.mode === "endnote" || this.mode === "caption") && !text) return;
    if (this.mode === "citation" && !get("source") && !citation.title) return;
    this.dialog.close();
    if (this.mode === "footnote" || this.mode === "endnote") host.addFootnote(text, this.mode as NoteKind);
    else if (this.mode === "caption") host.insertCaption(get("kind") as CaptionKind, text);
    else if (this.mode === "citation") {
      if (!host.insertCitation(get("source") || citation)) this.feedback("请将光标放在正文可编辑文字中。");
    } else if (!host.insertCrossReference(Number(get("target")), get("kind") as CrossReferenceKind)) {
      this.feedback("请在引用目标所在段落之外插入交叉引用。");
    }
  };

  private feedback(message: string): void {
    this.panel.querySelector("[data-reference-status]")!.textContent = message;
  }
}

function options(select: HTMLSelectElement, values: readonly (readonly [string, string])[]): void {
  select.replaceChildren(...values.map(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }));
}
