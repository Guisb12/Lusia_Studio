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
  return ((data.messages || []) as any[])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      metadata: m.metadata || null,
      tool_calls: m.tool_calls || null,
    }));
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
