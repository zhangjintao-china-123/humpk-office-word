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
  formatState: () => workspace.formatState(caption),
});
workspace.onUi(() => ribbon.sync());
workspace.onSave(() => {
  void downloadDocx();
});
workspace.newBlank();

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
  const data = await file.arrayBuffer();
  const documentModel = await new DocxReader().read(data);
  workspace.load(documentModel);
  caption = file.name;
  ribbon.sync();
  fileInput.value = "";
});
