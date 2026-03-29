"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { usePathname } from "next/navigation";
import {
  createConversationWithCache,
  deleteConversationWithCache,
  patchChatConversationsQuery,
  useChatConversationsQuery,
  type Conversation,
} from "@/lib/queries/chat";

export type { Conversation } from "@/lib/queries/chat";

interface ChatSessionsContextValue {
  conversations: Conversation[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  createConversation: () => Promise<string | null>;
  deleteConversation: (id: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  loadingConversations: boolean;
}

const ChatSessionsContext = createContext<ChatSessionsContextValue | null>(null);
const EMPTY_CONVERSATIONS: Conversation[] = [];

export function useChatSessions() {
  const ctx = useContext(ChatSessionsContext);
  if (!ctx) {
    throw new Error("useChatSessions must be used within ChatSessionsProvider");
  }
  return ctx;
}

export function ChatSessionsProvider({
  children,
  initialConversations,
}: {
  children: React.ReactNode;
  initialConversations?: Conversation[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const pathname = usePathname();
  const shouldLoadConversations = pathname.startsWith("/student/chat") || initialConversations !== undefined;
  const conversationsQuery = useChatConversationsQuery(initialConversations, shouldLoadConversations);
  const conversations = conversationsQuery.data ?? EMPTY_CONVERSATIONS;
  const loadingConversations =
    conversationsQuery.isLoading && !conversationsQuery.data;

  const refreshConversations = useCallback(async () => {
    await conversationsQuery.refetch();
  }, [conversationsQuery.refetch]);

  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const created = await createConversationWithCache();
      setActiveId(created.id);
      return created.id;
    } catch (err) {
      console.error("Failed to create conversation:", err);
      return null;
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversationWithCache(id);
        if (activeId === id) {
          setActiveId(null);
        }
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [activeId],
  );

  useEffect(() => {
    if (!activeId) {
      return;
    }

    if (!conversations.some((conversation) => conversation.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, conversations]);

  // Listen for external events (e.g., session rename from chat)
  useEffect(() => {
    const handleCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.session) {
        patchChatConversationsQuery((prev) => {
          const current = prev ?? [];
          if (current.some((conversation) => conversation.id === detail.session.id)) {
            return current;
          }
          return [detail.session, ...current];
        });
      }
    };

    const handleRenamed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id && detail?.title) {
        patchChatConversationsQuery((prev) =>
          (prev ?? []).map((conversation) =>
            conversation.id === detail.id
              ? { ...conversation, title: detail.title }
              : conversation,
          ),
        );
      }
    };

    window.addEventListener("lusia:session-created", handleCreated);
    window.addEventListener("lusia:session-renamed", handleRenamed);
    return () => {
      window.removeEventListener("lusia:session-created", handleCreated);
      window.removeEventListener("lusia:session-renamed", handleRenamed);
    };
  }, []);

  return (
    <ChatSessionsContext.Provider
      value={{
        conversations,
        activeId,
        setActiveId,
        createConversation,
        deleteConversation,
        refreshConversations,
        loadingConversations,
      }}
    >
      {children}
    </ChatSessionsContext.Provider>
  );
}
