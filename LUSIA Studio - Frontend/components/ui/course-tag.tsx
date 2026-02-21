"use client";

import React from "react";
import { Atom, TrendingUp, BookOpen, Palette, LucideIcon } from "lucide-react";
import { SECUNDARIO_COURSES } from "@/lib/curriculum";
import { cn } from "@/lib/utils";

const COURSE_ICON_MAP: Record<string, LucideIcon> = {
    atom: Atom,
    "trending-up": TrendingUp,
    "book-open": BookOpen,
    palette: Palette,
};

/** Hex colors for each course (pill style: icon + text + light bg + border) */
const COURSE_COLORS: Record<string, string> = {
    ciencias_tecnologias: "#2563eb",      // blue
    ciencias_socioeconomicas: "#ea580c",  // orange
    linguas_humanidades: "#059669",       // teal/green
    artes_visuais: "#7c3aed",             // purple
};

function getCourseInfo(courseKey: string) {
    return SECUNDARIO_COURSES.find((c) => c.key === courseKey);
}

export interface CourseTagProps {
    courseKey: string;
    className?: string;
    size?: "sm" | "md";
}

/**
 * Capsule/pill tag for student course (Secundário).
 * Soft, light style matching reference: thin border, airy padding, pure color text.
 */
export function CourseTag({ courseKey, className, size = "md" }: CourseTagProps) {
    const course = getCourseInfo(courseKey);
    if (!course) return null;

    const color = COURSE_COLORS[courseKey] ?? "#64748b";
    const Icon = COURSE_ICON_MAP[course.icon];
    const bgTint = `${color}1A`; // ~10% opacity
    const borderColor = `${color}40`; // ~25% opacity

    return (
        <span
            className={cn(
                "inline-flex items-center box-border rounded-full border font-satoshi font-semibold",
                size === "sm" && "h-5 px-2 py-0 gap-1.5 text-[10px] leading-none",
                size === "md" && "h-6 px-2.5 py-0 gap-1.5 text-[11px] leading-none",
                className
            )}
            style={{
                backgroundColor: bgTint,
                borderColor,
                color,
            }}
        >
            {Icon && (
                <Icon
                    className={cn("shrink-0", size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")}
                    strokeWidth={1.5}
                />
            )}
            <span className="truncate leading-none">{course.label}</span>
        </span>
    );
}
