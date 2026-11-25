/** Word「字体颜色」下拉：自动、主题颜色、标准色、更多颜色。 */

export const THEME_BASES = ["#FFFFFF", "#000000", "#E7E6E6", "#44546A", "#5B9BD5", "#ED7D31", "#A5A5A5", "#FFC000", "#4472C4", "#70AD47"];
const THEME_SHADES = [0.8, 0.6, 0.4, -0.25, -0.5];
export const STANDARD_COLORS = ["#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050", "#00B050", "#00B0F0", "#0070C0", "#002060", "#7030A0"];

export function mixColor(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = (channel: number) => {
    const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  const channels = [mix((value >> 16) & 255), mix((value >> 8) & 255), mix(value & 255)];
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function themeShadeRows(): string[][] {
  return THEME_SHADES.map((amount) => THEME_BASES.map((base) => mixColor(base, amount)));
}

export function normalizeColor(value: string | undefined): string {
  if (!value || value === "auto" || value === "none") {
    return "auto";
  }
  const hex = value.startsWith("#") ? value : `#${value}`;
  return hex.toUpperCase();
}

export function textColorPaletteMarkup(): string {
  const theme = [...THEME_BASES, ...themeShadeRows().flat()];
  return `<div class="ho-word-palette ho-word-palette-text">
      <button type="button" data-color="auto" class="ho-word-palette-auto" title="自动">自动</button>
      <div class="ho-word-palette-label">主题颜色</div>
      <div class="ho-word-palette-theme">
        ${theme.map((color, index) => swatch(color, index < 10 ? "theme-base" : "")).join("")}
      </div>
      <div class="ho-word-palette-label">标准色</div>
      <div class="ho-word-palette-standard">
        ${STANDARD_COLORS.map((color) => swatch(color)).join("")}
      </div>
      <div class="ho-word-palette-split"></div>
      <button type="button" data-custom-color="text" class="ho-word-palette-more" title="更多颜色">
        <span class="ho-word-palette-wheel" aria-hidden="true"></span>更多颜色...
      </button>
    </div>`;
}

function swatch(color: string, extra = ""): string {
  const cls = extra ? ` class="${extra}"` : "";
  return `<button type="button" data-color="${color}"${cls} style="background:${color}" title="${color}"></button>`;
}
