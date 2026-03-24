"use client";

import React, { useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";

interface AgentTextInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder?: string;
    disabled?: boolean;
}

export function AgentTextInput({
    value,
    onChange,
    onSubmit,
    placeholder = "Escreve a tua mensagem...",
    disabled = false,
}: AgentTextInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!disabled) textareaRef.current?.focus();
    }, [disabled]);

    return (
        <div className="space-y-2">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={1}
                autoFocus
                disabled={disabled}
                className="resize-none w-full text-sm bg-transparent outline-none border-none ring-0 px-0 py-1.5 text-brand-primary placeholder:text-brand-primary/30 leading-snug font-satoshi overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (value.trim()) onSubmit();
                    }
                }}
            />
            <div className="flex justify-end">
                <button
                    onClick={onSubmit}
                    disabled={!value.trim() || disabled}
                    className="h-8 w-8 rounded-full bg-brand-accent disabled:opacity-30 flex items-center justify-center transition-all duration-150 outline-none focus-visible:outline-none hover:bg-brand-accent/90"
                >
                    <ArrowUp className="h-4 w-4 text-white" />
                </button>
            </div>
        </div>
    );
}
