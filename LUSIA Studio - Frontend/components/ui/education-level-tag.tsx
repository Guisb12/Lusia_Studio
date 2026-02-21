"use client";

import React from "react";
import { BookOpen, School, GraduationCap, Layers, LucideIcon } from "lucide-react";
import {
    getEducationLevelByGrade,
    type EducationLevel,
} from "@/lib/curriculum";
import { cn } from "@/lib/utils";

const LEVEL_ICON_MAP: Record<EducationLevel, LucideIcon> = {
    basico_1_ciclo: BookOpen,
    basico_2_ciclo: School,
    basico_3_ciclo: GraduationCap,
    secundario: Layers,
};

/** Hex colors per education level (pill style, same as course/year tags) */
const LEVEL_COLORS: Record<EducationLevel, string> = {
    basico_1_ciclo: "#2563eb",   // blue
    basico_2_ciclo: "#059669",   // teal/green
    basico_3_ciclo: "#ea580c",   // orange
    secundario: "#7c3aed",       // purple
};

export interface EducationLevelTagProps {
    /** Grade as stored (e.g. "10", "7") — used to derive 1º Ciclo, 2º Ciclo, 3º Ciclo, Secundário */
    grade: string;
    className?: string;
    size?: "sm" | "md";
}

/**
 * Capsule/pill tag for education level (1º Ciclo, 2º Ciclo, 3º Ciclo, Secundário).
 * Soft, light style matching reference: thin border, airy padding, pure color text.
 */
export function EducationLevelTag({ grade, className, size = "md" }: EducationLevelTagProps) {
    const level = getEducationLevelByGrade(grade);
    if (!level) return null;

    const color = LEVEL_COLORS[level.key];
    const Icon = LEVEL_ICON_MAP[level.key];
    const bgTint = `${color}1A`; // ~10% opacity
    const borderColor = `${color}40`; // ~25% opacity

    return (
        <span
            className={cn(
                "inline-flex items-center box-border rounded-full border font-satoshi font-semibold",
                size === "sm" && "h-7 px-4 py-1 gap-2 text-[11px]",
                size === "md" && "h-8 px-5 py-1.5 gap-2 text-xs",
                className
            )}
            style={{
                backgroundColor: bgTint,
                borderColor,
                color,
            }}
        >
            <Icon
                className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")}
                strokeWidth={1.5}
            />
            <span className="truncate leading-none">{level.shortLabel}</span>
        </span>
    );
}
