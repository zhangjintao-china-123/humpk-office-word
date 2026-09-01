import { StoryEditor, type StoryEditorOptions } from "./StoryEditor";

export class FooterEditor extends StoryEditor {
  constructor(options: Omit<StoryEditorOptions, "slot">) {
    super({ ...options, slot: "footer" });
  }
}
