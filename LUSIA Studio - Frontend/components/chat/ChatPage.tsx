"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useChatStream } from "@/lib/hooks/use-chat-stream";
import { ChatContent, type Message } from "./ChatContent";
import { ChatInput } from "./ChatInput";
import { ChatSplash } from "./ChatSplash";
import { useUser } from "@/components/providers/UserProvider";
import { useChatSessions } from "@/components/providers/ChatSessionsProvider";

export function ChatPage() {
  const { user } = useUser();
  const {
    activeId: conversationId,
    setActiveId: setConversationId,
    createConversation,
    refreshConversations,
  } = useChatSessions();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

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

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: displayContent,
          created_at: new Date().toISOString(),
        },
      ]);

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

  // ── Load messages when conversation changes ──
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    loadMessages(conversationId);
  }, [conversationId]);

  const loadMessages = async (convId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`);
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.messages || [])
          .filter((m: any) => m.role === "user" || m.role === "assistant")
          .map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            metadata: m.metadata || null,
            tool_calls: m.tool_calls || null,
          }));
        setMessages(filtered);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // ── Streaming complete → add assistant message with tool calls ──
  useEffect(() => {
    if (status === "done" && (streamingText || Object.keys(activeToolCallsRef.current).length > 0)) {
      // Capture final tool call state to persist in the message
      const finalToolCalls = activeToolCallsRef.current;
      const toolCallsArray = Object.keys(finalToolCalls).length > 0
        ? Object.values(finalToolCalls).map((tc) => ({
            name: tc.name || "",
            args: tc.args,
            result: tc.result,
          }))
        : null;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: streamingText,
          created_at: new Date().toISOString(),
          tool_calls: toolCallsArray,
        },
      ]);
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
          <ChatContent
            messages={messages}
            streamingText={isStreaming ? streamingText : undefined}
            activeToolCalls={isStreaming ? activeToolCalls : undefined}
          />
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
