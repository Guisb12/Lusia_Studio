"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatContent, type Message } from "./ChatContent";
import type { PendingAction } from "@/lib/hooks/use-chat-stream";
import type { AssistantContentBlock, ToolCallState } from "./tools/types";

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    __LUSIA_CHAT_TRANSCRIPT_BRIDGE__?: {
      receiveEvent: (event: TranscriptInboundEvent) => void;
    };
  }
}

type TranscriptHydratedState = {
  messages: Message[];
  liveMessage: {
    visible: boolean;
    content: string;
    contentBlocks?: AssistantContentBlock[];
    toolCalls?: Record<string, ToolCallState>;
    activePendingActionId?: string | null;
  } | null;
  pendingAction: PendingAction | null;
  error: string | null;
};

type TranscriptInboundEvent =
  | {
      type: "hydrate_transcript";
      payload: TranscriptHydratedState;
    }
  | {
      type: "append_optimistic_user_message";
      payload: { message: Message };
    }
  | {
      type: "stream_begin";
      payload: TranscriptHydratedState["liveMessage"];
    }
  | {
      type: "stream_frame";
      payload: TranscriptHydratedState["liveMessage"];
    }
  | {
      type: "stream_complete";
      payload: TranscriptHydratedState["liveMessage"];
    }
  | {
      type: "stream_error";
      payload: { error: string | null };
    }
  | {
      type: "set_pending_action";
      payload: { pendingAction: PendingAction | null };
    }
  | {
      type: "reset_live_state";
    };

function postToNative(payload: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.ReactNativeWebView?.postMessage) {
    return false;
  }
  window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  return true;
}

export function MobileChatTranscriptClient() {
  const [state, setState] = useState<TranscriptHydratedState>({
    messages: [],
    liveMessage: null,
    pendingAction: null,
    error: null,
  });
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const pendingHydrationAckRef = useRef(false);

  const handlePendingActionSubmit = useCallback((answers: string) => {
    postToNative({
      type: "tool_action",
      payload: {
        action: "submit_pending_answers",
        data: { answers },
      },
    });
  }, []);

  useEffect(() => {
    window.__LUSIA_CHAT_TRANSCRIPT_BRIDGE__ = {
      receiveEvent: (event: TranscriptInboundEvent) => {
        if (event.type === "hydrate_transcript") {
          pendingHydrationAckRef.current = true;
          setState(event.payload);
          setOptimisticMessages((current) =>
            current.filter(
              (message) => !event.payload.messages.some((persisted) => persisted.id === message.id),
            ),
          );
          return;
        }

        if (event.type === "append_optimistic_user_message") {
          setOptimisticMessages((current) => {
            if (current.some((message) => message.id === event.payload.message.id)) {
              return current;
            }
            return [...current, event.payload.message];
          });
          setState((current) => ({
            ...current,
            error: null,
          }));
          return;
        }

        if (
          event.type === "stream_begin" ||
          event.type === "stream_frame" ||
          event.type === "stream_complete"
        ) {
          setState((current) => ({
            ...current,
            liveMessage: event.payload,
            error: null,
          }));
          return;
        }

        if (event.type === "stream_error") {
          setState((current) => ({
            ...current,
            error: event.payload.error ?? null,
          }));
          return;
        }

        if (event.type === "set_pending_action") {
          setState((current) => ({
            ...current,
            pendingAction: event.payload.pendingAction ?? null,
          }));
          return;
        }

        if (event.type === "reset_live_state") {
          setState((current) => ({
            ...current,
            liveMessage: null,
          }));
        }
      },
    };

    postToNative({ type: "ready" });

    return () => {
      delete window.__LUSIA_CHAT_TRANSCRIPT_BRIDGE__;
    };
  }, []);

  useEffect(() => {
    if (!pendingHydrationAckRef.current) return;
    pendingHydrationAckRef.current = false;

    const rafId = window.requestAnimationFrame(() => {
      postToNative({ type: "hydrated" });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [state]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor?.href) return;

      event.preventDefault();
      postToNative({
        type: "open_link",
        payload: { href: anchor.href },
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (!navigator.clipboard) return;

    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text: string) => {
      postToNative({
        type: "copy_text",
        payload: { text },
      });
      return Promise.resolve();
    };

    return () => {
      navigator.clipboard.writeText = originalWriteText;
    };
  }, []);

  const liveStreamActive = !!state.liveMessage?.visible;
  const mergedMessages = useMemo(() => {
    if (optimisticMessages.length === 0) return state.messages;
    const seen = new Set(state.messages.map((message) => message.id));
    const extra = optimisticMessages.filter((message) => !seen.has(message.id));
    return [...state.messages, ...extra];
  }, [optimisticMessages, state.messages]);

  return (
    <div className="h-screen overflow-hidden bg-[#f6f3ef]">
      <div className="flex h-full min-h-0 flex-col bg-[#f6f3ef]">
        {state.error ? (
          <div className="mx-4 mt-2 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 shrink-0">
            {state.error}
          </div>
        ) : null}

        <ChatContent
          messages={mergedMessages}
          streamBlocks={liveStreamActive ? state.liveMessage?.contentBlocks : undefined}
          streamingText={liveStreamActive ? state.liveMessage?.content : undefined}
          activeToolCalls={liveStreamActive ? state.liveMessage?.toolCalls : undefined}
          activePendingActionId={state.liveMessage?.activePendingActionId ?? state.pendingAction?.action_id ?? null}
          onPendingActionSubmit={handlePendingActionSubmit}
        />
      </div>
    </div>
  );
}
