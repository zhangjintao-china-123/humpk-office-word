function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\//, "");
}

/** 把 rels 里的 Target 收成包内路径，如 header1.xml → word/header1.xml */
export function resolveWordPart(target: string): string {
  const path = normalize(target);
  if (path.startsWith("word/")) {
    return path;
  }
  return `word/${path}`;
}

/** word/header1.xml → word/_rels/header1.xml.rels */
export function relsPathFor(partPath: string): string {
  const path = normalize(partPath);
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash) : "";
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  return dir ? `${dir}/_rels/${file}.rels` : `_rels/${file}.rels`;
}
