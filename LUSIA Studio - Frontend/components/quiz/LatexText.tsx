"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";

const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];

// Strip the default <p> wrapper so this can be used inline inside
// buttons, spans, and other containers that don't accept block children.
const components = {
    p: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => (
        <>{children}</>
    ),
};

/**
 * Renders text with LaTeX math support using KaTeX.
 * Use inline math with $...$ and display math with $$...$$.
 */
export function LatexText({ children }: { children?: string | null }) {
    if (!children) return null;
    return (
        <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
        >
            {children}
        </ReactMarkdown>
    );
}
