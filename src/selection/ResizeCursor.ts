let owner: object | null = null;

/** 表格线和图片控点共用，后写入的一方持有，离开时不能把别人的光标清掉。 */
export function applyResizeCursor(token: object, element: HTMLElement | null, cursor: string): void {
  const root = document.documentElement;
  if (!cursor) {
    if (owner !== token) {
      return;
    }
    owner = null;
    if (element) {
      element.style.cursor = "";
    }
    root.classList.remove("ho-table-resize");
    root.style.removeProperty("--ho-resize-cursor");
    return;
  }
  owner = token;
  if (element) {
    element.style.cursor = cursor;
  }
  root.style.setProperty("--ho-resize-cursor", cursor);
  root.classList.add("ho-table-resize");
}
