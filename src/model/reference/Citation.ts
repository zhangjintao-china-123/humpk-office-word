export type CitationStyle = "APA" | "MLA";

export const SOURCE_TYPES = {
  Book: "图书",
  JournalArticle: "期刊文章",
  InternetSite: "网页",
} as const;

export interface CitationDetails {
  type: string;
  author: string;
  title: string;
  year: string;
  container: string;
  url: string;
}

export interface CitationSource extends CitationDetails {
  tag: string;
  /** 保留外部来源中项目暂未编辑的书目字段。 */
  originalXml?: string;
}

export function citationTag(instruction: string): string | undefined {
  const match = /^CITATION\s+(?:"([^"]+)"|([^\s\\]+))(?:\s+\\l\s+\d+)?\s*$/i.exec(instruction.trim());
  return match?.[1] ?? match?.[2];
}

export function authorNames(value: string): string[] {
  return value.split(/[;；]/).map((name) => name.trim()).filter(Boolean);
}

export function splitName(name: string): { first: string; last: string } {
  const comma = name.indexOf(",");
  if (comma >= 0) return { last: name.slice(0, comma).trim(), first: name.slice(comma + 1).trim() };
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || /\p{Script=Han}/u.test(name)) return { first: "", last: name };
  return { first: words.slice(0, -1).join(" "), last: words[words.length - 1] };
}

export function citationText(source: CitationSource, style: CitationStyle, sources: CitationSource[]): string {
  const last = authorShort(source, style);
  if (style === "MLA") return `(${last})`;
  const year = source.year || "n.d.";
  const peers = sources
    .filter((item) => authorShort(item, style) === last && (item.year || "n.d.") === year)
    .sort((a, b) => a.title.localeCompare(b.title) || a.tag.localeCompare(b.tag));
  const suffix = peers.length > 1 ? String.fromCharCode(97 + peers.findIndex((item) => item.tag === source.tag)) : "";
  return `(${last}, ${year}${suffix})`;
}

export function bibliographyText(source: CitationSource, style: CitationStyle, sources: CitationSource[]): string {
  const authors = authorNames(source.author);
  const names = authors.map((name) => {
    const { first, last } = splitName(name);
    if (!first) return last;
    return style === "MLA" ? `${last}, ${first}` :
      `${last}, ${first.split(/[\s-]+/).map((part) => `${part.charAt(0)}.`).join(" ")}`;
  });
  if (style === "MLA") {
    const title = source.type === "Book" ? source.title : `“${source.title}”`;
    return [names.join(", and "), title, [source.container, source.year].filter(Boolean).join(", "), source.url]
      .filter(Boolean).map(sentence).join(" ");
  }
  const year = citationText(source, style, sources).split(", ").at(-1)?.slice(0, -1) ?? "n.d.";
  const author = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0] ?? "";
  return [author && sentence(author), `(${year}).`, sentence(source.title), source.container && sentence(source.container), source.url]
    .filter(Boolean).join(" ");
}

function authorShort(source: CitationDetails, style: CitationStyle): string {
  const names = authorNames(source.author).map((name) => splitName(name).last);
  if (!names.length) return source.title;
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(style === "APA" ? " & " : " and ");
  return `${names[0]} et al.`;
}

function sentence(value: string): string {
  return /[.。!?！？]$/.test(value) ? value : `${value}.`;
}
