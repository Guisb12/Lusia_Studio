"use client";

import React, {
    useState,
    useCallback,
    useMemo,
    useRef,
    useLayoutEffect,
    useEffect,
} from "react";
import { ArrowRight, CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { QuizInlineText } from "@/components/quiz/QuizText";
import { cn } from "@/lib/utils";
import { QuestionMd } from "@/components/quiz/QuestionMd";
import { Button } from "@/components/ui/button";
import { QuizInlineTextEditor, type QuizInlineTextEditorHandle } from "@/lib/tiptap/QuizInlineTextEditor";

interface MatchItem {
    id: string;
    text: string;
    label?: string;
}

function prunePairs(
    pairs: [string, string][],
    {
        removedLeftId,
        removedRightId,
    }: {
        removedLeftId?: string;
        removedRightId?: string;
    } = {},
) {
    return pairs.filter((pair) => {
        if (!Array.isArray(pair) || pair.length !== 2) return false;
        const [leftId, rightId] = pair.map(String);
        if (removedLeftId && leftId === removedLeftId) return false;
        if (removedRightId && rightId === removedRightId) return false;
        return true;
    });
}

/* ─── Student View — drag-to-connect (mirrors MatchingEditor) ─── */
export function MatchingStudent({
    leftItems,
    rightItems,
    answer,
    onAnswerChange,
}: {
    leftItems: MatchItem[];
    rightItems: MatchItem[];
    answer?: Record<string, string>;
    onAnswerChange?: (value: Record<string, string>) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const leftEls = useRef<Map<string, HTMLDivElement>>(new Map());
    const rightEls = useRef<Map<string, HTMLDivElement>>(new Map());
    const [ports, setPorts] = useState<Map<string, Pt>>(new Map());
    const [drag, setDrag] = useState<{ leftId: string; x: number; y: number } | null>(null);
    const [hoveredRight, setHoveredRight] = useState<string | null>(null);

    const pairs = useMemo(() => answer || {}, [answer]);

    const pairMap = useMemo(
        () => new Map(Object.entries(pairs).filter(([, v]) => Boolean(v))),
        [pairs],
    );
    const usedRightIds = useMemo(() => new Set(pairMap.values()), [pairMap]);

    /* ── Measure port positions ── */
    const measurePorts = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const cr = container.getBoundingClientRect();
        const next = new Map<string, Pt>();
        for (const [id, el] of leftEls.current) {
            const r = el.getBoundingClientRect();
            next.set(`L:${id}`, { x: r.right - cr.left, y: r.top + r.height / 2 - cr.top });
        }
        for (const [id, el] of rightEls.current) {
            const r = el.getBoundingClientRect();
            next.set(`R:${id}`, { x: r.left - cr.left, y: r.top + r.height / 2 - cr.top });
        }
        setPorts(next);
    }, []);

    useLayoutEffect(() => { measurePorts(); }, [leftItems, rightItems, measurePorts]);
    useEffect(() => {
        window.addEventListener("resize", measurePorts);
        return () => window.removeEventListener("resize", measurePorts);
    }, [measurePorts]);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const ro = new ResizeObserver(() => measurePorts());
        ro.observe(container);
        return () => ro.disconnect();
    }, [measurePorts]);

    useEffect(() => {
        if (!drag) return;
        const cancel = () => { setDrag(null); setHoveredRight(null); };
        window.addEventListener("pointerup", cancel);
        return () => window.removeEventListener("pointerup", cancel);
    }, [drag]);

    const relPos = (e: React.PointerEvent): Pt => {
        const cr = containerRef.current!.getBoundingClientRect();
        return { x: e.clientX - cr.left, y: e.clientY - cr.top };
    };

    const onPortDown = (e: React.PointerEvent, leftId: string) => {
        e.preventDefault();
        e.stopPropagation();
        containerRef.current?.setPointerCapture(e.pointerId);
        setDrag({ leftId, ...relPos(e) });
    };

    const onArrowDown = (e: React.PointerEvent, leftId: string) => {
        e.preventDefault();
        e.stopPropagation();
        containerRef.current?.setPointerCapture(e.pointerId);
        const next = { ...pairs };
        delete next[leftId];
        onAnswerChange?.(next);
        setDrag({ leftId, ...relPos(e) });
    };

    const onContainerMove = (e: React.PointerEvent) => {
        if (!drag) return;
        setDrag((prev) => (prev ? { ...prev, ...relPos(e) } : null));
        const SNAP = 24;
        let hovered: string | null = null;
        for (const [id, el] of rightEls.current) {
            const r = el.getBoundingClientRect();
            if (
                e.clientX >= r.left - SNAP && e.clientX <= r.right + SNAP &&
                e.clientY >= r.top - SNAP && e.clientY <= r.bottom + SNAP
            ) { hovered = id; break; }
        }
        setHoveredRight(hovered);
    };

    const onContainerUp = () => {
        if (drag && hoveredRight) {
            const next = { ...pairs };
            for (const [k, v] of Object.entries(next)) {
                if (v === hoveredRight) delete next[k];
            }
            next[drag.leftId] = hoveredRight;
            onAnswerChange?.(next);
        }
        setDrag(null);
        setHoveredRight(null);
    };

    return (
        <div
            ref={containerRef}
            className="relative select-none"
            style={{ touchAction: "none" }}
            onPointerMove={onContainerMove}
            onPointerUp={onContainerUp}
        >
            <p className="text-xs text-brand-primary/35 mb-3">
                Arrasta um item da esquerda para ligar ao par correto. Arrasta a seta para alterar.
            </p>

            <div className="grid grid-cols-2 gap-x-8 sm:gap-x-14 lg:gap-x-24">
                {/* Left column */}
                <div className="space-y-3">
                    {leftItems.map((left) => (
                        <div
                            key={left.id}
                            ref={(el) => { el ? leftEls.current.set(left.id, el) : leftEls.current.delete(left.id); }}
                            className={cn(
                                "relative flex items-center gap-2 rounded-xl px-3 py-3.5 text-white transition-all shadow-sm cursor-grab active:cursor-grabbing",
                                drag?.leftId === left.id ? "bg-brand-accent/50" : "bg-brand-accent",
                            )}
                            onPointerDown={(e) => onPortDown(e, left.id)}
                        >
                            {left.label && (
                                <div className="shrink-0 w-5 h-5 rounded-md bg-white/20 text-xs font-bold flex items-center justify-center">
                                    {left.label}
                                </div>
                            )}
                            <span className="flex-1 text-xs font-semibold leading-snug text-right">
                                <QuestionMd text={left.text} />
                            </span>
                        </div>
                    ))}
                </div>

                {/* Right column */}
                <div className="space-y-3">
                    {rightItems.map((right) => {
                        const isPaired = usedRightIds.has(right.id);
                        const isHovered = hoveredRight === right.id;
                        return (
                            <div
                                key={right.id}
                                ref={(el) => { el ? rightEls.current.set(right.id, el) : rightEls.current.delete(right.id); }}
                                className={cn(
                                    "relative flex items-center gap-2 rounded-xl px-3 py-3.5 text-white transition-all shadow-sm",
                                    isHovered
                                        ? "bg-brand-accent scale-[1.04] ring-2 ring-white ring-offset-1 ring-offset-brand-accent"
                                        : "bg-brand-accent",
                                    drag && !isHovered && !isPaired && "opacity-70",
                                )}
                            >
                                <span className="flex-1 text-xs font-semibold leading-snug">
                                    <QuestionMd text={right.text} />
                                </span>
                                {right.label && (
                                    <div className="shrink-0 w-5 h-5 rounded-md bg-white/20 text-xs font-bold flex items-center justify-center">
                                        {right.label}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SVG arrow overlay */}
            <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible text-brand-accent z-10"
                aria-hidden
            >
                {leftItems.map((left) => {
                    const rightId = pairMap.get(left.id);
                    if (!rightId) return null;
                    const from = ports.get(`L:${left.id}`);
                    const to = ports.get(`R:${rightId}`);
                    if (!from || !to) return null;
                    const d = curvePath(from, to);
                    return (
                        <g
                            key={left.id}
                            className="pointer-events-auto cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => onArrowDown(e, left.id)}
                        >
                            <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
                            <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </g>
                    );
                })}
                {drag && (() => {
                    const from = ports.get(`L:${drag.leftId}`);
                    if (!from) return null;
                    const to: Pt = { x: drag.x, y: drag.y };
                    const d = curvePath(from, to);
                    return (
                        <path
                            d={d}
                            fill="none"
                            stroke={hoveredRight ? "currentColor" : "rgba(100,116,139,0.45)"}
                            strokeWidth="2"
                            strokeDasharray={hoveredRight ? undefined : "7 4"}
                            strokeLinecap="round"
                        />
                    );
                })()}
            </svg>
        </div>
    );
}

/* ─── Editor View — drag-to-connect arrows ─── */

type Pt = { x: number; y: number };

function curvePath(from: Pt, to: Pt): string {
    const cx = Math.max(28, Math.abs(to.x - from.x) * 0.45);
    return `M ${from.x} ${from.y} C ${from.x + cx} ${from.y}, ${to.x - cx} ${to.y}, ${to.x} ${to.y}`;
}


export function MatchingEditor({
    leftItems,
    rightItems,
    correctPairs,
    onContentChange,
}: {
    leftItems: MatchItem[];
    rightItems: MatchItem[];
    correctPairs: [string, string][];
    onContentChange: (patch: Record<string, any>) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const leftEls = useRef<Map<string, HTMLDivElement>>(new Map());
    const rightEls = useRef<Map<string, HTMLDivElement>>(new Map());
    const leftEditorRefs = useRef<Record<string, QuizInlineTextEditorHandle | null>>({});
    const rightEditorRefs = useRef<Record<string, QuizInlineTextEditorHandle | null>>({});
    const [ports, setPorts] = useState<Map<string, Pt>>(new Map());
    const [drag, setDrag] = useState<{ leftId: string; x: number; y: number } | null>(null);
    const [hoveredRight, setHoveredRight] = useState<string | null>(null);

    const pairMap = useMemo(
        () =>
            new Map(
                correctPairs
                    .filter((p) => Array.isArray(p) && p.length === 2)
                    .map((p) => [String(p[0]), String(p[1])]),
            ),
        [correctPairs],
    );
    const usedRightIds = useMemo(() => new Set(pairMap.values()), [pairMap]);

    const updateLeftItem = useCallback(
        (index: number, patch: Partial<MatchItem>) => {
            const next = [...leftItems];
            next[index] = { ...next[index], ...patch };
            onContentChange({ left_items: next });
        },
        [leftItems, onContentChange],
    );

    const updateRightItem = useCallback(
        (index: number, patch: Partial<MatchItem>) => {
            const next = [...rightItems];
            next[index] = { ...next[index], ...patch };
            onContentChange({ right_items: next });
        },
        [rightItems, onContentChange],
    );

    const addLeftItem = useCallback(() => {
        onContentChange({
            left_items: [
                ...leftItems,
                { id: crypto.randomUUID(), text: `Item ${leftItems.length + 1}` },
            ],
        });
    }, [leftItems, onContentChange]);

    const addRightItem = useCallback(() => {
        onContentChange({
            right_items: [
                ...rightItems,
                { id: crypto.randomUUID(), text: `Correspondência ${rightItems.length + 1}` },
            ],
        });
    }, [rightItems, onContentChange]);

    const removeLeftItem = useCallback(
        (index: number) => {
            const removed = leftItems[index];
            if (!removed) return;
            onContentChange({
                left_items: leftItems.filter((_, i) => i !== index),
                correct_pairs: prunePairs(correctPairs, { removedLeftId: removed.id }),
            });
        },
        [correctPairs, leftItems, onContentChange],
    );

    const removeRightItem = useCallback(
        (index: number) => {
            const removed = rightItems[index];
            if (!removed) return;
            onContentChange({
                right_items: rightItems.filter((_, i) => i !== index),
                correct_pairs: prunePairs(correctPairs, { removedRightId: removed.id }),
            });
        },
        [correctPairs, onContentChange, rightItems],
    );

    /* ── Measure port positions ── */
    const measurePorts = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const cr = container.getBoundingClientRect();
        const next = new Map<string, Pt>();
        for (const [id, el] of leftEls.current) {
            const r = el.getBoundingClientRect();
            next.set(`L:${id}`, { x: r.right - cr.left, y: r.top + r.height / 2 - cr.top });
        }
        for (const [id, el] of rightEls.current) {
            const r = el.getBoundingClientRect();
            next.set(`R:${id}`, { x: r.left - cr.left, y: r.top + r.height / 2 - cr.top });
        }
        setPorts(next);
    }, []);

    useLayoutEffect(() => {
        measurePorts();
    }, [leftItems, rightItems, measurePorts]);

    // Re-measure on window resize AND whenever the container itself changes size
    // (sidebar toggle, panel collapse, etc.)
    useEffect(() => {
        window.addEventListener("resize", measurePorts);
        return () => window.removeEventListener("resize", measurePorts);
    }, [measurePorts]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const ro = new ResizeObserver(() => measurePorts());
        ro.observe(container);
        return () => ro.disconnect();
    }, [measurePorts]);

    /* ── Cancel drag if pointer leaves window ── */
    useEffect(() => {
        if (!drag) return;
        const cancel = () => { setDrag(null); setHoveredRight(null); };
        window.addEventListener("pointerup", cancel);
        return () => window.removeEventListener("pointerup", cancel);
    }, [drag]);

    /* ── Drag handlers ── */
    const relPos = (e: React.PointerEvent): Pt => {
        const cr = containerRef.current!.getBoundingClientRect();
        return { x: e.clientX - cr.left, y: e.clientY - cr.top };
    };

    const onPortDown = (e: React.PointerEvent, leftId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag({ leftId, ...relPos(e) });
    };

    const onArrowDown = (e: React.PointerEvent, leftId: string) => {
        e.preventDefault();
        e.stopPropagation();
        // Disconnect pair and start re-drag from that left item
        const newMap = new Map(pairMap);
        newMap.delete(leftId);
        onContentChange({ correct_pairs: Array.from(newMap.entries()) });
        setDrag({ leftId, ...relPos(e) });
    };

    const onContainerMove = (e: React.PointerEvent) => {
        if (!drag) return;
        setDrag((prev) => (prev ? { ...prev, ...relPos(e) } : null));
        // Detect which right card is under pointer — expand hit zone by 24px
        // so dropping near the port circle on the left edge also registers
        const SNAP = 24;
        let hovered: string | null = null;
        for (const [id, el] of rightEls.current) {
            const r = el.getBoundingClientRect();
            if (
                e.clientX >= r.left - SNAP && e.clientX <= r.right + SNAP &&
                e.clientY >= r.top - SNAP && e.clientY <= r.bottom + SNAP
            ) {
                hovered = id;
                break;
            }
        }
        setHoveredRight(hovered);
    };

    const onContainerUp = () => {
        if (drag && hoveredRight) {
            const newMap = new Map(pairMap);
            for (const [k, v] of newMap) {
                if (v === hoveredRight) newMap.delete(k);
            }
            newMap.set(drag.leftId, hoveredRight);
            onContentChange({ correct_pairs: Array.from(newMap.entries()) });
        }
        setDrag(null);
        setHoveredRight(null);
    };

    return (
        <div
            ref={containerRef}
            className="relative select-none"
            onPointerMove={onContainerMove}
            onPointerUp={onContainerUp}
        >
            {/* Hint */}
            <p className="text-xs text-brand-primary/35 mb-3">
                Arrasta um item da esquerda para ligar ao par correto. Arrasta a seta para alterar.
            </p>

            {/* Two card columns with gap in the middle for arrows */}
            <div className="grid grid-cols-2 gap-x-24">
                {/* Left column */}
                <div className="space-y-3">
                    {leftItems.map((left, index) => (
                        <div
                            key={left.id}
                            ref={(el) => {
                                el
                                    ? leftEls.current.set(left.id, el)
                                    : leftEls.current.delete(left.id);
                            }}
                            className={cn(
                                "group relative flex items-start gap-2 rounded-xl px-3 py-3.5 text-white transition-all shadow-sm cursor-grab active:cursor-grabbing",
                                drag?.leftId === left.id
                                    ? "bg-brand-accent/50"
                                    : "bg-brand-accent",
                            )}
                            onPointerDown={(e) => onPortDown(e, left.id)}
                        >
                            {left.label && (
                                <div className="shrink-0 mt-0.5 w-5 h-5 rounded-md bg-white/20 text-xs font-bold flex items-center justify-center">
                                    {left.label}
                                </div>
                            )}
                            <div className="flex-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                <QuizInlineTextEditor
                                    ref={(instance) => {
                                        leftEditorRefs.current[left.id] = instance;
                                    }}
                                    fieldId={`matching-left:${left.id}`}
                                    value={left.text}
                                    onChange={(value) => updateLeftItem(index, { text: value })}
                                    placeholder={`Item ${index + 1}`}
                                    caretClassName="caret-white"
                                    className="bg-transparent text-xs font-semibold leading-snug text-right text-white min-h-[1.25rem]"
                                />
                            </div>
                            <div
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => leftEditorRefs.current[left.id]?.insertInlineMath()}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/20"
                                    title="Adicionar matematica"
                                >
                                    <span className="text-[10px] font-semibold leading-none text-white/70">fx</span>
                                </button>
                                {leftItems.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeLeftItem(index)}
                                        className="p-1.5 rounded-lg transition-colors hover:bg-white/20"
                                    >
                                        <Trash2 className="h-3.5 w-3.5 text-white/70" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addLeftItem} className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar item
                    </Button>
                </div>

                {/* Right column */}
                <div className="space-y-3">
                    {rightItems.map((right, index) => {
                        const isPaired = usedRightIds.has(right.id);
                        const isHovered = hoveredRight === right.id;
                        return (
                            <div
                                key={right.id}
                                ref={(el) => {
                                    el
                                        ? rightEls.current.set(right.id, el)
                                        : rightEls.current.delete(right.id);
                                }}
                                className={cn(
                                    "group relative flex items-start gap-2 rounded-xl px-3 py-3.5 text-white transition-all shadow-sm",
                                    isHovered
                                        ? "bg-brand-accent scale-[1.04] ring-2 ring-white ring-offset-1 ring-offset-brand-accent"
                                        : "bg-brand-accent",
                                    drag && !isHovered && !isPaired && "opacity-70",
                                )}
                            >
                                <div className="flex-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                    <QuizInlineTextEditor
                                        ref={(instance) => {
                                            rightEditorRefs.current[right.id] = instance;
                                        }}
                                        fieldId={`matching-right:${right.id}`}
                                        value={right.text}
                                        onChange={(value) => updateRightItem(index, { text: value })}
                                        placeholder={`Correspondência ${index + 1}`}
                                        caretClassName="caret-white"
                                        className="bg-transparent text-xs font-semibold leading-snug text-white min-h-[1.25rem]"
                                    />
                                </div>
                                {right.label && (
                                    <div className="shrink-0 mt-0.5 w-5 h-5 rounded-md bg-white/20 text-xs font-bold flex items-center justify-center">
                                        {right.label}
                                    </div>
                                )}
                                <div
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => rightEditorRefs.current[right.id]?.insertInlineMath()}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/20"
                                        title="Adicionar matematica"
                                    >
                                        <span className="text-[10px] font-semibold leading-none text-white/70">fx</span>
                                    </button>
                                    {rightItems.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeRightItem(index)}
                                            className="p-1.5 rounded-lg transition-colors hover:bg-white/20"
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-white/70" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <Button type="button" variant="outline" size="sm" onClick={addRightItem} className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar correspondência
                    </Button>
                </div>
            </div>

            {/* ── SVG arrow overlay ── */}
            <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible text-brand-accent z-10"
                aria-hidden
            >
                {/* Established connections */}
                {leftItems.map((left) => {
                    const rightId = pairMap.get(left.id);
                    if (!rightId) return null;
                    const from = ports.get(`L:${left.id}`);
                    const to = ports.get(`R:${rightId}`);
                    if (!from || !to) return null;
                    const d = curvePath(from, to);
                    return (
                        <g
                            key={left.id}
                            className="pointer-events-auto cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => onArrowDown(e, left.id)}
                        >
                            {/* Wide invisible stroke — easier to grab */}
                            <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
                            {/* Visible bezier */}
                            <path
                                d={d}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </g>
                    );
                })}

                {/* Live drag line */}
                {drag && (() => {
                    const from = ports.get(`L:${drag.leftId}`);
                    if (!from) return null;
                    const to: Pt = { x: drag.x, y: drag.y };
                    const d = curvePath(from, to);
                    return (
                        <path
                            d={d}
                            fill="none"
                            stroke={hoveredRight ? "currentColor" : "rgba(100,116,139,0.45)"}
                            strokeWidth="2"
                            strokeDasharray={hoveredRight ? undefined : "7 4"}
                            strokeLinecap="round"
                        />
                    );
                })()}
            </svg>
        </div>
    );
}

/* ─── Review View ─── */
export function MatchingReview({
    leftItems,
    rightItems,
    answer,
    correctPairs,
}: {
    leftItems: MatchItem[];
    rightItems: MatchItem[];
    answer?: Record<string, string>;
    correctPairs: [string, string][];
}) {
    const pairMap = new Map(
        correctPairs
            .filter((p) => Array.isArray(p) && p.length === 2)
            .map((p) => [String(p[0]), String(p[1])]),
    );
    const rightMap = new Map(rightItems.map((r) => [r.id, r.text]));

    return (
        <div className="space-y-3">
            {leftItems.map((left) => {
                const selectedId = answer?.[left.id] || "";
                const correctId = pairMap.get(left.id) || "";
                const isCorrect = selectedId === correctId;
                const selectedText = selectedId ? rightMap.get(selectedId) || "?" : "—";
                const correctText = correctId ? rightMap.get(correctId) || "?" : "—";

                return (
                    <div
                        key={left.id}
                        className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center"
                    >
                        <div className="rounded-xl border-2 border-brand-primary/8 bg-white px-3 py-3 text-sm text-brand-primary/80">
                            <QuizInlineText text={left.text} />
                        </div>
                        <ArrowRight className="h-4 w-4 text-brand-primary/25 shrink-0" />
                        <div
                            className={cn(
                                "rounded-xl border-2 px-3 py-3 text-sm flex items-center gap-2",
                                selectedId
                                    ? isCorrect
                                        ? "border-emerald-400 bg-emerald-50/40 text-emerald-700"
                                        : "border-red-300 bg-red-50/30 text-red-600"
                                    : "border-brand-primary/10 bg-brand-primary/5 text-brand-primary/40",
                            )}
                        >
                            {selectedId && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                            {selectedId && !isCorrect && <XCircle className="h-4 w-4 shrink-0" />}
                            <span className="truncate">
                                <QuizInlineText text={selectedText} />
                                {!isCorrect && selectedId && (
                                    <span className="ml-2 text-emerald-600 text-xs">
                                        (correta: <QuizInlineText text={correctText} />)
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
