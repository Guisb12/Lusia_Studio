export type ChatModelMode = "fast" | "thinking";

export const CHAT_MODEL_OPTIONS: Array<{
  id: ChatModelMode;
  label: string;
  description: string;
}> = [
  {
    id: "fast",
    label: "Fast",
    description: "Gemini para respostas mais rapidas.",
  },
  {
    id: "thinking",
    label: "Thinking",
    description: "Kimi K2.5 para raciocinio mais profundo.",
  },
];
