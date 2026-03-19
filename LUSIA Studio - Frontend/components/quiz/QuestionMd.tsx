"use client";

import { QuizInlineText } from "@/components/quiz/QuizText";

/**
 * Inline rich-text renderer for quiz question/option text.
 * Supports bold, italic, inline code, and inline LaTeX ($...$).
 */
export function QuestionMd({ text, className }: { text: string; className?: string }) {
    if (!text) return null;
    return <QuizInlineText text={text} className={className} />;
}
