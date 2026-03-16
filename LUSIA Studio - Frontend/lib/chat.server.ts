import { fetchBackendJsonServer } from "@/lib/backend.server";
import type { Conversation } from "@/lib/queries/chat";

type ChatConversationsPayload =
  | Conversation[]
  | { conversations?: Conversation[] | null };

export async function fetchChatConversationsServer(): Promise<Conversation[]> {
  const payload = await fetchBackendJsonServer<ChatConversationsPayload>(
    "/api/v1/chat/conversations",
    { fallback: [] },
  );

  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.conversations) ? payload.conversations : [];
}
