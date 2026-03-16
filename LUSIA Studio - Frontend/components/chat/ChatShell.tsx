"use client";

import { primeChatConversationsCache, type Conversation } from "@/lib/queries/chat";
import { ChatPage } from "./ChatPage";

interface ChatShellProps {
  initialConversations: Conversation[];
}

/**
 * Chat feature shell.
 *
 * Primes the conversation cache with server data so the sidebar
 * renders instantly. Delegates interaction to ChatPage which
 * loads messages after mount and shows a skeleton while loading.
 */
export function ChatShell({ initialConversations }: ChatShellProps) {
  primeChatConversationsCache(initialConversations);

  return <ChatPage />;
}
