"use client";

import { useRef, useState, useCallback } from "react";
import type { AssistantContentBlock, ToolCallState } from "@/components/chat/tools/types";
import type { ChatModelMode } from "@/lib/chat-models";
import type { WizardQuestion } from "@/lib/wizard-types";

export type PendingAction =
  | {
      type: "clarification_request";
      action_id: string;
      question: string;
      reason?: string | null;
      resume_run_id: string;
      model_mode?: ChatModelMode;
    }
  | {
      type: "ask_questions";
      action_id: string;
      questions: WizardQuestion[];
      resume_run_id: string;
      model_mode?: ChatModelMode;
    };

export type ChatStreamFrame =
  | { type: "run.started"; run_id: string; conversation_id: string; status: "streaming"; model_mode?: ChatModelMode; model_name?: string | null; resume_run_id?: string | null }
  | { type: "assistant.block.started"; run_id: string; block_id: number; format: "markdown" }
  | { type: "assistant.block.delta"; run_id: string; block_id: number; delta: string }
  | { type: "assistant.block.completed"; run_id: string; block_id: number }
  | { type: "reasoning"; run_id: string; block_id: number; delta: string }
  | { type: "tool.call.started"; run_id: string; block_id: number; tool_call_id: string; tool_name: string; args: any }
  | { type: "tool.call.completed"; run_id: string; block_id: number; tool_call_id: string; tool_name: string; args: any; content?: string; metadata?: Record<string, any> | null }
  | { type: "tool.result"; run_id: string; block_id: number; tool_call_id: string; tool_name: string; args: any; content: string; metadata?: Record<string, any> | null }
  | { type: "run.requires_action"; run_id: string; conversation_id: string; action: PendingAction }
  | { type: "run.completed"; run_id: string; conversation_id: string; assistant_message_id?: string | null; model_mode?: ChatModelMode; model_name?: string | null; status: "completed" }
  | { type: "run.failed"; run_id: string; conversation_id: string; model_mode?: ChatModelMode; model_name?: string | null; message: string }
  | { type: "error"; message: string; run_id?: string };

export type StreamStatus = "idle" | "streaming" | "requires_action" | "done" | "error";

