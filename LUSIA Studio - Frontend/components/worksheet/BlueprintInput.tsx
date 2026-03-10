"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BlueprintInputProps {
    onSend: (message: string) => void;
    isThinking: boolean;
}

export function BlueprintInput({ onSend, isThinking }: BlueprintInputProps) {
    const [input, setInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSend = () => {
        const trimmed = input.trim();
        if (!trimmed || isThinking) return;
        onSend(trimmed);
        setInput("");
    };

    return (
        <div className="shrink-0 px-4 pb-5 pt-2">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-2.5 bg-white rounded-full pl-2 pr-2.5 py-2 shadow-sm border border-brand-primary/[0.08]">
                    {/* Avatar */}
                    <div className="shrink-0 flex items-center justify-center">
                        <Image
                            src="/lusia-symbol.png"
                            alt="Lusia"
                            width={22}
                            height={22}
                            className="object-contain"
                        />
                    </div>

                    {/* Input */}
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSend();
                        }}
                        placeholder={isThinking ? "A pensar..." : "Pedir alterações ao plano..."}
                        disabled={isThinking}
                        className={cn(
                            "flex-1 bg-transparent text-[13.5px] text-brand-primary placeholder:text-brand-primary/30 outline-none",
                            "disabled:opacity-60",
                        )}
                    />

                    {/* Send button */}
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isThinking}
                        className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all",
                            input.trim() && !isThinking
                                ? "bg-brand-primary text-white hover:bg-brand-primary/90"
                                : "bg-brand-primary/[0.06] text-brand-primary/25",
                        )}
                    >
                        {isThinking ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <ArrowUp className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
