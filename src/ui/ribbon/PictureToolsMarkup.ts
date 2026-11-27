import { PICTURE_STYLES, type PictureAppearanceAction, type PictureStyle } from "../../model/graphic/PictureAppearance";

const icons = {
  correction: svg('<circle cx="12" cy="12" r="4.6" fill="#ffe8b6" stroke="#c77b24"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2" stroke="#c77b24"/>'),
  color: svg('<rect x="3" y="4" width="18" height="16" rx="2" fill="#e2f3ff"/><circle cx="16" cy="9" r="1.5" fill="#dd9c3b" stroke="none"/><path d="m3 16 5-5 4 4 3-2 6 5" stroke="#1984aa"/>'),
  opacity: svg('<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m2-18h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" fill="#e2f3ff"/><path d="M12 2v20m3-15h3m-3 4h2m-2 4h3m-3 4h2" stroke="#1984aa"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  frame: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6" y="7" width="12" height="10" rx="1" fill="#e2f3ff" stroke="#1984aa"/><path d="m7 15 3-3 2 2 2-1 3 2" stroke="#1984aa"/>'),
  effect: svg('<path d="m4 11 5-6h10l-5 6Zm0 4 5-4h5l5-6v5l-5 6H4Zm0 3h10l5-6v3l-5 5H4Z" fill="#e2f3ff"/>'),
  crop: svg('<path d="M7 2v14h15M2 7h15v15m-9-6 8-8" stroke-width="1.6"/><path d="M7 9h8v7H7Z" fill="#c6e8ff" stroke="none" opacity=".48"/>'),
};

export function pictureAdjustmentMarkup(): string {
  return group("调整", `
    ${dropdown("更正", icons.correction, `
      ${item("原始亮度和对比度", "correction:0:0")}
      ${item("提亮", "correction:0.2:0")}
      ${item("降低亮度", "correction:-0.2:0")}
      ${item("增强对比度", "correction:0:0.25")}
      ${item("降低对比度", "correction:0:-0.2")}
    `)}
    ${dropdown("颜色", icons.color, `
      ${item("原始颜色", "color:original")}
      ${item("灰度", "color:gray")}
      ${item("黑白", "color:mono")}
    `)}
    ${dropdown("透明度", icons.opacity, [0, 15, 30, 50, 75].map((v) => item(`${v}%`, `opacity:${v}`)).join(""))}
    ${dropdown("更多", icons.more, `
      <button type="button" data-picture-file="replace">更改图片…</button>
      <button type="button" data-picture-file="compress">压缩图片（150 ppi）</button>
      <button type="button" data-picture-file="remove-background">删除纯色背景</button>
      <div class="ho-word-border-split" role="separator"></div>
      ${item("重置图片格式", "reset")}
      <form class="ho-picture-form" data-picture-form="description" aria-label="替代文字">
        <label>替代文字<textarea name="text" rows="2" maxlength="1000"></textarea></label>
        <button type="submit" data-picture-format="description">应用</button>
      </form>
    `)}
  `);
}

export function pictureStylesMarkup(): string {
  const styles = Object.entries(PICTURE_STYLES).map(([name, preset]) =>
    `<button type="button" class="ho-picture-swatch" data-picture-format="style:${name}" title="${preset.label}" aria-label="${preset.label}" aria-pressed="false"><img alt="" /></button>`).join("");
  return group("图片样式", `
    <div class="ho-picture-styles" role="group" aria-label="图片预设样式">${styles}</div>
    <div class="ho-picture-appearance-options">
      ${dropdown("边框", icons.frame, `
        ${item("无边框", "border:none")}
        ${item("深色 · 1.5 磅", "border:#26394e:2")}
        ${item("白色 · 3 磅", "border:#ffffff:4")}
        ${item("蓝色 · 2.25 磅", "border:#2b579a:3")}
      `)}
      ${dropdown("效果", icons.effect, `
        ${item("无阴影", "shadow:off")}
        ${item("柔和阴影", "shadow:on")}
      `)}
    </div>
  `);
}

export function pictureCropMarkup(): string {
  return `<div data-picture-image-tool hidden>
    ${dropdown("裁剪", icons.crop, `
      ${item("裁为正方形（1:1）", "ratio:1")}
      ${item("裁为横向（4:3）", "ratio:1.3333333333333333")}
      ${item("裁为宽屏（16:9）", "ratio:1.7777777777777777")}
      ${item("裁为纵向（3:4）", "ratio:0.75")}
      ${item("取消裁剪", "crop:none")}
      <form class="ho-picture-form" data-picture-form="crop" aria-label="精确裁剪">
        ${Object.entries({ left: "左侧", right: "右侧", top: "上侧", bottom: "下侧" }).map(([side, label]) =>
          `<label>${label}<input name="${side}" type="number" min="0" max="95" step="any" required aria-label="${label}裁剪百分比" /><span>%</span></label>`).join("")}
        <button type="submit" data-picture-format="crop">应用裁剪</button>
      </form>
    `)}
  </div>`;
}

export function readPictureFormatAction(button: HTMLButtonElement): PictureAppearanceAction | undefined {
  const [type, first, second] = button.dataset.pictureFormat!.split(":");
  switch (type) {
    case "style": return { type, style: first as PictureStyle };
    case "correction": return { type, brightness: Number(first), contrast: Number(second) };
    case "color": return { type, color: first === "gray" || first === "mono" ? first : undefined };
    case "opacity": return { type, opacity: 1 - Number(first) / 100 };
    case "border": return { type, border: first === "none" ? undefined : { color: first, width: Number(second) } };
    case "shadow": return { type, enabled: first === "on" };
    case "ratio": return { type, ratio: Number(first) };
    case "description": return { type, text: String(new FormData(button.form!).get("text") ?? "") };
    case "crop": {
      if (first === "none") return { type, crop: { left: 0, right: 0, top: 0, bottom: 0 } };
      const form = button.form;
      if (!form?.reportValidity()) return undefined;
      const values = new FormData(form);
      const fraction = (side: string) => Number(values.get(side)) / 100;
      return { type, crop: { left: fraction("left"), right: fraction("right"), top: fraction("top"), bottom: fraction("bottom") } };
    }
    case "reset": return { type };
    default: return undefined;
  }
}

function group(label: string, content: string): string {
  return `<section class="ho-word-group ho-picture-group" data-picture-image-tool hidden>
    <div class="ho-word-group-body">${content}</div><span>${label}</span>
  </section>`;
}

function dropdown(label: string, icon: string, items: string): string {
  return `<div class="ho-word-drop ho-picture-drop">
    <button type="button" class="ho-picture-tool" data-drop-toggle aria-expanded="false">
      ${icon}<span>${label}<svg class="ho-table-chevron" viewBox="0 0 10 6" aria-hidden="true"><path d="m1 1 4 4 4-4"/></svg></span>
    </button>
    <div class="ho-word-outline-menu ho-picture-menu">${items}</div>
  </div>`;
}

function item(label: string, action: string): string {
  return `<button type="button" data-picture-format="${action}"${action.startsWith("ratio:") || action.startsWith("crop:") || action === "reset" ? "" : ' aria-pressed="false"'}>${label}</button>`;
}

function svg(path: string): string {
  return `<svg class="ho-picture-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
