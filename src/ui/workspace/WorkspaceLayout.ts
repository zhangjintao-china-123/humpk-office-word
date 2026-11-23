import type { PageOrigin } from "../../editor/StoryEditor";
import type { PageSetup } from "../../render/page/PageSetup";

export const SIDE_PAD = 40;
export const TOP_PAD = 32;

export function pageOriginX(clientWidth: number, pageWidth: number, sidePad = SIDE_PAD): number {
  if (clientWidth >= pageWidth + sidePad * 2) {
    return Math.round((clientWidth - pageWidth) / 2);
  }
  return sidePad;
}

export function pageOrigins(pageSetup: PageSetup, pageCount: number, originX: number): PageOrigin[] {
  const origins: PageOrigin[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    origins.push({
      x: originX,
      y: TOP_PAD + i * (pageSetup.height + pageSetup.pageGap),
    });
  }
  return origins;
}
