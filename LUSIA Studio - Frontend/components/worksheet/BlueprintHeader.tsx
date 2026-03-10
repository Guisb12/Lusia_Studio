"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ContextSummary } from "@/lib/worksheet-generation";

interface BlueprintHeaderProps {
    contextSummary: ContextSummary | null;
    blockCount: number;
    onResolve: () => void;
    disabled: boolean;
    onBack?: () => void;
}

export function BlueprintHeader({
    contextSummary,
    blockCount,
    onResolve,
    disabled,
    onBack,
}: BlueprintHeaderProps) {
    const router = useRouter();

    return (
        <div className="flex items-center justify-between px-5 py-3.5 bg-background shrink-0">
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack ?? (() => router.push("/dashboard/docs"))}
                    className="text-brand-primary/30 hover:text-brand-primary/60 transition-colors outline-none"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-brand-primary">
                        {contextSummary?.subject_name || "Ficha de Exercícios"}
                    </span>
                    {blockCount > 0 && (
                        <span className="text-xs text-brand-primary/35">
                            {blockCount} {blockCount === 1 ? "questão" : "questões"}
                        </span>
                    )}
                </div>
            </div>

            <button
                onClick={onResolve}
                disabled={disabled}
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                    disabled
                        ? "bg-brand-primary/[0.06] text-brand-primary/30 cursor-not-allowed"
                        : "bg-brand-primary text-white hover:bg-brand-primary/90 shadow-sm",
                )}
            >
                <Sparkles className="h-3.5 w-3.5" />
                Criar Ficha
            </button>
        </div>
    );
}
