import { StoryEditor, type StoryEditorOptions } from "./StoryEditor";

export class BodyEditor extends StoryEditor {
  constructor(options: Omit<StoryEditorOptions, "slot">) {
    super({ ...options, slot: "body" });
  }
}
