import { DocxReader } from "./io/docx/reader/DocxReader";
import { Ribbon } from "./ui/ribbon/Ribbon";
import { Workspace } from "./ui/workspace/Workspace";
import "./styles/workspace.css";
import "./styles/ribbon.css";
import "./styles/contextmenu.css";

document.title = "humpk-office";

const app = document.getElementById("app");
if (!app) {
  throw new Error("missing #app");
}

app.className = "ho-word-app";
app.innerHTML = `
  <div id="ribbon"></div>
  <input id="file" type="file" accept=".docx" hidden />
  <div id="workspace"></div>
`;

const ribbonHost = app.querySelector<HTMLElement>("#ribbon");
const fileInput = app.querySelector<HTMLInputElement>("#file");
const workspaceHost = app.querySelector<HTMLElement>("#workspace");
if (!ribbonHost || !fileInput || !workspaceHost) {
  throw new Error("app chrome missing");
}

const workspace = new Workspace(workspaceHost);
let caption = "未命名文档";

const ribbon = new Ribbon(ribbonHost, {
  applyFormat: (action) => workspace.applyFormat(action),
  applyOutline: (action) => workspace.applyOutline(action),
  applyTableBorder: (mode) => workspace.applyTableBorder(mode),
  setBorderPen: (pen) => workspace.setBorderPen(pen),
  undo: () => {
    workspace.history.undo();
  },
  redo: () => {
    workspace.history.redo();
  },
  newBlank: () => {
    caption = "未命名文档";
    workspace.newBlank();
  },
  openFile: () => fileInput.click(),
  saveFile: () => {
    void downloadDocx();
  },
  insertTable: () => workspace.insertTable(),
  insertPageBreak: () => workspace.insertPageBreak(),
  insertTableRow: () => workspace.insertTableRow(),
  deleteTableRow: () => workspace.deleteTableRow(),
  insertTableColumn: () => workspace.insertTableColumn(),
  deleteTableColumn: () => workspace.deleteTableColumn(),
  mergeTableCells: () => workspace.mergeTableCells(),
  splitTableCell: () => workspace.splitTableCell(),
  insertToc: () => workspace.insertToc(),
  insertPageNumber: () => workspace.insertPageNumber(),
  applyLink: (raw) => workspace.applyLink(raw),
  clearLink: () => workspace.clearLink(),
  addComment: (text) => workspace.addComment(text),
  addFootnote: (text) => workspace.addFootnote(text),
  showComment: (id) => workspace.showComment(id),
  showNote: (id) => workspace.showNote(id),
  acceptRevision: () => workspace.acceptRevision(),
  rejectRevision: () => workspace.rejectRevision(),
  toggleTitlePage: () => workspace.toggleTitlePage(),
  toggleEvenOdd: () => workspace.toggleEvenOdd(),
  setZoom: (zoom) => workspace.setZoom(zoom),
  print: () => workspace.print(),
  findNext: (query) => workspace.findNext(query),
  findPrev: (query) => workspace.findPrev(query),
  replaceMatch: (query, replacement) => workspace.replaceMatch(query, replacement),
  replaceAllMatches: (query, replacement) => workspace.replaceAllMatches(query, replacement),
  closeFind: () => workspace.closeFind(),
  formatState: () => workspace.formatState(caption),
});
workspace.onUi(() => ribbon.sync());
workspace.onSave(() => {
  void downloadDocx();
});
workspace.newBlank();

const demoName = new URLSearchParams(location.search).get("demo");
if (demoName === "toc") {
  void openNamedDocx("/toc-demo.docx", "toc-demo.docx");
} else if (demoName === "header") {
  void openNamedDocx("/header-demo.docx", "header-demo.docx");
} else if (demoName === "wrap") {
  void openNamedDocx("/wrap-demo.docx", "wrap-demo.docx");
} else if (demoName === "paragraph") {
  void openNamedDocx("/paragraph-demo.docx", "paragraph-demo.docx");
} else if (demoName === "mix") {
  void openNamedDocx("/mix-demo.docx", "mix-demo.docx");
} else if (demoName === "table") {
  void openNamedDocx("/table-demo.docx", "table-demo.docx");
} else if (demoName === "link") {
  void openNamedDocx("/link-demo.docx", "link-demo.docx");
} else if (demoName === "review") {
  void openNamedDocx("/review-demo.docx", "review-demo.docx");
} else if (demoName === "review-track") {
  void openNamedDocx("/review-track-demo.docx", "review-track-demo.docx");
} else if (demoName === "review-notes") {
  void openNamedDocx("/review-notes-demo.docx", "review-notes-demo.docx");
} else if (demoName === "graphic") {
  void openNamedDocx("/graphic-demo.docx", "graphic-demo.docx");
} else if (demoName === "shape") {
  void openNamedDocx("/shape-demo.docx", "shape-demo.docx");
} else if (demoName === "math") {
  void openNamedDocx("/math-demo.docx", "math-demo.docx");
} else if (demoName === "find") {
  void openNamedDocx("/find-demo.docx", "find-demo.docx");
} else if (demoName === "pages") {
  void openNamedDocx("/pages-demo.docx", "pages-demo.docx");
}

async function downloadDocx(): Promise<void> {
  const data = await workspace.exportDocx();
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const name = caption.toLowerCase().endsWith(".docx") ? caption : `${caption}.docx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

window.addEventListener("resize", () => {
  workspace.setPageCount(workspace.pageCount);
});

window.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "s") {
    event.preventDefault();
    void downloadDocx();
  } else if (key === "f") {
    event.preventDefault();
    ribbon.openFind();
  } else if (key === "h") {
    event.preventDefault();
    ribbon.openFind(true);
  } else if (key === "p") {
    event.preventDefault();
    workspace.print();
  } else if (event.key === "0") {
    event.preventDefault();
    workspace.setZoom(1);
  }
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }
  await openNamedDocx(await file.arrayBuffer(), file.name);
  fileInput.value = "";
});

async function openNamedDocx(source: ArrayBuffer | string, name: string): Promise<void> {
  const data = typeof source === "string" ? await (await fetch(source, { cache: "no-store" })).arrayBuffer() : source;
  const document = await new DocxReader().read(data);
  document.fileName = name;
  workspace.load(document);
  caption = name;
  ribbon.sync();
}
