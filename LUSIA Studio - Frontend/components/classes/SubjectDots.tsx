"use client";

import { useMemo } from "react";
import type { Subject } from "@/types/subjects";
import { cn } from "@/lib/utils";

interface SubjectDotsProps {
    subjectIds: string[];
    subjects: Subject[];
    maxDots?: number;
    showLabels?: boolean;
    size?: "sm" | "md";
    className?: string;
}

export function SubjectDots({
    subjectIds,
    subjects,
    maxDots = 4,
    showLabels = false,
    size = "sm",
    className,
}: SubjectDotsProps) {
    const matched = useMemo(() => {
        const map = new Map(subjects.map((s) => [s.id, s]));
        return subjectIds
            .map((id) => map.get(id))
            .filter((s): s is Subject => !!s);
    }, [subjectIds, subjects]);

    if (matched.length === 0) return null;

    const visible = matched.slice(0, maxDots);
    const remaining = matched.length - visible.length;
    const dotSize = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

    if (showLabels) {
        return (
            <div className={cn("flex flex-wrap gap-1.5", className)}>
                {visible.map((s) => (
                    <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                            backgroundColor: `${s.color || "#6b7280"}12`,
                            color: s.color || "#6b7280",
                        }}
                    >
                        <span
                            className={cn("rounded-full shrink-0", dotSize)}
                            style={{ backgroundColor: s.color || "#6b7280" }}
                        />
                        {s.name}
                    </span>
                ))}
                {remaining > 0 && (
                    <span className="text-[10px] text-brand-primary/50 font-medium self-center">
                        +{remaining}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className={cn("flex items-center gap-1", className)}>
            {visible.map((s) => (
                <span
                    key={s.id}
                    className={cn("rounded-full shrink-0", dotSize)}
                    style={{ backgroundColor: s.color || "#6b7280" }}
                    title={s.name}
                />
            ))}
            {remaining > 0 && (
                <span className="text-[10px] text-brand-primary/40 font-medium">
                    +{remaining}
                </span>
            )}
        </div>
    );
}
