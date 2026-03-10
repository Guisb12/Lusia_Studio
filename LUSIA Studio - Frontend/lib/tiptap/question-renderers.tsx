"use client";

import React from "react";
import type { QuizQuestion } from "@/lib/quiz";
import { cn } from "@/lib/utils";
import { richTextToHtml, inlineRichToHtml } from "@/lib/tiptap/rich-text";

/* ------------------------------------------------------------------ */
/*  Obsidian-style image parser                                        */
/* ------------------------------------------------------------------ */

function parseImageStr(raw: string): { url: string; width?: number; align?: "left" | "center" | "right" } {
    const m = raw.match(/^!\[\[(.+?)(?:\|(\d+))?(?:\|(left|center|right))?\]\]$/);
    if (m) return { url: m[1], width: m[2] ? +m[2] : undefined, align: (m[3] as any) ?? undefined };
    return { url: raw };
}

function StaticImage({ imageStr }: { imageStr: string }) {
    const { url, width, align } = parseImageStr(imageStr);
    return (
        <div className={cn("flex", align === "center" ? "justify-center" : align === "right" ? "justify-end" : "")}>
            <img src={url} alt="" style={width ? { width } : undefined} className="rounded max-w-full" />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Inline markdown renderer — bold, italic, bold+italic               */
/* ------------------------------------------------------------------ */

/** Inline-only rich text (bold, italic, code, inline LaTeX) */
function Md({ text, className }: { text: string; className?: string }) {
    if (!text) return null;
    return <span className={className} dangerouslySetInnerHTML={{ __html: inlineRichToHtml(text) }} />;
}

/** Full rich text including block elements (tables, display LaTeX) */
function RichBlock({ text, className }: { text: string; className?: string }) {
    if (!text) return null;
    return <div className={className} dangerouslySetInnerHTML={{ __html: richTextToHtml(text) }} />;
}

/* ------------------------------------------------------------------ */
/*  Main dispatcher                                                    */
/* ------------------------------------------------------------------ */

export function QuestionContent({
    question,
    index,
}: {
    question: QuizQuestion;
    index: number;
}) {
    const c = question.content;
    const questionText: string = c?.question ?? "";

    const label = question.label ?? `${index}.`;
    const isHeadingLabel = question.type === "context_group" && label && !/^\d+[\.\)]?\s*$/.test(label);

    return (
        <div>
            {/* Heading-style label for context groups (Grupo I, Parte A, etc.) */}
            {isHeadingLabel && (
                <h3 className="text-center font-bold text-sm text-foreground mb-2 uppercase tracking-wide">
                    {label}
                </h3>
            )}

            <div className="flex items-start gap-3">
                {/* Number label */}
                {!isHeadingLabel && (
                    <span className="shrink-0 font-bold text-sm text-foreground leading-relaxed pt-px">
                        {label}
                    </span>
                )}

                {/* Question body */}
                <div className="flex-1 min-w-0 space-y-2">
                {/* Question text — fill_blank renders styled markers */}
                {question.type === "fill_blank" ? (
                    <FillBlankQuestionText text={questionText} />
                ) : (
                    <RichBlock text={questionText} className="text-sm text-foreground leading-relaxed" />
                )}

                {/* Optional image + caption */}
                {c?.image_url && (() => {
                    const imgAlign = parseImageStr(c.image_url).align ?? "left";
                    const alignClass = imgAlign === "center" ? "text-center" : imgAlign === "right" ? "text-right" : "text-left";
                    return (
                        <div className="space-y-1">
                            <StaticImage imageStr={c.image_url} />
                            {c.image_caption && (
                                <p className={`text-xs text-muted-foreground italic ${alignClass}`}>{c.image_caption}</p>
                            )}
                        </div>
                    );
                })()}

                {/* Type-specific body */}
                <TypeBody type={question.type} content={c} />
            </div>
        </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Type-specific body                                                 */
/* ------------------------------------------------------------------ */

function TypeBody({
    type,
    content,
}: {
    type: string;
    content: Record<string, any>;
}) {
    switch (type) {
        case "multiple_choice":
        case "multiple_response":
            return <OptionsBody content={content} />;
        case "true_false":
            return <TrueFalseBody />;
        case "fill_blank":
            return <FillBlankBody content={content} />;
        case "short_answer":
            return <ShortAnswerBody />;
        case "matching":
            return <MatchingBody content={content} />;
        case "ordering":
            return <OrderingBody content={content} />;
        case "open_extended":
            return <OpenExtendedBody />;
        case "context_group":
            return <ContextGroupBody />;
        default:
            return (
                <p className="text-xs text-muted-foreground italic">
                    Tipo não suportado: {type}
                </p>
            );
    }
}

/* ------------------------------------------------------------------ */
/*  Options body — MC and MR, with image grid support                  */
/* ------------------------------------------------------------------ */

function OptionsBody({ content }: { content: Record<string, any> }) {
    const options: { label: string; text: string | null; image_url: string | null }[] =
        content.options ?? [];
    const hasImages = options.some((opt) => opt.image_url);

    if (hasImages) {
        return (
            <div className="grid grid-cols-2 gap-3 pt-1">
                {options.map((opt, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5 text-sm text-foreground">
                        {opt.image_url && <StaticImage imageStr={opt.image_url} />}
                        <div className="flex items-start gap-1.5 text-center">
                            <span className="shrink-0 font-bold">({opt.label})</span>
                            {opt.text && <span><Md text={opt.text} /></span>}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-2.5 pt-1">
            {options.map((opt, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="shrink-0 font-bold">({opt.label})</span>
                    <span><Md text={opt.text ?? ""} /></span>
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  true_false — V / F options                                         */
/* ------------------------------------------------------------------ */

function TrueFalseBody() {
    return null;
}

/* ------------------------------------------------------------------ */
/*  fill_blank — underlines replacing {{blank}} markers                */
/* ------------------------------------------------------------------ */

function FillBlankQuestionText({ text }: { text: string }) {
    const parts = text.split(/\{\{blank\}\}/gi);
    if (parts.length <= 1) {
        return <div className="text-sm text-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: richTextToHtml(text) }} />;
    }
    return (
        <div className="text-sm text-foreground leading-relaxed">
            {parts.map((part, i) => (
                <React.Fragment key={i}>
                    <span dangerouslySetInnerHTML={{ __html: richTextToHtml(part) }} />
                    {i < parts.length - 1 && (
                        <span className="inline-block border-b-2 border-foreground/40 min-w-[3rem] text-center font-bold mx-0.5 align-baseline">
                            {String.fromCharCode(97 + i)})
                        </span>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

function FillBlankBody({ content }: { content: Record<string, any> }) {
    const question: string = content.question ?? "";
    const rawOptions = content.options ?? [];
    const options: string[][] = Array.isArray(rawOptions) && rawOptions.length > 0
        ? (Array.isArray(rawOptions[0])
            ? rawOptions.map((col: any) => (Array.isArray(col) ? col.map((o: any) => typeof o === "string" ? o : o?.text ?? String(o)) : [String(col)]))
            : [rawOptions.map((o: any) => (typeof o === "string" ? o : o?.text ?? String(o)))])
        : [];
    const blankCount = (question.match(/\{\{blank\}\}/gi) || []).length;

    if (blankCount === 0 && options.length === 0) return <AnswerLines count={1} />;
    if (options.length === 0) return <AnswerLines count={Math.max(blankCount, 1)} />;

    const cols = blankCount || options.length;

    return (
        <div
            className="grid border-t border-l border-foreground/20 text-sm"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
            {Array.from({ length: cols }).map((_, colIdx) => {
                const colOptions = options[colIdx] ?? [];
                const blankLabel = String.fromCharCode(97 + colIdx);
                return (
                    <div key={colIdx} className="border-r border-b border-foreground/20 p-2.5">
                        <span className="block text-center font-bold text-sm mb-2 pb-1.5 border-b border-foreground/8">
                            {blankLabel})
                        </span>
                        <div className="space-y-1.5">
                            {colOptions.map((opt, rowIdx) => (
                                <div key={rowIdx} className="flex items-start gap-1.5">
                                    <span className="shrink-0 font-bold text-sm">{rowIdx + 1}.</span>
                                    <span className="text-sm">{opt}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  short_answer — dotted answer lines                                 */
/* ------------------------------------------------------------------ */

function ShortAnswerBody() {
    return null;
}

/* ------------------------------------------------------------------ */
/*  matching — two-column layout                                       */
/* ------------------------------------------------------------------ */

function MatchingBody({ content }: { content: Record<string, any> }) {
    const left: { label: string; text: string; image_url?: string | null }[] = content.left ?? content.left_items ?? [];
    const right: { label: string; text: string; image_url?: string | null }[] = content.right ?? content.right_items ?? [];
    // If label === text for all items in a side, hide the text (label-only mode)
    const leftLabelOnly = left.length > 0 && left.every(item => !item.text || item.text === item.label);
    const rightLabelOnly = right.length > 0 && right.every(item => !item.text || item.text === item.label);

    return (
        <div className="grid grid-cols-2 border-t border-l border-foreground/20 text-sm mt-1">
            {/* Column A */}
            <div className="border-r border-b border-foreground/20 p-2.5">
                <span className="block text-center font-bold text-sm mb-2 pb-1.5 border-b border-foreground/8">
                    Coluna A
                </span>
                <div className="space-y-2">
                    {left.map((item, i) => (
                        <div key={`l-${i}`} className="flex items-start gap-2">
                            <span className="shrink-0 font-bold">{item.label}.</span>
                            {!leftLabelOnly && (
                                <div className="flex-1 min-w-0 space-y-1">
                                    {item.text && <span><Md text={item.text} /></span>}
                                    {item.image_url && <StaticImage imageStr={item.image_url} />}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {/* Column B */}
            <div className="border-r border-b border-foreground/20 p-2.5">
                <span className="block text-center font-bold text-sm mb-2 pb-1.5 border-b border-foreground/8">
                    Coluna B
                </span>
                <div className="space-y-2">
                    {right.map((item, i) => (
                        <div key={`r-${i}`} className="flex items-start gap-2">
                            <span className="shrink-0 font-bold">{item.label} –</span>
                            {!rightLabelOnly && (
                                <div className="flex-1 min-w-0 space-y-1">
                                    {item.text && <span><Md text={item.text} /></span>}
                                    {item.image_url && <StaticImage imageStr={item.image_url} />}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  ordering — items with bold letter labels                           */
/* ------------------------------------------------------------------ */

function OrderingBody({ content }: { content: Record<string, any> }) {
    const items: { label: string; text: string; image_url?: string | null }[] = content.items ?? content.options ?? [];
    const hasImages = items.some((item) => item.image_url);

    if (hasImages) {
        return (
            <div className="grid grid-cols-2 gap-3 pt-1">
                {items.map((item, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5 text-sm text-foreground">
                        {item.image_url && <StaticImage imageStr={item.image_url} />}
                        <div className="flex items-start gap-1.5 text-center">
                            <span className="shrink-0 font-bold">{item.label}.</span>
                            {item.text && <span><Md text={item.text} /></span>}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-2.5 pt-1">
            {items.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="shrink-0 font-bold">{item.label}.</span>
                    <div className="flex-1 min-w-0 space-y-1">
                        {item.text && <span><Md text={item.text} /></span>}
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  open_extended — 5 dotted answer lines                              */
/* ------------------------------------------------------------------ */

function OpenExtendedBody() {
    return null;
}

/* ------------------------------------------------------------------ */
/*  context_group — intro text block                                   */
/* ------------------------------------------------------------------ */

function ContextGroupBody() {
    // Context group text is now rendered in the shared question-text slot
    return null;
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function letter(i: number) {
    return String.fromCharCode(65 + i); // A, B, C, ...
}

function AnswerLines({ count }: { count: number }) {
    return (
        <div className="space-y-3 pt-1">
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    className="h-px border-b border-dashed border-foreground/30"
                />
            ))}
        </div>
    );
}
