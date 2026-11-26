import { SHAPE_PRESET_ITEMS, SHAPE_STYLE_PRESETS, type ShapePreset } from "../../model/graphic/Shape";
import { paletteColorsMarkup } from "./ColorPalette";
import { RibbonIcons } from "./RibbonIcons";

const OUTLINE_WIDTHS_PT = [0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];

function trigger(label: string, icon: string, sample = ""): string {
  return `<button type="button" class="ho-word-textbox-format-trigger" data-drop-toggle aria-expanded="false">
    ${icon}<span>${label}</span>${sample}${RibbonIcons.chevronDown}
  </button>`;
}

function shapePreviewSvg(preset: Exclude<ShapePreset, "unknown">): string {
  const path = (() => {
    switch (preset) {
      case "rect":
        return '<rect x="2" y="3" width="16" height="14"/>';
      case "roundRect":
        return '<rect x="2" y="3" width="16" height="14" rx="3"/>';
      case "ellipse":
        return '<ellipse cx="10" cy="10" rx="8" ry="6.5"/>';
      case "triangle":
        return '<polygon points="10,2 18,17 2,17"/>';
      case "diamond":
        return '<polygon points="10,2 18,10 10,18 2,10"/>';
      case "parallelogram":
        return '<polygon points="5,3 18,3 15,17 2,17"/>';
      case "trapezoid":
        return '<polygon points="5,3 15,3 18,17 2,17"/>';
      case "pentagon":
        return '<polygon points="10,2 18,8 15,17 5,17 2,8"/>';
      case "hexagon":
        return '<polygon points="5,3 15,3 18,10 15,17 5,17 2,10"/>';
      case "octagon":
        return '<polygon points="6,2 14,2 18,6 18,14 14,18 6,18 2,14 2,6"/>';
      case "rightArrow":
        return '<polygon points="2,7 11,7 11,3 18,10 11,17 11,13 2,13"/>';
      case "leftArrow":
        return '<polygon points="2,10 9,3 9,7 18,7 18,13 9,13 9,17"/>';
      case "upArrow":
        return '<polygon points="10,2 17,9 13,9 13,18 7,18 7,9 3,9"/>';
      case "downArrow":
        return '<polygon points="7,2 13,2 13,11 17,11 10,18 3,11 7,11"/>';
      case "chevron":
        return '<polygon points="2,3 14,3 18,10 14,17 2,17 6,10"/>';
      case "plus":
        return '<polygon points="8,2 12,2 12,8 18,8 18,12 12,12 12,18 8,18 8,12 2,12 2,8 8,8"/>';
      case "star5":
        return '<polygon points="10,2 12.4,7.2 18,7.9 13.8,11.8 14.9,17.5 10,14.7 5.1,17.5 6.2,11.8 2,7.9 7.6,7.2"/>';
      case "wedgeRectCallout":
        return '<polygon points="2,2 18,2 18,14 9,14 5,18 6,14 2,14"/>';
      default:
        return '<rect x="2" y="3" width="16" height="14"/>';
    }
  })();
  return `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${path}</svg>`;
}

function changeShapeMarkup(): string {
  return `<div class="ho-word-drop" data-textbox-change-shape>
    ${trigger("更改形状", RibbonIcons.changeShape)}
    <div class="ho-word-outline-menu ho-word-shape-gallery">
      <div class="ho-word-shape-grid">
        ${SHAPE_PRESET_ITEMS.map(
          (item) =>
            `<button type="button" data-shape-preset="${item.preset}" title="${item.label}">${shapePreviewSvg(item.preset)}</button>`,
        ).join("")}
      </div>
    </div>
  </div>`;
}

function shapeStyleGalleryMarkup(): string {
  return `<div class="ho-word-drop" data-textbox-style-gallery>
    ${trigger("形状样式", RibbonIcons.shapeStyle)}
    <div class="ho-word-outline-menu ho-word-style-preset-menu">
      <div class="ho-word-style-preset-grid">
        ${SHAPE_STYLE_PRESETS.map((preset) => {
          const bg = preset.fill ?? "transparent";
          const border = preset.line ? `${Math.max(1, preset.lineWidth ?? 1)}px solid ${preset.line}` : "1px dashed #c0c6ce";
          const color = isDarkFill(preset.fill) ? "#ffffff" : "#1f2937";
          return `<button type="button" data-shape-style="${preset.id}" title="${preset.label}" style="background:${bg};border:${border};color:${color};">Abc</button>`;
        }).join("")}
      </div>
    </div>
  </div>`;
}

function isDarkFill(hex: string | undefined): boolean {
  if (!hex) {
    return false;
  }
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) {
    return false;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

function shapePalette(target: "fill" | "line"): string {
  const fill = target === "fill";
  const label = fill ? "形状填充" : "形状轮廓";
  const empty = fill ? "无填充" : "无轮廓";
  const sample = `<span class="ho-word-textbox-swatch" data-textbox-swatch="${target}" aria-hidden="true"></span>`;
  const widths = fill ? "" : `
    <div class="ho-word-palette-split"></div>
    <div class="ho-word-palette-label ho-word-textbox-width-label">线宽 <span data-textbox-current-width></span></div>
    <div class="ho-word-textbox-widths">
      ${OUTLINE_WIDTHS_PT.map((width) => `<button type="button" data-textbox-line-width="${width}">${width} 磅</button>`).join("")}
    </div>`;
  return `<div class="ho-word-drop" data-textbox-paint="${target}">
    ${trigger(label, fill ? RibbonIcons.paraShading : RibbonIcons.shapeOutline, sample)}
    <div class="ho-word-palette ho-word-palette-text ho-word-textbox-palette">
      <button type="button" data-textbox-color="none" class="ho-word-palette-none">${empty}</button>
      ${paletteColorsMarkup("data-textbox-color")}
      <div class="ho-word-palette-split"></div>
      <button type="button" data-textbox-custom-color class="ho-word-palette-more">${RibbonIcons.palette}更多颜色…</button>
      ${widths}
    </div>
  </div>`;
}

export function textBoxToolsMarkup(): string {
  return `<section class="ho-word-group" data-textbox-tools hidden>
    <div class="ho-word-group-body ho-word-textbox-format-controls ho-word-textbox-style-controls">
      ${changeShapeMarkup()}
      ${shapeStyleGalleryMarkup()}
      ${shapePalette("fill")}
      ${shapePalette("line")}
    </div>
    <span>形状样式</span>
  </section>
  <section class="ho-word-group" data-textbox-tools hidden>
    <div class="ho-word-group-body ho-word-textbox-format-controls">
      <div class="ho-word-drop">
        ${trigger("文字方向", RibbonIcons.textDirection)}
        <div class="ho-word-outline-menu">
          <button type="button" data-textbox-direction="horizontal">${RibbonIcons.textBox}横排</button>
          <button type="button" data-textbox-direction="vertical">${RibbonIcons.verticalTextBox}竖排</button>
        </div>
      </div>
      <div class="ho-word-drop">
        ${trigger("对齐文本", RibbonIcons.textBoxAlign)}
        <div class="ho-word-outline-menu">
          <button type="button" data-textbox-align="start">顶端</button>
          <button type="button" data-textbox-align="center">居中</button>
          <button type="button" data-textbox-align="end">底端</button>
        </div>
      </div>
    </div>
    <span>文本</span>
  </section>`;
}
