"use client";

import { inlineRichToHtml } from "@/lib/tiptap/rich-text";

/**
 * Inline rich-text renderer for quiz question/option text.
 * Supports bold, italic, inline code, and inline LaTeX ($...$).
 */
export function QuestionMd({ text, className }: { text: string; className?: string }) {
    if (!text) return null;
    return <span className={className} dangerouslySetInnerHTML={{ __html: inlineRichToHtml(text) }} />;
}