export function useChatStream() {
  const [streamBlocks, setStreamBlocks] = useState<AssistantContentBlock[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const recordQuestionAnswers = useCallback(
    (toolCallId: string, answeredQa: { question: string; answer: string }[]) => {
      setStreamBlocks((prev) =>
        prev.map((block) =>
          block.type === "tool_call" && block.id === toolCallId
            ? {
                ...block,
                state: "completed",
                metadata: {
                  ...(block.metadata || {}),
                  answered_qa: answeredQa,
                  requires_answer: false,
                },
              }
            : block,
        ),
      );
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      conversationId: string,
      message: string,
      images?: string[],
      options?: {
        resumeRunId?: string | null;
        idempotencyKey?: string | null;
        modelMode?: ChatModelMode;
        isQuestionAnswer?: boolean;
      },
    ) => {
      // Abort any existing stream
      controllerRef.current?.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;

      setStreamBlocks([]);
      setStatus("streaming");
      setError(null);
      setPendingAction(null);
      setRunId(null);

      try {
        const payload: {
          message: string;
          images?: string[];
          model_mode?: ChatModelMode;
          resume_run_id?: string;
          idempotency_key?: string;
        } = { message };
        if (images && images.length > 0) {
          payload.images = images.slice(0, 4);
        }
        if (options?.resumeRunId) {
          payload.resume_run_id = options.resumeRunId;
        }
        if (options?.modelMode) {
          payload.model_mode = options.modelMode;
        }
        if (options?.idempotencyKey) {
          payload.idempotency_key = options.idempotencyKey;
        }
        if (options?.isQuestionAnswer) {
          (payload as any).is_question_answer = true;
        }

        const res = await fetch(
          `/api/chat/conversations/${conversationId}/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          },
        );

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "Unknown error");
          throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data || data === "ping") continue;

            try {
              const frame: ChatStreamFrame = JSON.parse(data);
              switch (frame.type) {
                case "run.started":
                  setRunId(frame.run_id);
                  setStatus("streaming");
                  break;

                case "assistant.block.started": {
                  setStreamBlocks((prev) => {
                    if (prev.some((block) => block.type === "assistant_text" && block.block_id === frame.block_id)) {
                      return prev;
                    }
                    return [
                      ...prev,
                      {
                        id: `text-${frame.block_id}`,
                        type: "assistant_text",
                        block_id: frame.block_id,
                        text: "",
                      },
                    ];
                  });
                  break;
                }

                case "assistant.block.delta":
                  setStreamBlocks((prev) => {
                    const next = [...prev];
                    const idx = next.findIndex(
                      (block) => block.type === "assistant_text" && block.block_id === frame.block_id,
                    );
                    if (idx >= 0) {
                      const current = next[idx];
                      if (current.type === "assistant_text") {
                        next[idx] = { ...current, text: `${current.text}${frame.delta}` };
                      }
                    } else {
                      next.push({
                        id: `text-${frame.block_id}`,
                        type: "assistant_text",
                        block_id: frame.block_id,
                        text: frame.delta,
                      });
                    }
                    return next;
                  });
                  break;

                case "reasoning":
                  setStreamBlocks((prev) => {
                    const next = [...prev];
                    const idx = next.findIndex(
                      (block) => block.type === "reasoning_text" && block.block_id === frame.block_id,
                    );
                    if (idx >= 0) {
                      const current = next[idx];
                      if (current.type === "reasoning_text") {
                        next[idx] = { ...current, text: `${current.text}${frame.delta}` };
                      }
                    } else {
                      next.push({
                        id: `reasoning-${frame.block_id}`,
                        type: "reasoning_text",
                        block_id: frame.block_id,
                        text: frame.delta,
                      });
                    }
                    return next;
                  });
                  break;

                case "tool.call.started":
                  setStreamBlocks((prev) => [
                    ...prev,
                    {
                      id: frame.tool_call_id,
                      type: "tool_call",
                      block_id: frame.block_id,
                      tool_name: frame.tool_name,
                      args: frame.args,
                      metadata: null,
                      state: "running",
                    },
                  ]);
                  break;

                case "tool.call.completed":
                  setStreamBlocks((prev) =>
                    prev.map((block) =>
                      block.type === "tool_call" && block.id === frame.tool_call_id
                        ? {
                            ...block,
                            args: frame.args,
                            result: frame.content ?? block.result,
                            metadata: frame.metadata ?? block.metadata ?? null,
                            state: "completed",
                          }
                        : block,
                    ),
                  );
                  break;

                case "tool.result":
                  setStreamBlocks((prev) =>
                    prev.map((block) =>
                      block.type === "tool_call" && block.id === frame.tool_call_id
                        ? {
                            ...block,
                            args: frame.args,
                            result: frame.content,
                            metadata: frame.metadata ?? block.metadata ?? null,
                            state: "completed",
                          }
                        : block,
                    ),
                  );
                  break;

                case "run.requires_action": {
                  const action = frame.action;
                  setPendingAction(action);
                  setStatus("requires_action");
                  setStreamBlocks((prev) => {
                    if (action.type === "ask_questions") {
                      // Move to pending_answer state so the tool card shows the interactive dock
                      const aqAction = action;
                      return prev.map((block) =>
                        block.type === "tool_call" && block.id === aqAction.action_id
                          ? {
                              ...block,
                              state: "pending_answer" as const,
                              metadata: {
                                ...(block.metadata || {}),
                                requires_answer: true,
                                questions: aqAction.questions,
                              },
                            }
                          : block,
                      );
                    }
                    if (prev.some((block) => block.type === "clarification_request")) {
                      return prev;
                    }
                    const crAction = action;
                    return [
                      ...prev,
                      {
                        id: crAction.action_id,
                        type: "clarification_request",
                        question: crAction.question,
                        reason: crAction.reason,
                      },
                    ];
                  });
                  break;
                }

                case "run.completed":
                  setStatus("done");
                  break;

                case "run.failed":
                  setStatus("error");
                  setError(frame.message);
                  break;

                case "error":
                  setStatus("error");
                  setError(frame.message);
                  break;
              }
            } catch {
              // Skip unparseable frames
            }
          }
        }

        setStatus((prev) => (prev === "streaming" ? "done" : prev));
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setStatus("error");
          setError(e.message || "Stream failed");
        }
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus("idle");
    setStreamBlocks([]);
    setPendingAction(null);
  }, []);

  const reset = useCallback(() => {
    setStreamBlocks([]);
    setStatus("idle");
    setError(null);
    setPendingAction(null);
    setRunId(null);
  }, []);

  const activeToolCalls: Record<string, ToolCallState> = Object.fromEntries(
    streamBlocks
      .filter((block): block is Extract<AssistantContentBlock, { type: "tool_call" }> => block.type === "tool_call")
      .map((block) => [
        block.id,
        {
          id: block.id,
          blockId: block.block_id,
          started: true,
          name: block.tool_name,
          args: block.args,
          result: block.result,
          state: block.state,
          metadata: block.metadata ?? null,
          final: block.state === "completed",
        } satisfies ToolCallState,
      ]),
  );

  const streamingText = streamBlocks
    .filter((block): block is Extract<AssistantContentBlock, { type: "assistant_text" }> => block.type === "assistant_text")
    .map((block) => block.text)
    .join("");

  return {
    sendMessage,
    cancel,
    reset,
    runId,
    pendingAction,
    streamBlocks,
    streamingText,
    status,
    error,
    activeToolCalls,
    recordQuestionAnswers,
  };
}
