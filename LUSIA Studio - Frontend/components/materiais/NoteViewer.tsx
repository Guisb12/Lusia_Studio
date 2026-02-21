"use client";

import React, { useMemo } from "react";
import { Clock, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import type { Components } from "react-markdown";
import type { BaseContentNote } from "@/lib/materials";

interface NoteViewerProps {
    note: BaseContentNote;
}

/* ═══════════════════════════════════════════════════════════════
   CALLOUT CONFIG
   Maps Obsidian-style callout types to visual styles.
   ═══════════════════════════════════════════════════════════════ */

const CALLOUT_TYPES: Record<
    string,
    { bg: string; border: string; icon: string; label: string }
> = {
    info: {
        bg: "bg-blue-50",
        border: "border-blue-200",
        icon: "ℹ️",
        label: "Informação",
    },
    abstract: {
        bg: "bg-purple-50",
        border: "border-purple-200",
        icon: "📋",
        label: "Resumo",
    },
    example: {
        bg: "bg-green-50",
        border: "border-green-200",
        icon: "💡",
        label: "Exemplo",
    },
    success: {
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        icon: "✅",
        label: "Resumo",
    },
    warning: {
        bg: "bg-amber-50",
        border: "border-amber-200",
        icon: "⚠️",
        label: "Atenção",
    },
    tip: {
        bg: "bg-teal-50",
        border: "border-teal-200",
        icon: "💡",
        label: "Dica",
    },
};

/* ═══════════════════════════════════════════════════════════════
   CALLOUT EXTRACTION
   Split content into segments: regular markdown blocks and
   callout blocks (> [!type] Title\n> body lines...).
   Each callout body is then rendered through react-markdown
   so nested formatting (bold, lists, LaTeX, etc.) works.
   ═══════════════════════════════════════════════════════════════ */

interface Segment {
    kind: "markdown" | "callout";
    text: string;
    calloutType?: string;
    calloutTitle?: string;
}

function splitIntoSegments(content: string): Segment[] {
    const lines = content.split("\n");
    const segments: Segment[] = [];
    let mdBuffer: string[] = [];
    let i = 0;

    const flushMd = () => {
        if (mdBuffer.length > 0) {
            segments.push({ kind: "markdown", text: mdBuffer.join("\n") });
            mdBuffer = [];
        }
    };

    while (i < lines.length) {
        const line = lines[i];
        const calloutMatch = line.match(/^>\s*\[!(\w+)\]\s*(.*)/);

        if (calloutMatch) {
            flushMd();
            const type = calloutMatch[1].toLowerCase();
            const title = calloutMatch[2] || "";
            const bodyLines: string[] = [];
            i++;
            while (i < lines.length && lines[i].startsWith(">")) {
                bodyLines.push(lines[i].replace(/^>\s?/, ""));
                i++;
            }
            segments.push({
                kind: "callout",
                text: bodyLines.join("\n"),
                calloutType: type,
                calloutTitle: title,
            });
        } else {
            mdBuffer.push(line);
            i++;
        }
    }
    flushMd();
    return segments;
}

/* ═══════════════════════════════════════════════════════════════
   MARKDOWN COMPONENT OVERRIDES
   Custom styled elements for react-markdown rendering.
   ═══════════════════════════════════════════════════════════════ */

const mdComponents: Components = {
    h1: ({ children }) => (
        <h1 className="text-xl font-instrument tracking-tight text-brand-primary mt-6 mb-3">
            {children}
        </h1>
    ),
    h2: ({ children }) => (
        <h2 className="text-lg font-satoshi font-bold text-brand-primary mt-5 mb-2">
            {children}
        </h2>
    ),
    h3: ({ children }) => (
        <h3 className="text-base font-satoshi font-bold text-brand-primary mt-4 mb-2">
            {children}
        </h3>
    ),
    h4: ({ children }) => (
        <h4 className="text-sm font-satoshi font-bold text-brand-primary/90 mt-3 mb-1">
            {children}
        </h4>
    ),
    p: ({ children }) => (
        <p className="text-sm text-brand-primary/75 font-satoshi leading-relaxed my-3">
            {children}
        </p>
    ),
    strong: ({ children }) => (
        <strong className="font-bold text-brand-primary">{children}</strong>
    ),
    em: ({ children }) => (
        <em className="italic text-brand-primary/80">{children}</em>
    ),
    ul: ({ children }) => (
        <ul className="list-disc list-inside space-y-1.5 my-3 text-sm text-brand-primary/75 font-satoshi leading-relaxed">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal list-inside space-y-1.5 my-3 text-sm text-brand-primary/75 font-satoshi leading-relaxed">
            {children}
        </ol>
    ),
    li: ({ children }) => (
        <li className="leading-relaxed">{children}</li>
    ),
    hr: () => (
        <hr className="my-6 border-brand-primary/8" />
    ),
    code: ({ children, className }) => {
        // Inline code (no language className)
        if (!className) {
            return (
                <code className="bg-brand-primary/5 text-brand-primary/80 px-1.5 py-0.5 rounded text-xs font-mono">
                    {children}
                </code>
            );
        }
        // Block code
        return (
            <code className={`${className} text-xs`}>{children}</code>
        );
    },
    pre: ({ children }) => (
        <pre className="bg-brand-primary/5 rounded-xl p-4 my-4 overflow-x-auto text-sm">
            {children}
        </pre>
    ),
    table: ({ children }) => (
        <div className="my-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
        <tr className="border-b border-brand-primary/5 last:border-0">
            {children}
        </tr>
    ),
    th: ({ children }) => (
        <th className="text-left px-4 py-2.5 text-xs font-satoshi font-bold text-brand-primary/50 uppercase tracking-wider bg-brand-primary/3 border-b border-brand-primary/10 first:rounded-tl-lg last:rounded-tr-lg">
            {children}
        </th>
    ),
    td: ({ children }) => (
        <td className="px-4 py-3 text-brand-primary/70 font-satoshi">
            {children}
        </td>
    ),
    blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-brand-primary/15 pl-4 my-4 text-sm text-brand-primary/60 italic">
            {children}
        </blockquote>
    ),
};

