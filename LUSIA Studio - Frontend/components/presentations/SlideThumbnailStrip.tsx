"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface SlideThumbnailStripProps {
    slides: Array<{ id: string; html: string }>;
    currentSlideId: string;
    slideOrder: string[];
    planSlides?: Array<{ id: string; title?: string; type?: string }>;
    onSelectSlide: (index: number) => void;
}

const TYPE_ICONS: Record<string, string> = {
    static: "📄",
    reveal: "👁",
    quiz: "❓",
    interactive: "⚡",
};

export function SlideThumbnailStrip({
    slides,
    currentSlideId,
    slideOrder,
    planSlides,
    onSelectSlide,
}: SlideThumbnailStripProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLButtonElement>(null);

    // Auto-scroll to keep current slide visible
    useEffect(() => {
        activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [currentSlideId]);

    const slideMap = new Map(slides.map((s) => [s.id, s]));
    const planMap = new Map((planSlides ?? []).map((s) => [s.id, s]));

    return (
        <div
            ref={containerRef}
            className="flex flex-col gap-2 overflow-y-auto py-2 px-2 h-full"
        >
            {slideOrder.map((id, idx) => {
                const plan = planMap.get(id);
                const isCurrent = id === currentSlideId;
                const isConditional = slideMap.get(id)?.html?.includes('data-conditional="true"');
                const typeIcon = TYPE_ICONS[plan?.type ?? "static"] ?? "📄";

                return (
                    <button
                        key={`${id}-${idx}`}
                        ref={isCurrent ? activeRef : undefined}
                        onClick={() => onSelectSlide(idx)}
                        className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all shrink-0 min-w-0",
                            isCurrent
                                ? "bg-brand-accent/[0.08] border border-brand-accent/30"
                                : "bg-brand-primary/[0.03] border border-transparent hover:bg-brand-primary/[0.06]",
                            isConditional && "opacity-70",
                        )}
                    >
                        <span className="text-xs shrink-0 w-5 text-right tabular-nums text-brand-primary/30 font-medium">
                            {idx + 1}
                        </span>
                        <span className="text-xs shrink-0">{typeIcon}</span>
                        <span className="text-xs text-brand-primary/70 truncate min-w-0 flex-1">
                            {plan?.title || id}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
