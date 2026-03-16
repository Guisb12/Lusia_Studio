"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { useChatStream } from "@/lib/hooks/use-chat-stream";
import { ChatContent, type Message } from "./ChatContent";
import { ChatInput } from "./ChatInput";
import { ChatSplash } from "./ChatSplash";
import { useUser } from "@/components/providers/UserProvider";
import { useChatSessions } from "@/components/providers/ChatSessionsProvider";
import {
  appendChatMessage,
  useChatMessagesQuery,
} from "@/lib/queries/chat";

/* ── Message loading skeleton ─────────────────────────────────── */

function ChatMessageSkeleton() {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="sticky top-0 h-5 bg-gradient-to-b from-[#f6f3ef] to-transparent pointer-events-none z-10" />
      <div className="px-4 py-2 pb-8">
        <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
          {/* User message */}
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-tr-md bg-brand-primary/[0.06] px-4 py-2.5 max-w-[70%] space-y-1.5">
              <div className="h-3.5 w-48 bg-brand-primary/10 rounded" />
              <div className="h-3.5 w-32 bg-brand-primary/10 rounded" />
            </div>
          </div>
          {/* Assistant message */}
          <div className="flex gap-2.5 items-start">
            <div className="h-8 w-8 rounded-full bg-brand-primary/[0.06] shrink-0" />
            <div className="space-y-1.5 flex-1 max-w-[80%]">
              <div className="h-3.5 w-64 bg-brand-primary/[0.06] rounded" />
              <div className="h-3.5 w-56 bg-brand-primary/[0.06] rounded" />
              <div className="h-3.5 w-40 bg-brand-primary/[0.06] rounded" />
            </div>
          </div>
          {/* User message */}
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-tr-md bg-brand-primary/[0.06] px-4 py-2.5 max-w-[70%]">
              <div className="h-3.5 w-36 bg-brand-primary/10 rounded" />
            </div>
          </div>
          {/* Assistant message */}
          <div className="flex gap-2.5 items-start">
            <div className="h-8 w-8 rounded-full bg-brand-primary/[0.06] shrink-0" />
            <div className="space-y-1.5 flex-1 max-w-[80%]">
              <div className="h-3.5 w-72 bg-brand-primary/[0.06] rounded" />
              <div className="h-3.5 w-48 bg-brand-primary/[0.06] rounded" />
            </div>
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 h-16 bg-gradient-to-t from-[#f6f3ef] to-transparent pointer-events-none z-10" />
    </div>
  );
}

/* ── ChatPage ─────────────────────────────────────────────────── */

const EMPTY_MESSAGES: Message[] = [];

export function ChatPage() {
  const { user } = useUser();
  const {
    activeId: conversationId,
    setActiveId: setConversationId,
    createConversation,
    refreshConversations,
  } = useChatSessions();

  const messagesQuery = useChatMessagesQuery(conversationId);
  const messages = messagesQuery.data ?? EMPTY_MESSAGES;
  const loadingMessages = messagesQuery.isLoading;

  const { sendMessage, streamingText, status, error, reset, cancel, activeToolCalls } =
    useChatStream();

  // Keep a ref to activeToolCalls so the "done" effect captures the final state
  const activeToolCallsRef = useRef(activeToolCalls);
  activeToolCallsRef.current = activeToolCalls;

  // ── Send handler ──
  const handleSend = useCallback(
    async (text: string, images?: string[]) => {
      let cid = conversationId;

      if (!cid) {
        cid = await createConversation();
        if (!cid) return;
      }

      // Build display content with image tags for rendering
      let displayContent = text;
      if (images && images.length > 0) {
        const imageXml = images.map((u) => `<image src="${u}" />`).join("\n");
        displayContent = `${text}\n<frontend_images>\n${imageXml}\n</frontend_images>`;
      }

      appendChatMessage(cid, {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: displayContent,
        created_at: new Date().toISOString(),
      });

      reset();
      await sendMessage(cid, text, images);
    },
    [conversationId, sendMessage, reset, createConversation],
  );

  // Ref to latest handleSend so the pending-message effect can use it
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  // ── Pick up pending message from home page ──
  const pendingMessageSent = useRef(false);
  useEffect(() => {
    if (pendingMessageSent.current) return;
    const pending = sessionStorage.getItem("lusia:pending-chat-message");
    if (pending && conversationId) {
      pendingMessageSent.current = true;
      sessionStorage.removeItem("lusia:pending-chat-message");
      handleSendRef.current(pending);
    }
  }, [conversationId]);

  // ── Streaming complete → add assistant message with tool calls ──
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  useEffect(() => {
    if (status === "done" && (streamingText || Object.keys(activeToolCallsRef.current).length > 0)) {
      const cid = conversationIdRef.current;
      if (!cid) return;

      // Capture final tool call state to persist in the message
      const finalToolCalls = activeToolCallsRef.current;
      const toolCallsArray = Object.keys(finalToolCalls).length > 0
        ? Object.values(finalToolCalls).map((tc) => ({
            name: tc.name || "",
            args: tc.args,
            result: tc.result,
          }))
        : null;

      appendChatMessage(cid, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: streamingText,
        created_at: new Date().toISOString(),
        tool_calls: toolCallsArray,
      });
      reset();
      refreshConversations();
    }
  }, [status, streamingText, reset, refreshConversations]);

  const isStreaming = status === "streaming";
  const hasMessages = messages.length > 0 || isStreaming;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 shrink-0">
          {error}
        </div>
      )}

      {/* Content: Splash or Conversation */}
      {!conversationId && !hasMessages ? (
        <ChatSplash
          userName={user?.display_name || user?.full_name}
          onSend={handleSend}
          disabled={loadingMessages}
          isStreaming={isStreaming}
          onCancel={cancel}
        />
      ) : (
        <>
          {loadingMessages && messages.length === 0 ? (
            <ChatMessageSkeleton />
          ) : (
            <ChatContent
              messages={messages}
              streamingText={isStreaming ? streamingText : undefined}
              activeToolCalls={isStreaming ? activeToolCalls : undefined}
            />
          )}
          <ChatInput
            onSend={handleSend}
            onCancel={cancel}
            disabled={loadingMessages}
            isStreaming={isStreaming}
          />
        </>
      )}
    </div>
  );
}
