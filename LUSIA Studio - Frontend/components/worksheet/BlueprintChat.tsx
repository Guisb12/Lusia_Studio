"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Send, Loader2, X, Tag, Wrench } from "lucide-react";
import Image from "next/image";
import { Response } from "@/components/chat/Response";
import type { ChatMessage, ToolCallRecord } from "@/lib/worksheet-generation";

/* ────────────────────────────────────────────────
   Tool-call display
   ──────────────────────────────────────────────── */

const TOOL_LABELS: Record<string, string> = {
    upsert_block: "Bloco atualizado",
    delete_block: "Bloco removido",
};

function ToolCallPill({ call }: { call: ToolCallRecord }) {
    const label = TOOL_LABELS[call.name] || call.name;
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            <Wrench className="h-2.5 w-2.5" />
            {label}
        </span>
    );
}

/* ────────────────────────────────────────────────
   Message bubbles
   ──────────────────────────────────────────────── */

function UserBubble({ message }: { message: ChatMessage }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[85%] space-y-1">
                {message.block_id && (
                    <div className="flex justify-end">
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/5 px-1.5 py-0.5 text-[10px] text-brand-primary/50">
                            <Tag className="h-2.5 w-2.5" />
                            Bloco selecionado
                        </span>
                    </div>
                )}
                <div className="rounded-2xl rounded-tr-md bg-brand-primary/[0.06] px-3 py-2">
                    <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                        {message.content}
                    </p>
                </div>
            </div>
        </div>
    );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
    return (
        <div className="flex gap-2 items-start">
            <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
                <Image src="/lusia-symbol.png" alt="Lusia" width={18} height={18} className="object-contain" />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
                {message.tool_calls && message.tool_calls.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {message.tool_calls.map((tc, i) => (
                            <ToolCallPill key={i} call={tc} />
                        ))}
                    </div>
                )}
                <div className="text-sm">
                    <Response>{message.content}</Response>
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────────────────────────────
   BlueprintChat
   ──────────────────────────────────────────────── */

interface BlueprintChatProps {
    conversation: ChatMessage[];
    onSend: (message: string, blockId?: string | null) => void;
    isThinking: boolean;
    activeBlockId: string | null;
    onActiveBlockChange: (id: string | null) => void;
}

export function BlueprintChat({
    conversation,
    onSend,
    isThinking,
    activeBlockId,
    onActiveBlockChange,
}: BlueprintChatProps) {
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll on new messages / thinking state
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [conversation.length, isThinking]);

    // Auto-resize textarea
    const adjustHeight = useCallback(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }, []);

    useEffect(() => {
        adjustHeight();
    }, [input, adjustHeight]);

    const handleSend = () => {
        const trimmed = input.trim();
        if (!trimmed || isThinking) return;
        onSend(trimmed, activeBlockId);
        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                {conversation.length === 0 && !isThinking && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <div className="h-10 w-10 rounded-full flex items-center justify-center overflow-hidden mb-3">
                            <Image src="/lusia-symbol.png" alt="Lusia" width={28} height={28} className="object-contain" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Podes refinar o blueprint usando o chat.
                            Seleciona um bloco para direcionar a conversa.
                        </p>
                    </div>
                )}

                {conversation.map((msg, i) =>
                    msg.role === "user" ? (
                        <UserBubble key={i} message={msg} />
                    ) : (
                        <AssistantBubble key={i} message={msg} />
                    ),
                )}

                {/* Thinking indicator */}
                {isThinking && (
                    <div className="flex gap-2 items-start">
                        <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
                            <Image src="/lusia-symbol.png" alt="Lusia" width={18} height={18} className="object-contain" />
                        </div>
                        <div className="py-1">
                            <span className="text-sm italic text-muted-foreground shimmer-text">
                                A pensar...
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Input area */}
            <div className="border-t p-3 space-y-2 bg-background">
                {/* Active block tag */}
                {activeBlockId && (
                    <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/5 border border-brand-primary/10 px-2 py-0.5 text-[11px] text-brand-primary/60">
                            <Tag className="h-3 w-3" />
                            Bloco selecionado
                        </span>
                        <button
                            onClick={() => onActiveBlockChange(null)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                )}

                <div className="flex items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Pedir alterações ao blueprint..."
                        rows={1}
                        disabled={isThinking}
                        className={cn(
                            "flex-1 resize-none rounded-xl border bg-muted/30 px-3 py-2 text-sm",
                            "placeholder:text-muted-foreground/50",
                            "focus:outline-none focus:ring-1 focus:ring-brand-primary/20 focus:border-brand-primary/30",
                            "disabled:opacity-50",
                        )}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isThinking}
                        className={cn(
                            "shrink-0 h-9 w-9 rounded-xl flex items-center justify-center transition-colors",
                            input.trim() && !isThinking
                                ? "bg-brand-primary text-white hover:bg-brand-primary/90"
                                : "bg-muted text-muted-foreground/40",
                        )}
                    >
                        {isThinking ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
