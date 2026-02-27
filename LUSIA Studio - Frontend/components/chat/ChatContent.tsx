"use client";

import React, { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import type { ToolCallState } from "./tools/types";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: Record<string, any> | null;
  tool_calls?: Array<{ name: string; args: any; result?: string }> | null;
}

interface ChatContentProps {
  messages: Message[];
  streamingText?: string;
  activeToolCalls?: Record<string, ToolCallState>;
}

export function ChatContent({
  messages,
  streamingText,
  activeToolCalls,
}: ChatContentProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages / streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText, activeToolCalls]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative chat-scrollbar">
      {/* Top fade */}
      <div className="sticky top-0 h-5 bg-gradient-to-b from-[#f6f3ef] to-transparent pointer-events-none z-10" />

      <div className="px-4 py-2 pb-8">
        <div className="max-w-3xl mx-auto space-y-1">
          {messages.map((msg) => {
            // Build tool_calls record for historical assistant messages
            const historicalToolCalls: Record<string, ToolCallState> | undefined =
              msg.role === "assistant" && msg.tool_calls?.length
                ? Object.fromEntries(
                    msg.tool_calls.map((tc, i) => [
                      `${tc.name}-${i}`,
                      { started: true, name: tc.name, final: true, args: tc.args, result: tc.result } as ToolCallState,
                    ])
                  )
                : undefined;

            return (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                metadata={msg.metadata}
                toolCalls={historicalToolCalls}
              />
            );
          })}

          {/* Streaming assistant message — show when there's text OR active tool calls */}
          {(streamingText !== undefined || (activeToolCalls && Object.keys(activeToolCalls).length > 0)) && (
            <ChatMessage
              role="assistant"
              content={streamingText ?? ""}
              isStreaming
              toolCalls={activeToolCalls}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom fade */}
      <div className="sticky bottom-0 h-16 bg-gradient-to-t from-[#f6f3ef] to-transparent pointer-events-none z-10" />
    </div>
  );
}
