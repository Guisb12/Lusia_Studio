"use client";

import { useRef, useState, useCallback } from "react";
import type { ToolCallState } from "@/components/chat/tools/types";

export type ChatStreamFrame =
  | { type: "run_status"; status: "streaming" | "done"; run_id: string }
  | { type: "token"; delta: string; run_id: string }
  | { type: "tool_call"; name: string; args: any; run_id: string }
  | { type: "tool_call_args"; name: string; args: any; run_id: string }
  | { type: "tool_result"; name: string; content: string; run_id: string }
  | { type: "error"; message: string };

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export function useChatStream() {
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeToolCalls, setActiveToolCalls] = useState<Record<string, ToolCallState>>({});
  const controllerRef = useRef<AbortController | null>(null);
  // Counter to disambiguate multiple calls to the same tool
  const toolCounterRef = useRef<Record<string, number>>({});

  const sendMessage = useCallback(
    async (conversationId: string, message: string, images?: string[]) => {
      // Abort any existing stream
      controllerRef.current?.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;

      setStreamingText("");
      setStatus("streaming");
      setError(null);
      setActiveToolCalls({});
      toolCounterRef.current = {};

      try {
        const payload: { message: string; images?: string[] } = { message };
        if (images && images.length > 0) {
          payload.images = images.slice(0, 4);
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
                case "token":
                  setStreamingText((prev) => prev + frame.delta);
                  break;

                case "tool_call": {
                  // LLM started generating a tool call — create entry
                  const count = (toolCounterRef.current[frame.name] || 0) + 1;
                  toolCounterRef.current[frame.name] = count;
                  const key = count > 1 ? `${frame.name}-${count}` : frame.name;
                  setActiveToolCalls((prev) => ({
                    ...prev,
                    [key]: { started: true, name: frame.name },
                  }));
                  break;
                }

                case "tool_call_args": {
                  // Tool execution started — full args available
                  // Find the latest non-final entry for this tool name
                  setActiveToolCalls((prev) => {
                    const updated = { ...prev };
                    const matchKey = Object.keys(updated)
                      .reverse()
                      .find((k) => updated[k].name === frame.name && !updated[k].final);
                    if (matchKey) {
                      updated[matchKey] = { ...updated[matchKey], args: frame.args };
                    }
                    return updated;
                  });
                  break;
                }

                case "tool_result": {
                  // Tool finished — mark as final with result
                  setActiveToolCalls((prev) => {
                    const updated = { ...prev };
                    const matchKey = Object.keys(updated)
                      .reverse()
                      .find((k) => updated[k].name === frame.name && !updated[k].final);
                    if (matchKey) {
                      updated[matchKey] = {
                        ...updated[matchKey],
                        final: true,
                        result: frame.content,
                      };
                    }
                    return updated;
                  });
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

        // If we finished reading without getting a "done" event
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
    setActiveToolCalls({});
  }, []);

  const reset = useCallback(() => {
    setStreamingText("");
    setStatus("idle");
    setError(null);
    setActiveToolCalls({});
  }, []);

  return {
    sendMessage,
    cancel,
    reset,
    streamingText,
    status,
    error,
    activeToolCalls,
  };
}
