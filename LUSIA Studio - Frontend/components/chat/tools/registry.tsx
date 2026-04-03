import type { ToolRenderer, ToolRendererProps } from "./types";
import { CurriculumIndexTool } from "./CurriculumIndexTool";
import { CurriculumContentTool } from "./CurriculumContentTool";
import { AskQuestionsTool } from "./AskQuestionsTool";
import { VisualTool } from "./VisualTool";
import { DefaultTool } from "./DefaultTool";

const registry: Record<string, ToolRenderer> = {
  get_curriculum_index: CurriculumIndexTool,
  get_curriculum_content: CurriculumContentTool,
  generate_visual: VisualTool,
  ask_questions: AskQuestionsTool,
};

export function getToolRenderer(name: string): ToolRenderer {
  return registry[name] || DefaultTool;
}
