/**
 * Types for the Wizard agent (content-finding + instructions-builder phases).
 */

export interface WizardQuestion {
  question: string;
  options: string[];
  type?: "single_select" | "multi_select";
}

export interface WizardConfirm {
  summary?: string;
  curriculum_codes?: string[];
}

export interface WizardToolCall {
  id: string;
  name: string;
  args: object;
}

export interface WizardMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: WizardToolCall[];
}

export interface WizardStreamParams {
  messages: WizardMessage[];
  phase: "content_finding" | "instructions_builder";
  document_type: "quiz" | "worksheet" | "presentation" | "note" | "diagram";
  subject_id?: string | null;
  year_level?: string | null;
  subject_component?: string | null;
  selected_codes?: string[];
  content_summary?: string;
  upload_artifact_id?: string | null;
  // Hardcoded settings (Phase 2)
  num_questions?: number;
  difficulty?: string;
  template_id?: string;
  pres_size?: string;
  pres_template?: string;
}

export interface InstructionsStreamParams {
  conversation_history: WizardMessage[];
  document_type: "quiz" | "worksheet" | "presentation" | "note" | "diagram";
  subject_id?: string | null;
  year_level?: string | null;
  subject_component?: string | null;
  curriculum_codes?: string[];
  upload_artifact_id?: string | null;
  num_questions?: number | null;
  difficulty?: string | null;
  template_id?: string | null;
  pres_size?: string | null;
  pres_template?: string | null;
}
