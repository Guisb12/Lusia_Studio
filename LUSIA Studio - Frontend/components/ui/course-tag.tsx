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

/** Legacy or shortened keys found in the DB → canonical key */
const COURSE_ALIASES: Record<string, string> = {
    humanidades: "linguas_humanidades",
};

function getCourseInfo(courseKey: string) {
    const canonical = COURSE_ALIASES[courseKey] ?? courseKey;
    return SECUNDARIO_COURSES.find((c) => c.key === canonical);
}

/** Resolve a course value (key, alias, or display-name) to a canonical key */
export function resolveCourseKey(course: string): string | null {
    if (COURSE_ALIASES[course]) return COURSE_ALIASES[course];
    if (SECUNDARIO_COURSES.find((c) => c.key === course)) return course;
    // Try matching by label (with and without accents)
    const stripped = course.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const c of SECUNDARIO_COURSES) {
        if (c.label === course) return c.key;
        if (c.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === stripped) return c.key;
    }
    return null;
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

    const canonicalKey = COURSE_ALIASES[courseKey] ?? courseKey;
    const color = COURSE_COLORS[canonicalKey] ?? "#64748b";
    const Icon = COURSE_ICON_MAP[course.icon];
    const bgTint = `${color}1A`; // ~10% opacity
    const borderColor = `${color}40`; // ~25% opacity

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full font-medium font-satoshi leading-none select-none",
                size === "sm" && "px-2 py-0.5 gap-1 text-[10px]",
                size === "md" && "px-2.5 py-0.5 gap-1.5 text-[11px]",
                className
            )}
            style={{
                backgroundColor: bgTint,
                border: `1.5px solid ${color}`,
                borderBottomWidth: "3px",
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
