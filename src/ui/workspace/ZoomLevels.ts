export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function stepZoom(current: number, direction: -1 | 1): number {
  if (direction > 0) {
    return ZOOM_LEVELS.find((level) => level > current + 0.001) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  }
  return [...ZOOM_LEVELS].reverse().find((level) => level < current - 0.001) ?? ZOOM_LEVELS[0];
}
