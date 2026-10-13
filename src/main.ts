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
  insertTableRow: () => workspace.insertTableRow(),
  deleteTableRow: () => workspace.deleteTableRow(),
  insertTableColumn: () => workspace.insertTableColumn(),
  deleteTableColumn: () => workspace.deleteTableColumn(),
  mergeTableCells: () => workspace.mergeTableCells(),
  splitTableCell: () => workspace.splitTableCell(),
  insertToc: () => workspace.insertToc(),
  insertPageNumber: () => workspace.insertPageNumber(),
  toggleTitlePage: () => workspace.toggleTitlePage(),
  toggleEvenOdd: () => workspace.toggleEvenOdd(),
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
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void downloadDocx();
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
  const data = typeof source === "string" ? await (await fetch(source)).arrayBuffer() : source;
  workspace.load(await new DocxReader().read(data));
  caption = name;
  ribbon.sync();
}
