export const EditorEvents = {
  loaded: "ho-word:loaded",
  layout: "ho-word:layout",
  render: "ho-word:render",
  disposed: "ho-word:disposed",
  selectionChange: "ho-word:selectionchange",
  documentChange: "ho-word:documentchange",
} as const;

export type EditorEventName = (typeof EditorEvents)[keyof typeof EditorEvents];
