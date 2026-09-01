import { emuToPx, halfPointToPx, parseNumber, twipToPx } from "../../../shared/units";

export class OoxmlUnits {
  twipToPx(value: string | undefined): number | undefined {
    const n = parseNumber(value);
    return n == null ? undefined : twipToPx(n);
  }

  emuToPx(value: string | undefined): number | undefined {
    const n = parseNumber(value);
    return n == null ? undefined : emuToPx(n);
  }

  halfPointToPx(value: string | undefined): number | undefined {
    const n = parseNumber(value);
    return n == null ? undefined : halfPointToPx(n);
  }
}
