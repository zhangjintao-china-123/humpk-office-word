import { GALLERY_STYLE_KEYS, STYLE_GALLERY, type GalleryStyleKey } from "../../model/style/StyleGallery";
import { RibbonIcons } from "./RibbonIcons";

const QUICK_STYLES: GalleryStyleKey[] = ["normal", "noSpacing", "heading1", "heading2"];

export function styleGalleryMarkup(panelId: string): string {
  return `<div class="ho-word-styles ho-word-drop ho-word-style-drop">
    <div class="ho-word-style-strip" role="group" aria-label="常用样式">${QUICK_STYLES.map((key) => card(key, true)).join("")}</div>
    <button type="button" class="ho-word-style-trigger" data-drop-toggle title="展开样式库" aria-label="展开样式库" aria-expanded="false" aria-controls="${panelId}">
      ${RibbonIcons.chevronDown}
    </button>
    <div id="${panelId}" class="ho-word-style-gallery" data-ribbon-gallery role="group" aria-label="样式库">
      <div class="ho-word-style-grid">${GALLERY_STYLE_KEYS.map((key) => card(key)).join("")}</div>
      <button type="button" class="ho-word-style-clear" data-act="clear">${RibbonIcons.clearFormat}<span>清除格式</span></button>
    </div>
  </div>`;
}

function card(key: GalleryStyleKey, compact = false): string {
  const { label, type, runStyle, paragraphAttrs } = STYLE_GALLERY[key];
  const size = Math.min(25, Math.max(13, (runStyle?.fontSizePx ?? 16) * 0.83));
  const css = [
    `font-size:${size}px`,
    runStyle?.color && `color:${runStyle.color}`,
    runStyle?.bold && "font-weight:700",
    runStyle?.italic && "font-style:italic",
    runStyle?.smallCaps && "font-variant-caps:small-caps",
  ].filter(Boolean).join(";");
  const bordered = paragraphAttrs?.borderTop ? " has-border" : "";
  const sample = compact && size >= 17 ? "AaBbC" : "AaBbCcDd";
  return `<button type="button" class="ho-word-style-card" data-style="${key}" aria-pressed="false" title="${label} · ${type === "paragraph" ? "段落样式" : "字符样式"}">
    <span class="ho-word-style-preview${bordered}" style="${css}" aria-hidden="true">${sample}</span>
    <span class="ho-word-style-label">${label}</span>
  </button>`;
}
