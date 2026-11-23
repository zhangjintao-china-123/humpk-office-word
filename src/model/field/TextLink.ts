/** 正文超链接：外部地址或文档内书签。 */
export interface TextLink {
  url?: string;
  anchor?: string;
}

export function parseLinkInput(raw: string): TextLink | undefined {
  const text = raw.trim();
  if (!text) {
    return undefined;
  }
  if (text.startsWith("#")) {
    const anchor = text.slice(1).trim();
    return anchor ? { anchor } : undefined;
  }
  if (/^www\./i.test(text)) {
    return { url: `https://${text}` };
  }
  return { url: text };
}

export function sameLink(a: TextLink | undefined, b: TextLink | undefined): boolean {
  return !!a && !!b && a.url === b.url && a.anchor === b.anchor;
}

export function linkLabel(link: TextLink | undefined): string | undefined {
  if (!link) {
    return undefined;
  }
  if (link.anchor && !link.url) {
    return `#${link.anchor}`;
  }
  return link.url;
}

export interface FieldArgs {
  name: string;
  args: string[];
  switches: Map<string, string>;
}

export function fieldArgs(instr: string): FieldArgs {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(instr))) {
    tokens.push(match[1] ?? match[2]);
  }
  const name = tokens[0]?.toUpperCase() ?? "";
  const args: string[] = [];
  const switches = new Map<string, string>();
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith("\\")) {
      const key = token.slice(1).toLowerCase();
      const next = tokens[index + 1];
      if (next && !next.startsWith("\\")) {
        switches.set(key, next);
        index += 1;
      } else {
        switches.set(key, "");
      }
      continue;
    }
    args.push(token);
  }
  return { name, args, switches };
}

export function hyperlinkTarget(instr: string): TextLink | undefined {
  const parsed = fieldArgs(instr);
  if (parsed.name !== "HYPERLINK") {
    return undefined;
  }
  const anchor = parsed.switches.get("l");
  if (anchor) {
    return { anchor };
  }
  const url = parsed.args[0];
  return url ? { url } : undefined;
}
