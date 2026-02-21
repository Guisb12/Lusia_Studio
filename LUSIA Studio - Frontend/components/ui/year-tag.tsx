"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface YearTagProps {
    year: string; // e.g., "10", "11", "12"
    className?: string;
}

/**
 * Mini tag for year/grade level (e.g., [10] [11] [12])
 */
export function YearTag({ year, className }: YearTagProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-medium font-satoshi tabular-nums",
                "bg-brand-primary/5 text-brand-primary/70 border border-brand-primary/15",
                className
            )}
        >
            {year}
        </span>
    );
}
