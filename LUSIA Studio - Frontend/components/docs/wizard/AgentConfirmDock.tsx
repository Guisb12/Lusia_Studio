"use client";

import React, { useState } from "react";
import { ArrowRight, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardConfirm } from "@/lib/wizard-types";

interface AgentConfirmDockProps {
    confirm: WizardConfirm;
    onConfirm: () => void;
    onReply: (text: string) => void;
    disabled?: boolean;
}

export function AgentConfirmDock({ confirm, onConfirm, onReply, disabled }: AgentConfirmDockProps) {
    const [usingFreeText, setUsingFreeText] = useState(false);
    const [freeText, setFreeText] = useState("");

    const handleFreeTextSubmit = () => {
        const trimmed = freeText.trim();
        if (!trimmed) return;
        onReply(trimmed);
    };

    return (
        <div className="space-y-1">
            {/* Confirm option */}
            <button
                onClick={onConfirm}
                disabled={disabled}
                className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 transition-all duration-150 outline-none focus-visible:outline-none text-left rounded-xl",
                    "hover:bg-brand-primary/[0.04]",
                )}
            >
                <span className="h-6 w-6 rounded-lg bg-brand-primary/[0.06] flex items-center justify-center shrink-0">
                    <Check className="h-3.5 w-3.5 text-brand-primary/50" />
                </span>
                <span className="text-sm text-brand-primary font-medium">Confirmo, vamos prosseguir</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brand-primary/30 ml-auto" />
            </button>

            {/* Free text option */}
            {usingFreeText ? (
                <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="h-6 w-6 rounded-lg bg-brand-primary/[0.06] flex items-center justify-center shrink-0">
                        <Pencil className="h-3 w-3 text-brand-primary/40" />
                    </span>
                    <input
                        type="text"
                        autoFocus
                        value={freeText}
                        onChange={(e) => setFreeText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleFreeTextSubmit();
                            }
                        }}
                        placeholder="Quero ajustar..."
                        className="flex-1 text-sm bg-transparent outline-none text-brand-primary placeholder:text-brand-primary/25 font-satoshi"
                    />
                    <button
                        onClick={handleFreeTextSubmit}
                        disabled={!freeText.trim()}
                        className="h-7 w-7 rounded-lg bg-brand-primary disabled:opacity-20 flex items-center justify-center transition-all hover:bg-brand-primary/90"
                    >
                        <ArrowRight className="h-3.5 w-3.5 text-white" />
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setUsingFreeText(true)}
                    disabled={disabled}
                    className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-brand-primary/[0.04] transition-colors outline-none text-left"
                >
                    <span className="h-6 w-6 rounded-lg bg-brand-primary/[0.06] flex items-center justify-center shrink-0">
                        <Pencil className="h-3 w-3 text-brand-primary/30" />
                    </span>
                    <span className="text-sm text-brand-primary/30">Quero ajustar algo</span>
                </button>
            )}
        </div>
    );
}
