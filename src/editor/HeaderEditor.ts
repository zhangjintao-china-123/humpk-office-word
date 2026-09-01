import { StoryEditor, type StoryEditorOptions } from "./StoryEditor";

export class HeaderEditor extends StoryEditor {
  constructor(options: Omit<StoryEditorOptions, "slot">) {
    super({ ...options, slot: "header" });
  }
}
