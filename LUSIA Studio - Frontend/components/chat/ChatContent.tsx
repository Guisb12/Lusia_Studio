"use client";

import React, { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import type { AssistantContentBlock, ToolCallState } from "./tools/types";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  run_id?: string | null;
  sequence?: number | null;
  created_at: string;
  metadata?: Record<string, any> | null;
  tool_calls?: Array<{ name: string; args: any; result?: string }> | null;
  content_blocks?: AssistantContentBlock[] | null;
}

interface ChatContentProps {
  messages: Message[];
  streamBlocks?: AssistantContentBlock[];
  streamingText?: string;
  activeToolCalls?: Record<string, ToolCallState>;
  onPendingActionSubmit?: (answers: string) => void;
  activePendingActionId?: string | null;
}

export function ChatContent({
  messages,
  streamBlocks,
  streamingText,
  activeToolCalls,
  onPendingActionSubmit,
  activePendingActionId,
}: ChatContentProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages / streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText, activeToolCalls, streamBlocks]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative chat-scrollbar">
      {/* Top fade */}
      <div className="sticky top-0 h-5 bg-gradient-to-b from-[#f6f3ef] to-transparent pointer-events-none z-10" />

      <div className="px-2 sm:px-4 py-2 pb-8">
        <div className="max-w-3xl mx-auto space-y-1">
          {messages.map((msg) => {
            // Hide question-answer user messages — shown inline in the tool card instead
            if (msg.role === "user" && msg.metadata?.is_question_answer === true) {
              return null;
            }

            // Build tool_calls record for historical assistant messages
            const historicalToolCalls: Record<string, ToolCallState> | undefined =
              msg.role === "assistant" && !msg.content_blocks?.length && msg.tool_calls?.length
                ? Object.fromEntries(
                    msg.tool_calls.map((tc, i) => [
                      `${tc.name}-${i}`,
                      { started: true, name: tc.name, final: true, args: tc.args, result: tc.result } as ToolCallState,
                    ])
                  )
                : undefined;

            // Thread pending-action callbacks into any historical assistant message
            // (AssistantMessage only passes them to the ask_questions block where isActive matches)
            const isAssistant = msg.role === "assistant";

            return (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                contentBlocks={msg.content_blocks || undefined}
                metadata={msg.metadata}
                toolCalls={historicalToolCalls}
                onPendingActionSubmit={isAssistant ? onPendingActionSubmit : undefined}
                activePendingActionId={isAssistant ? activePendingActionId : undefined}
              />
            );
          })}

          {/* Streaming assistant message — show when there's text OR active tool calls */}
          {((streamBlocks && streamBlocks.length > 0) || streamingText !== undefined || (activeToolCalls && Object.keys(activeToolCalls).length > 0)) && (
            <ChatMessage
              role="assistant"
              content={streamingText ?? ""}
              contentBlocks={streamBlocks}
              isStreaming
              toolCalls={activeToolCalls}
              onPendingActionSubmit={onPendingActionSubmit}
              activePendingActionId={activePendingActionId}
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
