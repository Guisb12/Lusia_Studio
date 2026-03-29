"use client";

import React, { useEffect, useCallback, useRef, useMemo } from "react";
import { useChatStream, type PendingAction } from "@/lib/hooks/use-chat-stream";
import { ChatContent, type Message } from "./ChatContent";
import { ChatInput } from "./ChatInput";
import { ChatSplash } from "./ChatSplash";
import { useUser } from "@/components/providers/UserProvider";
import { useChatSessions } from "@/components/providers/ChatSessionsProvider";
import {
  appendChatMessage,
  invalidateChatMessagesQuery,
  setChatMessagesData,
  useChatMessagesQuery,
} from "@/lib/queries/chat";
import type { ChatModelMode } from "@/lib/chat-models";
import type { WizardQuestion } from "@/lib/wizard-types";

/* ── Message loading skeleton ─────────────────────────────────── */

function ChatMessageSkeleton() {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="sticky top-0 h-5 bg-gradient-to-b from-[#f6f3ef] to-transparent pointer-events-none z-10" />
      <div className="px-2 sm:px-4 py-2 pb-8">
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
    conversations,
    createConversation,
    refreshConversations,
  } = useChatSessions();

  const messagesQuery = useChatMessagesQuery(conversationId);
  const messages = messagesQuery.data ?? EMPTY_MESSAGES;
  const loadingMessages = messagesQuery.isLoading;

  // Derive subject from last user message for pre-selection
  const lastSubject = useMemo(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return null;
    const match = lastUser.content.match(/^<subject_context\s+name="([^"]*?)"\s+color="([^"]*?)"\s+icon="([^"]*?)">/);
    if (!match) return null;
    return { id: "", name: match[1], color: match[2] || null, icon: match[3] || null, slug: null, education_level: "", grade_levels: null, is_custom: false };
  }, [messages]);

  const latestPersistedPendingAction = useMemo(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage?.role !== "assistant" || !lastMessage.metadata?.pending_action) {
      return null;
    }
    return (lastMessage.metadata.pending_action as PendingAction | undefined) ?? null;
  }, [messages]);

  const { sendMessage, streamBlocks, streamingText, status, error, reset, cancel, activeToolCalls, pendingAction, runId, recordQuestionAnswers } =
    useChatStream();
  const effectivePendingAction = pendingAction ?? latestPersistedPendingAction;

  // Keep a ref to activeToolCalls so the "done" effect captures the final state
  const activeToolCallsRef = useRef(activeToolCalls);
  activeToolCallsRef.current = activeToolCalls;

  // ── Send handler ──
  const handleSend = useCallback(
    async (text: string, images?: string[], modelMode: ChatModelMode = "fast") => {
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
        metadata: { images: images ?? [], model_mode: modelMode },
      });

      const lastAssistant = [...messages].reverse().find((entry) => entry.role === "assistant");
      const resumeRunId =
        effectivePendingAction?.resume_run_id ||
        (lastAssistant?.metadata?.pending_action?.resume_run_id as string | undefined) ||
        null;
      const resumeModelMode =
        effectivePendingAction?.model_mode ||
        (lastAssistant?.metadata?.pending_action?.model_mode as ChatModelMode | undefined) ||
        modelMode;

      reset();
      await sendMessage(cid, text, images, {
        resumeRunId,
        idempotencyKey: crypto.randomUUID(),
        modelMode: resumeModelMode,
      });
    },
    [conversationId, sendMessage, reset, createConversation, messages, effectivePendingAction],
  );

  const handlePendingActionSubmit = useCallback(
    async (answers: string) => {
      const isAskQuestions = effectivePendingAction?.type === "ask_questions";

      if (isAskQuestions && effectivePendingAction.action_id) {
        // Parse "P: ...\nR: ..." blocks into structured Q/A for inline display
        const qa = answers
          .split("\n\n")
          .flatMap((block) => {
            const qLine = block.split("\n").find((l) => l.startsWith("P: "));
            const aLine = block.split("\n").find((l) => l.startsWith("R: "));
            if (qLine && aLine) {
              return [{ question: qLine.slice(3).trim(), answer: aLine.slice(3).trim() }];
            }
            return [];
          });

        const actionId = effectivePendingAction.action_id;

        // Update live stream blocks (before reset clears them)
        recordQuestionAnswers(actionId, qa);

        // Also patch the query cache so the persisted message shows answered Q/A immediately
        const cid2 = conversationId;
        if (cid2) {
          setChatMessagesData(cid2, (current) => {
            if (!current) return current;
            return current.map((msg) => {
              if (msg.role !== "assistant" || !Array.isArray(msg.content_blocks)) return msg;
              const hasBlock = msg.content_blocks.some(
                (b: any) => b.type === "tool_call" && b.tool_name === "ask_questions" && b.id === actionId,
              );
              if (!hasBlock) return msg;
              return {
                ...msg,
                content_blocks: msg.content_blocks.map((b: any) =>
                  b.type === "tool_call" && b.id === actionId
                    ? { ...b, metadata: { ...(b.metadata || {}), answered_qa: qa } }
                    : b,
                ),
              };
            });
          });
        }
      }

      const cid = conversationId ?? (await createConversation());
      if (!cid) return;

      if (isAskQuestions) {
        // Tag optimistic message so it's hidden from bubble rendering
        appendChatMessage(cid, {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: answers,
          created_at: new Date().toISOString(),
          metadata: {
            is_question_answer: true,
            model_mode: effectivePendingAction.model_mode ?? "fast",
          },
        });
      }

      const lastAssistant = [...messages].reverse().find((entry) => entry.role === "assistant");
      const resumeRunId =
        effectivePendingAction?.resume_run_id ||
        (lastAssistant?.metadata?.pending_action?.resume_run_id as string | undefined) ||
        null;
      const resumeModelMode =
        effectivePendingAction?.model_mode ||
        (lastAssistant?.metadata?.pending_action?.model_mode as ChatModelMode | undefined) ||
        "fast";

      reset();
      await sendMessage(cid, answers, undefined, {
        resumeRunId,
        idempotencyKey: crypto.randomUUID(),
        modelMode: resumeModelMode,
        isQuestionAnswer: isAskQuestions,
      });
    },
    [effectivePendingAction, conversationId, createConversation, messages, recordQuestionAnswers, reset, sendMessage],
  );

  const pendingQuestionsForInput = useMemo(() => {
    if (effectivePendingAction?.type !== "ask_questions") return null;
    return {
      questions: (effectivePendingAction.questions ?? []) as WizardQuestion[],
      onSubmit: (answers: string) => {
        void handlePendingActionSubmit(answers);
      },
    };
  }, [effectivePendingAction, handlePendingActionSubmit]);

  const activePendingActionId = effectivePendingAction?.action_id ?? null;

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

  // ── Streaming complete → refetch durable server messages ──
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const terminalSyncKeyRef = useRef<string | null>(null);
  const errorSyncKeyRef = useRef<string | null>(null);
  const persistedAssistantForRun = useMemo(
    () => !!runId && messages.some((entry) => entry.role === "assistant" && entry.run_id === runId),
    [messages, runId],
  );

  useEffect(() => {
    if (status !== "done" && status !== "requires_action") {
      terminalSyncKeyRef.current = null;
      return;
    }
    if (!runId) return;
    const syncKey = `${status}:${runId}`;
    if (terminalSyncKeyRef.current === syncKey) return;
    terminalSyncKeyRef.current = syncKey;
    const cid = conversationIdRef.current;
    if (!cid) return;
    invalidateChatMessagesQuery(cid);
    refreshConversations();
  }, [status, runId, refreshConversations]);

  useEffect(() => {
    if (!runId || (status !== "done" && status !== "requires_action")) {
      return;
    }
    if (!persistedAssistantForRun) {
      return;
    }
    reset();
  }, [status, runId, persistedAssistantForRun, reset]);

  useEffect(() => {
    if (status !== "error") {
      errorSyncKeyRef.current = null;
      return;
    }
    if (
      (!streamingText && streamBlocks.length === 0 && Object.keys(activeToolCallsRef.current).length === 0)
    ) {
      return;
    }
    const cid = conversationIdRef.current;
    if (!cid) return;
    const syncKey = `${runId ?? "no-run"}:${cid}`;
    if (errorSyncKeyRef.current === syncKey) return;
    errorSyncKeyRef.current = syncKey;
    invalidateChatMessagesQuery(cid);
    refreshConversations();
  }, [status, streamingText, streamBlocks, refreshConversations, runId]);

  const showLiveStream =
    status === "streaming" ||
    ((status === "done" || status === "requires_action") && !persistedAssistantForRun);
  const isStreaming = showLiveStream;
  const hasMessages = messages.length > 0 || isStreaming;

  const streamingAskQuestionsPlaceholder = useMemo(() => {
    if (!isStreaming || !streamBlocks?.length) return false;
    return streamBlocks.some(
      (b) =>
        b.type === "tool_call" &&
        b.tool_name === "ask_questions" &&
        b.state === "running",
    );
  }, [isStreaming, streamBlocks]);

  // Derive active session title for mobile header
  const activeTitle = conversationId
    ? conversations.find((c) => c.id === conversationId)?.title
    : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Mobile top bar — vertically aligned with sidebar menu button (top-4 h-10) */}
      <div className="fixed top-4 left-16 right-3 z-20 flex items-center h-10 lg:hidden">
        <h1 className="font-instrument text-2xl text-brand-primary truncate">
          {activeTitle || "Nova conversa"}
        </h1>
      </div>

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
              streamBlocks={isStreaming ? streamBlocks : undefined}
              streamingText={isStreaming ? streamingText : undefined}
              activeToolCalls={isStreaming ? activeToolCalls : undefined}
              onPendingActionSubmit={handlePendingActionSubmit}
              activePendingActionId={activePendingActionId}
            />
          )}
          <ChatInput
            onSend={handleSend}
            onCancel={cancel}
            disabled={
              loadingMessages ||
              (!!effectivePendingAction && effectivePendingAction.type !== "ask_questions")
            }
            isStreaming={isStreaming}
            initialSubject={lastSubject}
            pendingQuestions={pendingQuestionsForInput}
            streamingQuestionsPlaceholder={streamingAskQuestionsPlaceholder}
          />
        </>
      )}
    </div>
  );
}
