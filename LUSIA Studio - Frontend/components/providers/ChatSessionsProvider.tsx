"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

export interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

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

export function useChatSessions() {
  const ctx = useContext(ChatSessionsContext);
  if (!ctx) {
    throw new Error("useChatSessions must be used within ChatSessionsProvider");
  }
  return ctx;
}

export function ChatSessionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const fetchedRef = useRef(false);

  const refreshConversations = useCallback(async () => {
    try {
      setLoadingConversations(true);
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    refreshConversations();
  }, [refreshConversations]);

  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/chat/conversations", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create conversation");
      const data = await res.json();
      setConversations((prev) => [data, ...prev]);
      setActiveId(data.id);
      return data.id;
    } catch (err) {
      console.error("Failed to create conversation:", err);
      return null;
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) {
          setActiveId(null);
        }
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [activeId],
  );

  // Listen for external events (e.g., session rename from chat)
  useEffect(() => {
    const handleCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.session) {
        setConversations((prev) => {
          if (prev.some((c) => c.id === detail.session.id)) return prev;
          return [detail.session, ...prev];
        });
      }
    };

    const handleRenamed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id && detail?.title) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === detail.id ? { ...c, title: detail.title } : c,
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
