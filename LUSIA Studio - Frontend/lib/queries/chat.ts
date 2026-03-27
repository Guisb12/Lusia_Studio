"use client";

import type { Message } from "@/components/chat/ChatContent";
import { queryClient, useQuery } from "@/lib/query-client";

export interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

const CHAT_CONVERSATIONS_QUERY_KEY = "chat:conversations";
const CHAT_CONVERSATIONS_STALE_TIME = 60_000;

const CHAT_MESSAGES_QUERY_PREFIX = "chat:messages:";
const CHAT_MESSAGES_STALE_TIME = 60_000;

type ChatConversationsPayload =
  | Conversation[]
  | { conversations?: Conversation[] | null };

function unwrapLangchainContentRepr(text: string): string {
  const match = text.match(/content=(['"])([\s\S]*)\1(?:\s+\w+=|$)/);
  return match ? match[2] : text;
}

function parseStructuredToolEnvelope(raw: unknown): { llmText: string; toolData: Record<string, any> | null } | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const text = unwrapLangchainContentRepr(raw);
  try {
    const parsed = JSON.parse(text) as { llm_text?: string; tool_data?: Record<string, any> };
    if (typeof parsed?.llm_text === "string") {
      return {
        llmText: parsed.llm_text,
        toolData: parsed.tool_data ?? null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function hasStructuredToolData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, any>;
  if (data.output?.nodes || data.display || data.input) return true;
  if (data.tool_data && typeof data.tool_data === "object") {
    const nested = data.tool_data as Record<string, any>;
    return !!(nested.output?.nodes || nested.display || nested.input);
  }
  return false;
}

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((a, b) =>
    (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at),
  );
}

async function fetchChatConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/chat/conversations");
  if (!res.ok) {
    throw new Error(`Failed to fetch chat conversations: ${res.status}`);
  }

  const payload = (await res.json()) as ChatConversationsPayload;
  const conversations = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.conversations)
      ? payload.conversations
      : [];

  return sortConversations(conversations);
}

export function useChatConversationsQuery(initialData?: Conversation[], enabled = true) {
  return useQuery<Conversation[]>({
    key: CHAT_CONVERSATIONS_QUERY_KEY,
    enabled,
    staleTime: CHAT_CONVERSATIONS_STALE_TIME,
    initialData,
    fetcher: fetchChatConversations,
  });
}

export function primeChatConversationsCache(conversations: Conversation[]) {
  queryClient.primeQueryData(
    CHAT_CONVERSATIONS_QUERY_KEY,
    sortConversations(conversations),
  );
}

export function prefetchChatConversationsQuery() {
  return queryClient.fetchQuery<Conversation[]>({
    key: CHAT_CONVERSATIONS_QUERY_KEY,
    staleTime: CHAT_CONVERSATIONS_STALE_TIME,
    fetcher: fetchChatConversations,
  });
}

export function patchChatConversationsQuery(
  updater:
    | Conversation[]
    | ((current: Conversation[] | undefined) => Conversation[] | undefined),
) {
  queryClient.setQueryData<Conversation[]>(CHAT_CONVERSATIONS_QUERY_KEY, updater);
}

export async function createConversationWithCache(): Promise<Conversation> {
  const res = await fetch("/api/chat/conversations", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to create conversation: ${res.status}`);
  }

  const created = (await res.json()) as Conversation;
  patchChatConversationsQuery((current) =>
    sortConversations([
      created,
      ...(current ?? []).filter((conversation) => conversation.id !== created.id),
    ]),
  );
  return created;
}

export function invalidateChatQueries() {
  queryClient.invalidateQueries(CHAT_CONVERSATIONS_QUERY_KEY);
}

export async function deleteConversationWithCache(id: string): Promise<void> {
  const res = await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Failed to delete conversation: ${res.status}`);
  }

  patchChatConversationsQuery((current) =>
    (current ?? []).filter((conversation) => conversation.id !== id),
  );

  // Clear cached messages for the deleted conversation
  queryClient.setQueryData<Message[]>(buildChatMessagesKey(id), undefined);
}

// ── Messages ──

export function buildChatMessagesKey(conversationId: string): string {
  return `${CHAT_MESSAGES_QUERY_PREFIX}${conversationId}`;
}

async function fetchChatMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`/api/chat/conversations/${conversationId}/messages`);
  if (!res.ok) {
    throw new Error(`Failed to fetch chat messages: ${res.status}`);
  }

  const data = await res.json();
  const rawMessages = (data.messages || []) as any[];

  const toolResultsByRunAndId = new Map<string, { content: string; metadata: Record<string, any> | null }>();
  for (const m of rawMessages) {
    if (m.role !== "tool" || !m.run_id || !m.tool_call_id) continue;
    const parsedEnvelope = parseStructuredToolEnvelope(m.content);
    toolResultsByRunAndId.set(`${m.run_id}:${m.tool_call_id}`, {
      content: parsedEnvelope?.llmText ?? unwrapLangchainContentRepr(m.content || ""),
      metadata: (parsedEnvelope?.toolData ?? m.metadata?.tool_data ?? m.metadata ?? null) as Record<string, any> | null,
    });
  }

  // Build a map of answered Q/A from question-answer user messages, keyed by resume_run_id
  // so we can inject them into the preceding assistant's ask_questions block on history replay.
  const answeredQaByResumeRunId = new Map<string, { question: string; answer: string }[]>();
  for (const m of rawMessages) {
    if (m.role !== "user" || !m.metadata?.is_question_answer || !m.metadata?.resume_run_id) continue;
    const qa = (m.content as string)
      .split("\n\n")
      .flatMap((block: string) => {
        const qLine = block.split("\n").find((l: string) => l.startsWith("P: "));
        const aLine = block.split("\n").find((l: string) => l.startsWith("R: "));
        if (qLine && aLine) {
          return [{ question: (qLine as string).slice(3).trim(), answer: (aLine as string).slice(3).trim() }];
        }
        return [] as { question: string; answer: string }[];
      });
    if (qa.length > 0) {
      answeredQaByResumeRunId.set(m.metadata.resume_run_id as string, qa);
    }
  }

  return rawMessages
    .filter((m) => {
      if (m.role !== "user" && m.role !== "assistant") return false;
      if (m.metadata?.message_kind === "assistant_tool_call") return false;
      // Hide question-answer user messages — shown inline inside the ask_questions tool block
      if (m.role === "user" && m.metadata?.is_question_answer === true) return false;
      return true;
    })
    .map((m) => {
      // Find answered Q/A for this assistant message's ask_questions block
      // by looking for a subsequent user message that resumed this run
      const answeredQaForRun = m.run_id ? answeredQaByResumeRunId.get(m.run_id) : undefined;

      const hydratedContentBlocks = Array.isArray(m.content_blocks)
        ? m.content_blocks.map((block: any) => {
            if (block?.type !== "tool_call" || !m.run_id || !block.id) return block;
            const toolResult = toolResultsByRunAndId.get(`${m.run_id}:${block.id}`);

            // Inject answered Q/A into the ask_questions block
            const isAskQuestions = block.tool_name === "ask_questions";
            const injectedMetadata =
              isAskQuestions && answeredQaForRun
                ? { ...(block.metadata || {}), answered_qa: answeredQaForRun }
                : block.metadata ?? null;

            if (!toolResult) {
              return isAskQuestions && answeredQaForRun ? { ...block, metadata: injectedMetadata } : block;
            }
            const currentResult =
              typeof block.result === "string" ? block.result.trim() : "";
            const currentMetadata = block.metadata ?? null;
            return {
              ...block,
              result: currentResult ? block.result : toolResult.content,
              metadata: isAskQuestions && answeredQaForRun
                ? injectedMetadata
                : hasStructuredToolData(currentMetadata) ? currentMetadata : toolResult.metadata,
              state: block.state === "completed" ? block.state : "completed",
            };
          })
        : null;

      return ({
      id: m.id,
      role: m.role,
      content: m.content,
      run_id: m.run_id ?? null,
      sequence: m.sequence ?? null,
      created_at: m.created_at,
      metadata: m.metadata || null,
      tool_calls: m.tool_calls || null,
      content_blocks: hydratedContentBlocks,
    });
    });
}

export function useChatMessagesQuery(conversationId: string | null) {
  const key = conversationId ? buildChatMessagesKey(conversationId) : "";

  return useQuery<Message[]>({
    key: key || "chat:messages:__disabled__",
    fetcher: () => fetchChatMessages(conversationId!),
    enabled: !!conversationId,
    staleTime: CHAT_MESSAGES_STALE_TIME,
  });
}

export function setChatMessagesData(
  conversationId: string,
  updater: Message[] | ((current: Message[] | undefined) => Message[] | undefined),
) {
  queryClient.setQueryData<Message[]>(buildChatMessagesKey(conversationId), updater);
}

export function appendChatMessage(conversationId: string, message: Message) {
  setChatMessagesData(conversationId, (current) => [...(current ?? []), message]);
}

export function invalidateChatMessagesQuery(conversationId: string) {
  queryClient.invalidateQueries(buildChatMessagesKey(conversationId));
}
