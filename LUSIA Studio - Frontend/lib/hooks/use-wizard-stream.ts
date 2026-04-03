"use client";

import { useRef, useState, useCallback } from "react";
import type {
  WizardQuestion,
  WizardConfirm,
  WizardStreamParams,
  WizardToolCall,
  InstructionsStreamParams,
} from "@/lib/wizard-types";

export type WizardStreamStatus = "idle" | "streaming" | "done" | "error";

type WizardStreamFrame =
  | { type: "token"; delta: string }
  | { type: "text_replace"; text: string }
  | { type: "tool_call_args"; name: string; args?: any; synthetic?: boolean; tool_call_id?: string }
  | { type: "run_status"; status: "streaming" | "done" | "error" }
  | { type: "error"; message: string };

export function useWizardStream() {
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<WizardStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<WizardQuestion[] | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<WizardConfirm | null>(null);
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const [pendingToolCalls, setPendingToolCalls] = useState<WizardToolCall[]>([]);
  const [wasSyntheticToolCall, setWasSyntheticToolCall] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const _streamFromUrl = useCallback(
    async (url: string, body: object) => {
      controllerRef.current?.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;

      setStreamingText("");
      setStatus("streaming");
      setError(null);
      setPendingQuestions(null);
      setPendingConfirm(null);
      setPendingCancel(null);
      setPendingToolCalls([]);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });

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
              const frame: WizardStreamFrame = JSON.parse(data);
              switch (frame.type) {
                case "token":
                  setStreamingText((prev) => prev + frame.delta);
                  break;

                case "text_replace":
                  // Replace the accumulated text with a clean version
                  // (used when we strip [Perguntei:] blocks)
                  setStreamingText(frame.text);
                  break;

                case "tool_call_args": {
                  const args = frame.args || {};
                  const isSynthetic = !!(frame as any).synthetic;
                  const toolCallId = frame.tool_call_id || `call_${Date.now()}`;
                  console.log("[wizard] tool_call_args:", frame.name, args, isSynthetic ? "(synthetic)" : "");

                  // Store as proper tool call for message history
                  setPendingToolCalls((prev) => [
                    ...prev,
                    { id: toolCallId, name: frame.name, args },
                  ]);

                  if (frame.name === "ask_questions") {
                    const questions = args.questions || args;
                    if (Array.isArray(questions)) {
                      setPendingQuestions(questions as WizardQuestion[]);
                      if (isSynthetic) setWasSyntheticToolCall(true);
                    }
                  } else if (frame.name === "confirm_and_proceed") {
                    setPendingConfirm({
                      summary: args.summary || "",
                      curriculum_codes: args.curriculum_codes,
                    });
                  } else if (frame.name === "cancel_conversation") {
                    setPendingCancel(args.reason || "A conversa foi cancelada.");
                  }
                  break;
                }

                case "run_status":
                  if (frame.status === "done") {
                    setStatus("done");
                  }
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

  const sendMessage = useCallback(
    async (params: WizardStreamParams) => {
      await _streamFromUrl("/api/wizard/stream", params);
    },
    [_streamFromUrl],
  );

  const streamInstructions = useCallback(
    async (params: InstructionsStreamParams) => {
      await _streamFromUrl("/api/wizard/instructions/stream", params);
    },
    [_streamFromUrl],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setStatus("idle");
  }, []);

  const clearPending = useCallback(() => {
    setPendingQuestions(null);
    setPendingConfirm(null);
    setPendingCancel(null);
    setPendingToolCalls([]);
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setStreamingText("");
    setStatus("idle");
    setError(null);
    setPendingQuestions(null);
    setPendingConfirm(null);
    setPendingCancel(null);
    setPendingToolCalls([]);
  }, []);

  return {
    sendMessage,
    streamInstructions,
    cancel,
    reset,
    clearPending,
    streamingText,
    status,
    error,
    pendingQuestions,
    pendingConfirm,
    pendingCancel,
    pendingToolCalls,
    wasSyntheticToolCall,
    clearSyntheticFlag: () => setWasSyntheticToolCall(false),
  };
}
