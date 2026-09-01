import type { PageOrigin } from "../../editor/StoryEditor";
import type { PageSetup } from "../../render/page/PageSetup";

export const SIDE_PAD = 40;
export const TOP_PAD = 32;

export function pageOriginX(clientWidth: number, pageWidth: number): number {
  if (clientWidth > pageWidth + SIDE_PAD * 2) {
    return Math.round((clientWidth - pageWidth) / 2);
  }
  return SIDE_PAD;
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
