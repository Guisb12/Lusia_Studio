"use client";

import React, { useEffect, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { GripVertical, Plus } from "lucide-react";
import { QuizQuestion } from "@/lib/quiz";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ─── Type label map ──────────────────────────────────────────────────────── */
const QUESTION_TYPE_LABELS: Record<string, string> = {
    multiple_choice: "Escolha Múltipla",
    true_false: "V / F",
    fill_blank: "Lacunas",
    matching: "Correspondência",
    short_answer: "Resp. Curta",
    multiple_response: "Múltipla Resp.",
    ordering: "Ordenação",
};

/* ─── Mini slide content per question type ───────────────────────────────── */
function QuestionMiniSlide({ question }: { question: QuizQuestion }) {
    const c = question.content;
    const questionText: string = c?.question ?? "";
    const type = question.type as string;

    return (
        <div className="w-full h-full flex flex-col gap-[5px]">
            {/* Question text */}
            <p className="text-[7px] leading-[1.3] font-semibold text-brand-primary/75 line-clamp-2 shrink-0">
                {questionText || <span className="text-brand-primary/25 italic">Sem enunciado</span>}
            </p>

            {/* Type-specific answer preview */}
            <div className="flex-1 min-h-0 overflow-hidden">

                {/* Multiple choice / Multiple response */}
                {(type === "multiple_choice" || type === "multiple_response") && Array.isArray(c?.options) && (
                    <div className="space-y-[3px]">
                        {(c.options as { id?: string; text?: string; is_correct?: boolean }[])
                            .slice(0, 4)
                            .map((opt, i) => (
                                <div key={opt.id ?? i} className="flex items-center gap-[4px]">
                                    <div
                                        className={cn(
                                            "shrink-0 border",
                                            type === "multiple_response"
                                                ? "w-[6px] h-[6px] rounded-[1.5px]"
                                                : "w-[6px] h-[6px] rounded-full",
                                            opt.is_correct
                                                ? "bg-emerald-400 border-emerald-400"
                                                : "bg-white border-brand-primary/20",
                                        )}
                                    />
                                    <span className="text-[6px] leading-none text-brand-primary/50 truncate">
                                        {opt.text}
                                    </span>
                                </div>
                            ))}
                        {c.options.length > 4 && (
                            <span className="text-[5px] text-brand-primary/25">
                                +{c.options.length - 4} mais
                            </span>
                        )}
                    </div>
                )}

                {/* True / False */}
                {type === "true_false" && (
                    <div className="flex gap-[4px]">
                        <div
                            className={cn(
                                "px-[5px] py-[2px] rounded-[3px] text-[6px] font-bold",
                                c?.answer === true
                                    ? "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300"
                                    : "bg-brand-primary/5 text-brand-primary/35",
                            )}
                        >
                            V
                        </div>
                        <div
                            className={cn(
                                "px-[5px] py-[2px] rounded-[3px] text-[6px] font-bold",
                                c?.answer === false
                                    ? "bg-red-100 text-red-500 ring-1 ring-red-300"
                                    : "bg-brand-primary/5 text-brand-primary/35",
                            )}
                        >
                            F
                        </div>
                    </div>
                )}

                {/* Fill in the blank — show blank chips */}
                {type === "fill_blank" && Array.isArray(c?.options) && (
                    <div className="flex flex-wrap gap-[3px]">
                        {(c.options as { id?: string; text?: string }[]).slice(0, 6).map((opt, i) => (
                            <span
                                key={opt.id ?? i}
                                className="inline-flex items-center px-[4px] py-[1px] rounded-[3px] text-[5.5px] leading-none bg-brand-accent/10 text-brand-accent/70 border border-brand-accent/20"
                            >
                                {opt.text}
                            </span>
                        ))}
                    </div>
                )}

                {/* Short answer */}
                {type === "short_answer" && (
                    <div className="mt-[2px] rounded-[3px] border border-brand-primary/15 bg-brand-primary/3 h-[10px] w-full flex items-center px-[4px]">
                        {Array.isArray(c?.accepted_answers) && c.accepted_answers[0] ? (
                            <span className="text-[5.5px] text-brand-primary/40 truncate">
                                {c.accepted_answers[0]}
                            </span>
                        ) : (
                            <div className="h-[1px] w-8 bg-brand-primary/15 rounded" />
                        )}
                    </div>
                )}

                {/* Ordering */}
                {type === "ordering" && Array.isArray(c?.items) && (
                    <div className="space-y-[3px]">
                        {(c.items as { id?: string; text?: string }[]).slice(0, 3).map((item, i) => (
                            <div key={item.id ?? i} className="flex items-center gap-[3px]">
                                <span className="text-[5.5px] font-bold text-brand-primary/30 w-[7px] shrink-0 text-right">
                                    {i + 1}.
                                </span>
                                <div className="flex-1 h-[6px] rounded-[2px] bg-brand-primary/5 border border-brand-primary/8 overflow-hidden flex items-center px-[3px]">
                                    <span className="text-[5px] text-brand-primary/40 truncate">{item.text}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Matching */}
                {type === "matching" && Array.isArray(c?.left_items) && (
                    <div className="space-y-[3px]">
                        {(c.left_items as { id?: string; text?: string }[]).slice(0, 3).map((item, i) => (
                            <div key={item.id ?? i} className="flex items-center gap-[3px]">
                                <div className="flex-1 h-[6px] rounded-[2px] bg-brand-primary/5 border border-brand-primary/8 overflow-hidden flex items-center px-[3px]">
                                    <span className="text-[5px] text-brand-primary/40 truncate">{item.text}</span>
                                </div>
                                <span className="text-[5.5px] text-brand-primary/20 shrink-0">→</span>
                                <div className="flex-1 h-[6px] rounded-[2px] bg-brand-primary/5 border border-brand-primary/8" />
                            </div>
                        ))}
                    </div>
                )}

            </div>

            {/* Image indicator */}
            {c?.image_url && (
                <div className="shrink-0 h-[10px] w-full rounded-[2px] bg-brand-primary/5 border border-brand-primary/10 flex items-center justify-center">
                    <span className="text-[5px] text-brand-primary/25 leading-none">foto</span>
                </div>
            )}
        </div>
    );
}

/* ─── Sidebar ─────────────────────────────────────────────────────────────── */
interface QuestionSidebarProps {
    questions: QuizQuestion[];
    questionIds: string[];
    currentIndex: number;
    onNavigate: (index: number) => void;
    onReorder: (newIds: string[]) => void;
    onAdd?: () => void;
}

export function QuestionSidebar({
    questions,
    questionIds,
    currentIndex,
    onNavigate,
    onReorder,
    onAdd,
}: QuestionSidebarProps) {
    const activeRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showTopMask, setShowTopMask] = useState(false);
    const [showBottomMask, setShowBottomMask] = useState(false);

    useEffect(() => {
        if (activeRef.current) {
            activeRef.current.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
    }, [currentIndex]);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const update = () => {
            setShowTopMask(el.scrollTop > 4);
            setShowBottomMask(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
        };
        // defer one frame so flex layout has fully settled before measuring
        const raf = requestAnimationFrame(update);
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, [questions.length]);

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    return (
        <div className="w-[200px] shrink-0 bg-brand-background/60 flex flex-col h-full">
            {/* Header */}
            <div className="px-3 py-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-brand-primary/40 uppercase tracking-wider">
                    Perguntas
                </span>
                <span className="text-[10px] text-brand-primary/30">
                    {questions.length}
                </span>
            </div>

            {/* List */}
            <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2.5"
                style={{
                    maskImage:
                        showTopMask && showBottomMask
                            ? "linear-gradient(to bottom, transparent 0px, black 28px, black calc(100% - 28px), transparent 100%)"
                            : showTopMask
                              ? "linear-gradient(to bottom, transparent 0px, black 28px, black 100%)"
                              : showBottomMask
                                ? "linear-gradient(to bottom, black 0px, black calc(100% - 28px), transparent 100%)"
                                : undefined,
                    WebkitMaskImage:
                        showTopMask && showBottomMask
                            ? "linear-gradient(to bottom, transparent 0px, black 28px, black calc(100% - 28px), transparent 100%)"
                            : showTopMask
                              ? "linear-gradient(to bottom, transparent 0px, black 28px, black 100%)"
                              : showBottomMask
                                ? "linear-gradient(to bottom, black 0px, black calc(100% - 28px), transparent 100%)"
                                : undefined,
                }}
            >
                <Reorder.Group
                    axis="y"
                    values={questionIds}
                    onReorder={onReorder}
                    className="space-y-2"
                >
                    {questionIds.map((id, index) => {
                        const question = questionMap.get(id);
                        if (!question) return null;
                        const isActive = index === currentIndex;

                        return (
                            <Reorder.Item
                                key={id}
                                value={id}
                                whileDrag={{
                                    scale: 1.03,
                                    boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
                                    zIndex: 50,
                                }}
                                className="list-none"
                            >
                                <div
                                    ref={isActive ? activeRef : undefined}
                                    onClick={() => onNavigate(index)}
                                    className="group cursor-pointer"
                                >
                                    {/* Number + type row */}
                                    <div className="flex items-center gap-1.5 mb-1 px-0.5">
                                        <span
                                            className={cn(
                                                "text-[10px] font-bold tabular-nums leading-none",
                                                isActive
                                                    ? "text-brand-accent"
                                                    : "text-brand-primary/30",
                                            )}
                                        >
                                            {index + 1}
                                        </span>
                                        <span
                                            className={cn(
                                                "text-[9px] leading-none truncate",
                                                isActive
                                                    ? "text-brand-accent/60"
                                                    : "text-brand-primary/25",
                                            )}
                                        >
                                            {QUESTION_TYPE_LABELS[question.type] || question.type}
                                        </span>
                                        {/* Drag handle */}
                                        <GripVertical className="h-3 w-3 text-brand-primary/15 ml-auto shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>

                                    {/* Slide thumbnail */}
                                    <div
                                        className={cn(
                                            "rounded-xl border-2 bg-white overflow-hidden transition-all duration-200",
                                            "h-[90px] p-[8px]",
                                            isActive
                                                ? "border-brand-accent shadow-[0_0_0_3px_oklch(var(--brand-accent)/0.12)] shadow-brand-accent/10"
                                                : "border-brand-primary/10 hover:border-brand-primary/25 hover:shadow-sm",
                                        )}
                                    >
                                        <QuestionMiniSlide question={question} />
                                    </div>
                                </div>
                            </Reorder.Item>
                        );
                    })}
                </Reorder.Group>
            </div>

            {/* Add button */}
            {onAdd && (
                <div className="p-2.5">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onAdd}
                        className="w-full gap-1.5 text-xs h-8"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar
                    </Button>
                </div>
            )}
        </div>
    );
}

/* ─── Mobile horizontal strip ─────────────────────────────────────────────── */
export function QuestionStripMobile({
    questions,
    currentIndex,
    onNavigate,
}: {
    questions: QuizQuestion[];
    currentIndex: number;
    onNavigate: (index: number) => void;
}) {
    const stripRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!stripRef.current) return;
        const active = stripRef.current.children[currentIndex] as HTMLElement;
        if (active) {
            active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
    }, [currentIndex]);

    return (
        <div
            ref={stripRef}
            className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-4 py-2 border-b border-brand-primary/5"
        >
            {questions.map((q, i) => {
                const isActive = i === currentIndex;
                return (
                    <button
                        key={q.id}
                        type="button"
                        onClick={() => onNavigate(i)}
                        className={cn(
                            "shrink-0 rounded-full transition-all duration-200 text-[10px] font-bold",
                            isActive
                                ? "w-7 h-7 bg-brand-accent text-white shadow-sm"
                                : "w-6 h-6 bg-brand-primary/10 text-brand-primary/40 hover:bg-brand-primary/15",
                        )}
                    >
                        {i + 1}
                    </button>
                );
            })}
        </div>
    );
}
