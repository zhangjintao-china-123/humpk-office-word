/**
 * 把已经画好的纸页送去打印。
 * 零尺寸的 iframe 在 Chrome 里会排出空白页；图片没解码完就 print() 也是空白页。
 */
export function printImages(images: string[], widthPx: number, heightPx: number): void {
  if (!images.length) {
    return;
  }
  const width = (widthPx * 25.4) / 96;
  const height = (heightPx * 25.4) / 96;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "0";
  iframe.style.top = "0";
  iframe.style.zIndex = "30";
  iframe.style.width = `${Math.max(1, Math.ceil(widthPx))}px`;
  iframe.style.height = `${Math.max(1, Math.ceil(heightPx))}px`;
  iframe.style.border = "0";
  iframe.style.background = "#fff";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }
  const sheet = [
    `@page { size: ${width}mm ${height}mm; margin: 0; }`,
    "html, body { margin: 0; padding: 0; background: #fff; }",
    `img { display: block; width: ${width}mm; height: ${height}mm; page-break-after: always; break-after: page; }`,
    "img:last-child { page-break-after: auto; break-after: auto; }",
  ].join("");
  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>打印</title><style>${sheet}</style></head><body>${images
      .map((src) => `<img alt="" src="${src}">`)
      .join("")}</body></html>`,
  );
  doc.close();
  const remove = () => iframe.remove();
  win.addEventListener("afterprint", remove);
  const ready = Promise.all(
    [...doc.images].map((img) => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve())),
  );
  void ready.then(() => {
    if (!iframe.isConnected) {
      return;
    }
    win.focus();
    win.print();
  });
}
