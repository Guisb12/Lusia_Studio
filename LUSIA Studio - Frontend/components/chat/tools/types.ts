import type { WizardQuestion } from "@/lib/wizard-types";

export type ToolCallState = {
  id?: string;
  blockId?: number;
  started?: boolean;
  name?: string;
  args?: any;
  result?: string;
  state?: "running" | "pending_answer" | "completed" | "failed";
  metadata?: Record<string, any> | null;
  final?: boolean;
  finalArgs?: string;
};

export type AssistantContentBlock =
  | {
      id: string;
      type: "assistant_text";
      block_id?: number;
      text: string;
    }
  | {
      id: string;
      type: "reasoning_text";
      block_id?: number;
      text: string;
    }
  | {
      id: string;
      type: "tool_call";
      block_id?: number;
      tool_name: string;
      args?: any;
      result?: string;
      state?: "running" | "pending_answer" | "completed" | "failed";
      metadata?: Record<string, any> | null;
    }
  | {
      id: string;
      type: "clarification_request";
      question: string;
      reason?: string | null;
    }
  | {
      id: string;
      type: "ask_questions";
      questions: WizardQuestion[];
    };

export type ToolRendererProps = {
  call: ToolCallState;
  onAnswer?: (answers: string) => void;
  isActive?: boolean;
};

export type ToolRenderer = React.ComponentType<ToolRendererProps>;
