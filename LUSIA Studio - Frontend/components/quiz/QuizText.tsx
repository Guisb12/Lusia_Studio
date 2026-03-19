"use client";

import type { ElementType } from "react";
import { MathBlockText, MathInlineText } from "@/lib/tiptap/math-rich-text";
import { normalizeQuizInlineText } from "@/lib/tiptap/quiz-rich-text";

export function QuizInlineText({
    text,
    className,
}: {
    text: string;
    className?: string;
}) {
    const normalized = normalizeQuizInlineText(text || "");
    if (!normalized) return null;
    return <MathInlineText text={normalized} className={className} />;
}

export function QuizBlockText({
    text,
    className,
    as: Component = "div",
}: {
    text: string;
    className?: string;
    as?: ElementType;
}) {
    const normalized = normalizeQuizInlineText(text || "");
    if (!normalized) return null;
    return <MathBlockText text={normalized} className={className} as={Component} />;
}
