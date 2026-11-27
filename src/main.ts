import { DocxReader } from "./io/docx/reader/DocxReader";
import { Ribbon } from "./ui/ribbon/Ribbon";
import { StatusBar } from "./ui/statusbar/StatusBar";
import { Workspace } from "./ui/workspace/Workspace";
import { documentStats } from "./edit/DocumentStats";
import type { Drawing } from "./model/inline/Drawing";
import "./styles/workspace.css";
import "./styles/navigation.css";
import "./styles/ribbon.css";
import "./styles/contextmenu.css";
import "./styles/statusbar.css";

document.title = "humpk-office";

const app = document.getElementById("app");
if (!app) {
  throw new Error("missing #app");
}

app.className = "ho-word-app";
app.innerHTML = `
  <div id="ribbon"></div>
  <input id="file" type="file" accept=".docx" hidden />
  <input id="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml" hidden />
  <input id="replace-image" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml" hidden />
  <div id="workspace"></div>
  <footer id="statusbar" aria-label="文档状态"></footer>
`;

const ribbonHost = app.querySelector<HTMLElement>("#ribbon");
const fileInput = app.querySelector<HTMLInputElement>("#file");
const imageInput = app.querySelector<HTMLInputElement>("#image");
const replaceImageInput = app.querySelector<HTMLInputElement>("#replace-image");
const workspaceHost = app.querySelector<HTMLElement>("#workspace");
const statusHost = app.querySelector<HTMLElement>("#statusbar");
if (!ribbonHost || !fileInput || !imageInput || !replaceImageInput || !workspaceHost || !statusHost) {
  throw new Error("app chrome missing");
}

const workspace = new Workspace(workspaceHost);
let replaceImageTarget: Drawing | undefined;
new StatusBar(statusHost, workspace);
let caption = "未命名文档";

const ribbon = new Ribbon(ribbonHost, {
  references: workspace,
  view: workspace,
  applyFormat: (action) => workspace.applyFormat(action),
  applyCase: (mode) => workspace.applyCase(mode),
  applyEnclosed: (action) => workspace.applyEnclosed(action),
  inspectEnclosed: () => workspace.inspectEnclosed(),
  applyAsianLayout: (action) => workspace.applyAsianLayout(action),
  inspectAsianLayout: (kind) => workspace.inspectAsianLayout(kind),
  applySort: (options) => workspace.applySort(options),
  inspectSort: () => workspace.inspectSort(),
  toggleShowMarks: () => workspace.toggleShowMarks(),
  applyShading: (color) => workspace.applyShading(color),
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
  insertTable: (rows, cols) => workspace.insertTable(rows, cols),
  insertCoverPage: (template) => workspace.insertCoverPage(template),
  removeCoverPage: () => workspace.removeCoverPage(),
  drawTextBox: (direction) => workspace.drawTextBox(direction),
  insertPageBreak: () => workspace.insertPageBreak(),
  insertBlankPage: () => workspace.insertBlankPage(),
  insertPicture: () => imageInput.click(),
  applyPictureWrap: (wrap) => workspace.applyPictureWrap(wrap),
  applyPicturePlace: (place) => workspace.applyPicturePlace(place),
  applyPictureSize: (width, height, lock) => workspace.applyPictureSize(width, height, lock),
  applyPictureAppearance: (action) => workspace.applyPictureAppearance(action),
  applyPicturePixels: (action) => workspace.applyPicturePixels(action),
  replacePicture: () => {
    replaceImageTarget = workspace.selectedPicture()?.drawing;
    if (replaceImageTarget) replaceImageInput.click();
  },
  applyTextBoxFormat: (change) => workspace.applyTextBoxFormat(change),
  applyLayerOrder: (action) => workspace.applyLayerOrder(action),
  applyAlign: (action, reference) => workspace.applyAlign(action, reference),
  applyDistribute: (axis) => workspace.applyDistribute(axis),
  applyRotate: (action) => workspace.applyRotate(action),
  toggleSelectionPane: () => workspace.toggleSelectionPane(),
  editHeader: () => workspace.editHeader(),
  editFooter: () => workspace.editFooter(),
  insertTableRow: () => workspace.insertTableRow(),
  deleteTableRow: () => workspace.deleteTableRow(),
  insertTableColumn: () => workspace.insertTableColumn(),
  deleteTableColumn: () => workspace.deleteTableColumn(),
  mergeTableCells: () => workspace.mergeTableCells(),
  splitTableCell: () => workspace.splitTableCell(),
  applyTableLayout: (action) => workspace.applyTableLayout(action),
  insertToc: () => workspace.insertToc(),
  insertPageNumber: () => workspace.insertPageNumber(),
  applyLink: (raw) => workspace.applyLink(raw),
  clearLink: () => workspace.clearLink(),
  beginComment: () => workspace.beginComment(),
  reviewState: () => workspace.reviewState(),
  reviewStats: () => {
    const document = workspace.bodyDocument();
    return document ? { ...documentStats(document), pages: workspace.pageCount } : undefined;
  },
  navigateComment: (direction) => workspace.navigateComment(direction),
  deleteComment: () => workspace.deleteComment(),
  toggleComments: () => workspace.toggleComments(),
  navigateRevision: (direction) => workspace.navigateRevision(direction),
  toggleTrackRevisions: () => workspace.toggleTrackRevisions(),
  addFootnote: (text) => workspace.addFootnote(text),
  showNote: (id) => workspace.showNote(id),
  acceptRevision: () => workspace.acceptRevision(),
  rejectRevision: () => workspace.rejectRevision(),
  toggleTitlePage: () => workspace.toggleTitlePage(),
  toggleEvenOdd: () => workspace.toggleEvenOdd(),
  setZoom: (zoom) => workspace.setZoom(zoom),
  print: () => workspace.print(),
  cut: () => {
    void workspace.cut();
  },
  copy: () => {
    void workspace.copy();
  },
  paste: () => {
    void workspace.paste();
  },
  startFormatPainter: (locked) => workspace.startFormatPainter(locked),
  cancelFormatPainter: () => {
    workspace.cancelFormatPainter();
  },
  findNext: (query) => workspace.findNext(query),
  findPrev: (query) => workspace.findPrev(query),
  replaceMatch: (query, replacement) => workspace.replaceMatch(query, replacement),
  replaceAllMatches: (query, replacement) => workspace.replaceAllMatches(query, replacement),
  closeFind: () => workspace.closeFind(),
  formatState: () => workspace.formatState(caption),
});
workspace.onUi((revealTableLayout) => ribbon.sync(revealTableLayout));
workspace.onFindRequest((replace) => ribbon.openFind(replace));
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
} else if (demoName === "span") {
  void openNamedDocx("/table-span-demo.docx", "table-span-demo.docx");
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
  workspace.resizeViewport();
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

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) {
    return;
  }
  try {
    await workspace.insertPictureFile(file);
  } finally {
    imageInput.value = "";
  }
});

replaceImageInput.addEventListener("change", async () => {
  const file = replaceImageInput.files?.[0];
  const target = replaceImageTarget;
  replaceImageTarget = undefined;
  replaceImageInput.value = "";
  if (file && !await workspace.replacePictureFile(file, target)) {
    ribbon.showPictureFeedback("无法更改图片，请确认原图片仍处于选中状态。");
  }
});

async function openNamedDocx(source: ArrayBuffer | string, name: string): Promise<void> {
  const data = typeof source === "string" ? await (await fetch(source, { cache: "no-store" })).arrayBuffer() : source;
  const document = await new DocxReader().read(data);
  document.fileName = name;
  workspace.load(document);
  caption = name;
  ribbon.sync();
}
