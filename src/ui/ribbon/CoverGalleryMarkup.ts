import { COVER_PLACEHOLDERS, COVER_TEMPLATE_IDS, coverTemplate, type CoverLineStyle, type CoverTemplateId } from "../../model/document/CoverPage";
import { RibbonIcons } from "./RibbonIcons";

export function coverGalleryMarkup(panelId: string): string {
  return `<div class="ho-word-drop ho-word-cover-drop">
    <button type="button" class="ho-word-big ho-word-cover-trigger" data-drop-toggle title="插入封面" aria-controls="${panelId}" aria-expanded="false">
      ${RibbonIcons.coverPage}<span>封面${RibbonIcons.chevronDown}</span>
    </button>
    <div id="${panelId}" class="ho-word-cover-gallery" data-ribbon-gallery role="group" aria-label="封面库">
      <div class="ho-word-cover-grid">${COVER_TEMPLATE_IDS.map(card).join("")}</div>
      <button type="button" class="ho-word-cover-remove" data-act="remove-cover" disabled>${RibbonIcons.removeCover}<span>删除封面</span></button>
    </div>
  </div>`;
}

function card(id: CoverTemplateId): string {
  const template = coverTemplate(id);
  const text = [template.label, ...COVER_PLACEHOLDERS];
  const lines = template.lines.map((line, index) => previewLine(line, text[index]));
  const font = template.serif ? " is-serif" : "";
  return `<button type="button" class="ho-word-cover-card" data-cover-template="${id}" aria-pressed="false">
    <span class="ho-word-cover-preview${font}" aria-hidden="true">${lines.join("")}</span>
    <span>${template.name}</span>
  </button>`;
}

function previewLine(line: CoverLineStyle, text: string): string {
  const scale = 0.145;
  const css = [
    `font-size:${Math.max(5, line.size * 0.32)}px`,
    `margin-top:${(line.before ?? 0) * scale}px`,
    `margin-bottom:${(line.after ?? 0) * scale}px`,
    line.inset && `padding-left:${line.inset * scale}px`,
    line.color && `color:${line.color}`,
    line.fill && `background:${line.fill}`,
    line.align && `text-align:${line.align}`,
    line.bold && "font-weight:700",
    line.rule && `border-${line.rule.side}:${line.rule.weight >= 3 ? 2 : 1}px solid ${line.rule.color}`,
  ].filter(Boolean);
  return `<span style="${css.join(";")}">${text}</span>`;
}
