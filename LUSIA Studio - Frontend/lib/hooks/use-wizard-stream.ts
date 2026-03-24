"use client";

import { useRef, useState, useCallback } from "react";
import type { ChatStreamFrame } from "@/lib/hooks/use-chat-stream";
import type {
  WizardQuestion,
  WizardConfirm,
  WizardStreamParams,
  InstructionsStreamParams,
} from "@/lib/wizard-types";

export type WizardStreamStatus = "idle" | "streaming" | "done" | "error";

export function useWizardStream() {
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<WizardStreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestions, setPendingQuestions] = useState<WizardQuestion[] | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<WizardConfirm | null>(null);
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
              const frame: ChatStreamFrame = JSON.parse(data);
              switch (frame.type) {
                case "token":
                  setStreamingText((prev) => prev + frame.delta);
                  break;

                case "tool_call_args": {
                  const args = frame.args || {};
                  console.log("[wizard] tool_call_args:", frame.name, args);
                  if (frame.name === "ask_questions") {
                    const questions = args.questions || args;
                    if (Array.isArray(questions)) {
                      setPendingQuestions(questions as WizardQuestion[]);
                    }
                  } else if (frame.name === "confirm_and_proceed") {
                    setPendingConfirm({
                      summary: args.summary || "",
                      curriculum_codes: args.curriculum_codes,
                    });
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
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setStreamingText("");
    setStatus("idle");
    setError(null);
    setPendingQuestions(null);
    setPendingConfirm(null);
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
  };
}
