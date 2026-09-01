import { StoryEditor, type StoryEditorOptions } from "./StoryEditor";

/** 单元格编辑器先立类，本步不由 Workspace 挂载。 */
export class CellEditor extends StoryEditor {
  constructor(options: Omit<StoryEditorOptions, "slot">) {
    super({ ...options, slot: "body" });
  }
}
