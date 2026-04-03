"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const initialUserAnchorSkippedRef = useRef(false);
  const previousLatestUserIdRef = useRef<string | null>(null);
  const [anchorSpacerHeight, setAnchorSpacerHeight] = useState(0);
  const isAgentQuestionStreaming =
    !!streamBlocks?.some(
      (block) =>
        block.type === "tool_call" &&
        block.tool_name === "ask_questions" &&
        (block.state === "running" || block.state === "pending_answer"),
    );
  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (msg) => !(msg.role === "user" && msg.metadata?.is_question_answer === true),
      ),
    [messages],
  );
  const latestVisibleUserId = useMemo(() => {
    for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
      if (visibleMessages[index]?.role === "user") {
        return visibleMessages[index].id;
      }
    }
    return null;
  }, [visibleMessages]);
  const isLiveStreaming =
    (!!streamBlocks && streamBlocks.length > 0) ||
    streamingText !== undefined ||
    (!!activeToolCalls && Object.keys(activeToolCalls).length > 0);

  useEffect(() => {
    if (messages.length === 0) {
      setAnchorSpacerHeight(0);
      previousLatestUserIdRef.current = null;
      initialUserAnchorSkippedRef.current = false;
    }
  }, [messages.length]);

  useEffect(() => {
    if (!latestVisibleUserId) return;

    if (!initialUserAnchorSkippedRef.current) {
      initialUserAnchorSkippedRef.current = true;
      previousLatestUserIdRef.current = latestVisibleUserId;
      return;
    }

    if (previousLatestUserIdRef.current === latestVisibleUserId) {
      return;
    }
    previousLatestUserIdRef.current = latestVisibleUserId;

    const container = containerRef.current;
    const target = messageRefs.current[latestVisibleUserId];
    if (!container || !target) return;

    requestAnimationFrame(() => {
      const topOffset = 20;
      const desiredScrollTop = Math.max(0, target.offsetTop - topOffset);
      const naturalScrollHeight = container.scrollHeight - anchorSpacerHeight;
      const requiredScrollHeight = desiredScrollTop + container.clientHeight;
      const neededSpacer = Math.max(0, requiredScrollHeight - naturalScrollHeight);

      if (neededSpacer > 0) {
        setAnchorSpacerHeight(neededSpacer);
        requestAnimationFrame(() => {
          container.scrollTo({
            top: desiredScrollTop,
            behavior: "smooth",
          });
        });
        return;
      }

      setAnchorSpacerHeight(0);
      container.scrollTo({
        top: desiredScrollTop,
        behavior: "smooth",
      });
    });
  }, [latestVisibleUserId, anchorSpacerHeight]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative chat-scrollbar">
      {/* Top fade */}
      <div className="sticky top-0 h-5 bg-gradient-to-b from-[#f6f3ef] to-transparent pointer-events-none z-10" />

      <div className="px-2 sm:px-4 py-2 pb-8">
        <div className="max-w-3xl mx-auto space-y-1">
          {visibleMessages.map((msg) => {
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
              <div
                key={msg.id}
                ref={(node) => {
                  messageRefs.current[msg.id] = node;
                }}
              >
                <ChatMessage
                  role={msg.role}
                  content={msg.content}
                  contentBlocks={msg.content_blocks || undefined}
                  metadata={msg.metadata}
                  toolCalls={historicalToolCalls}
                  onPendingActionSubmit={isAssistant ? onPendingActionSubmit : undefined}
                  activePendingActionId={isAssistant ? activePendingActionId : undefined}
                />
              </div>
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

          {anchorSpacerHeight > 0 ? (
            <div style={{ height: anchorSpacerHeight }} />
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom fade */}
      <div className="sticky bottom-0 h-16 bg-gradient-to-t from-[#f6f3ef] to-transparent pointer-events-none z-10" />
    </div>
  );
}
