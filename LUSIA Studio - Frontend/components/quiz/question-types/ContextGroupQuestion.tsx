"use client";

import React from "react";
import { Label } from "@/components/ui/label";

/* ─── Editor View ─── */
export function ContextGroupEditor({
    contextText,
    onContentChange,
}: {
    contextText: string;
    onContentChange: (patch: Record<string, any>) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-brand-primary/40 text-xs">
                Texto de contexto / introdução
            </Label>
            <textarea
                value={contextText}
                onChange={(e) => onContentChange({ question: e.target.value })}
                placeholder="Escreve o texto de contexto do grupo..."
                rows={4}
                className="w-full rounded-xl border-2 border-brand-primary/10 bg-white px-5 py-4 text-base text-brand-primary placeholder:text-brand-primary/25 outline-none focus:border-brand-accent/40 focus:ring-4 focus:ring-brand-accent/10 transition-all resize-y"
            />
            <p className="text-xs text-brand-primary/30">
                As subperguntas do grupo são editadas individualmente no documento.
            </p>
        </div>
    );
}

/* ─── Display View ─── */
export function ContextGroupDisplay({
    contextText,
}: {
    contextText: string;
}) {
    return (
        <div className="rounded-xl border border-dashed border-brand-primary/15 bg-brand-primary/3 px-4 py-3">
            <p className="text-sm text-brand-primary/70 whitespace-pre-wrap">
                {contextText || "Texto de contexto do grupo"}
            </p>
        </div>
    );
}
