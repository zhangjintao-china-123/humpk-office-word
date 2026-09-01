import { mergeParagraphAttrs, type ParagraphAttrs } from "./ParagraphAttrs";
import { mergeRunStyle, type RunStyle } from "./RunStyle";

export interface StyleDefinition {
  styleId: string;
  type?: string;
  basedOn?: string;
  paragraphAttrs?: ParagraphAttrs;
  runStyle?: RunStyle;
}

export interface ResolvedStyle {
  paragraphAttrs: ParagraphAttrs;
  runStyle: RunStyle;
}

export class StyleSheet {
  private styles = new Map<string, StyleDefinition>();

  add(style: StyleDefinition): void {
    this.styles.set(style.styleId, style);
  }

  get(styleId: string): StyleDefinition | undefined {
    return this.styles.get(styleId);
  }

  getResolved(styleId: string): ResolvedStyle {
    const chain: StyleDefinition[] = [];
    const seen = new Set<string>();
    let current = this.styles.get(styleId);
    while (current && !seen.has(current.styleId)) {
      seen.add(current.styleId);
      chain.push(current);
      current = current.basedOn ? this.styles.get(current.basedOn) : undefined;
    }

    let paragraphAttrs: ParagraphAttrs = {};
    let runStyle: RunStyle = {};
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const item = chain[i];
      paragraphAttrs = mergeParagraphAttrs(paragraphAttrs, item.paragraphAttrs);
      runStyle = mergeRunStyle(runStyle, item.runStyle);
    }
    return { paragraphAttrs, runStyle };
  }
}