/* Callout-inner variant: slightly different styles for text inside callouts */
const calloutMdComponents: Components = {
    ...mdComponents,
    p: ({ children }) => (
        <p className="text-sm text-brand-primary/80 font-satoshi leading-relaxed my-1.5">
            {children}
        </p>
    ),
    ul: ({ children }) => (
        <ul className="list-disc list-inside space-y-1 my-2 text-sm text-brand-primary/80 font-satoshi leading-relaxed">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal list-inside space-y-1 my-2 text-sm text-brand-primary/80 font-satoshi leading-relaxed">
            {children}
        </ol>
    ),
    strong: ({ children }) => (
        <strong className="font-bold text-brand-primary/90">{children}</strong>
    ),
};

const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];

/* ═══════════════════════════════════════════════════════════════
   CALLOUT BLOCK COMPONENT
   ═══════════════════════════════════════════════════════════════ */

function CalloutBlock({
    type,
    title,
    body,
}: {
    type: string;
    title: string;
    body: string;
}) {
    const style = CALLOUT_TYPES[type] || CALLOUT_TYPES.info;

    return (
        <div className={`${style.bg} ${style.border} border rounded-xl p-4 my-4`}>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{style.icon}</span>
                <span className="text-xs font-satoshi font-bold text-brand-primary/60 uppercase tracking-wider">
                    {title || style.label}
                </span>
            </div>
            <div className="space-y-1">
                <ReactMarkdown
                    remarkPlugins={remarkPlugins}
                    rehypePlugins={rehypePlugins}
                    components={calloutMdComponents}
                >
                    {body}
                </ReactMarkdown>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   CONTENT BLOCK
   Splits content into callout / markdown segments and renders
   each with the appropriate component.
   ═══════════════════════════════════════════════════════════════ */

function ContentBlock({ content }: { content: string }) {
    const segments = useMemo(() => splitIntoSegments(content), [content]);

    return (
        <>
            {segments.map((seg, idx) => {
                if (seg.kind === "callout") {
                    return (
                        <CalloutBlock
                            key={idx}
                            type={seg.calloutType!}
                            title={seg.calloutTitle!}
                            body={seg.text}
                        />
                    );
                }
                return (
                    <ReactMarkdown
                        key={idx}
                        remarkPlugins={remarkPlugins}
                        rehypePlugins={rehypePlugins}
                        components={mdComponents}
                    >
                        {seg.text}
                    </ReactMarkdown>
                );
            })}
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════
   NOTE VIEWER (Main Export)
   ═══════════════════════════════════════════════════════════════ */

export function NoteViewer({ note }: NoteViewerProps) {
    const { content_json, word_count, average_read_time } = note;
    const sections = content_json?.sections || [];

    return (
        <div className="max-w-3xl">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-instrument tracking-tight text-brand-primary mb-3">
                    {content_json?.title || "Nota"}
                </h1>
                <div className="flex items-center gap-4 text-xs text-brand-primary/40 font-satoshi">
                    {word_count && (
                        <div className="flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>{word_count} palavras</span>
                        </div>
                    )}
                    {average_read_time && (
                        <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{average_read_time} min leitura</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Sections */}
            <div className="space-y-8">
                {sections.map((section, idx) => (
                    <section key={idx}>
                        <h2 className="text-lg font-satoshi font-bold text-brand-primary mb-3 pb-2 border-b border-brand-primary/8">
                            {section.section_title}
                        </h2>
                        <ContentBlock content={section.content} />
                    </section>
                ))}
            </div>
        </div>
    );
}
