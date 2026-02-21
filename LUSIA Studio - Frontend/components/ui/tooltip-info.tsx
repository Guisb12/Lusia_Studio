"use client";

import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import { useState } from "react";

interface TooltipInfoProps {
    content: string;
    className?: string;
}

export function TooltipInfo({ content, className }: TooltipInfoProps) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div className={cn("relative inline-flex", className)}>
            <button
                type="button"
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
                onFocus={() => setIsVisible(true)}
                onBlur={() => setIsVisible(false)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-brand-muted hover:text-brand-primary/60 transition-colors cursor-help"
                aria-label="Mais informação"
            >
                <HelpCircle className="h-3.5 w-3.5" />
            </button>

            {isVisible && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                    <div className="relative rounded-lg bg-brand-primary px-3 py-2 text-xs text-white shadow-lg max-w-[220px] text-center leading-relaxed">
                        {content}
                        {/* Arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                            <div className="h-0 w-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-brand-primary" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
