"use client";

import React, { useState, useEffect } from "react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { ArrowUp, GripVertical, MessageCircle } from "lucide-react";
import Image from "next/image";
import type { BlueprintBlock } from "@/lib/worksheet-generation";

const TYPE_LABELS: Record<string, string> = {
    multiple_choice: "Escolha Múltipla",
    true_false: "Verdadeiro/Falso",
    fill_blank: "Preencher Lacunas",
    matching: "Associação",
    short_answer: "Resposta Curta",
    multiple_response: "Resposta Múltipla",
    ordering: "Ordenação",
    open_extended: "Resposta Aberta",
    context_group: "Grupo Contextual",
};

const TYPE_COLORS: Record<string, string> = {
    multiple_choice: "#3B82F6",
    true_false: "#10B981",
    fill_blank: "#F59E0B",
    matching: "#8B5CF6",
    short_answer: "#EC4899",
    multiple_response: "#6366F1",
    ordering: "#14B8A6",
    open_extended: "#F97316",
    context_group: "#64748B",
};

/* ── Reusable comment button + floating input ──── */

function CommentButton({
    onComment,
    show,
}: {
    onComment: (comment: string) => void;
    show: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");

    const handleSubmit = () => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onComment(trimmed);
        setText("");
        setOpen(false);
    };

    const visible = show || open;

    return (
        <div onClick={(e) => e.stopPropagation()}>
            {open && (
                <div
                    className="absolute right-0 w-72"
                    style={{ bottom: "calc(100% + 8px)" }}
                >
                    <div className="flex items-center gap-2.5 bg-white rounded-full pl-2 pr-2.5 py-2 shadow-lg border border-brand-primary/[0.08]">
                        <div className="shrink-0 flex items-center justify-center">
                            <Image
                                src="/lusia-symbol.png"
                                alt="Lusia"
                                width={22}
                                height={22}
                                className="object-contain"
                            />
                        </div>
                        <input
                            autoFocus
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSubmit();
                                if (e.key === "Escape") setOpen(false);
                            }}
                            placeholder="Pedir alterações..."
                            className="flex-1 bg-transparent text-[13.5px] text-brand-primary placeholder:text-brand-primary/30 outline-none"
                        />
                        <button
                            onClick={handleSubmit}
                            className={cn(
                                "h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all",
                                text.trim()
                                    ? "bg-brand-primary text-white hover:bg-brand-primary/90"
                                    : "bg-brand-primary/[0.06] text-brand-primary/25",
                            )}
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}

            <button
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    "h-9 w-9 rounded-full bg-white flex items-center justify-center",
                    "shadow-sm border border-brand-primary/[0.08]",
                    "transition-opacity duration-200",
                    visible ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
            >
                <MessageCircle
                    className="h-4 w-4"
                    style={{
                        color: open
                            ? "#0052d4"
                            : "var(--brand-primary, #15316b)",
                    }}
                />
            </button>
        </div>
    );
}

/* ── Meta row (shared between regular and child cards) ── */

function BlockMeta({ block }: { block: BlueprintBlock }) {
    const typeColor = TYPE_COLORS[block.type] || "#6B7280";
    const typeLabel = TYPE_LABELS[block.type] || block.type;
    const isAi = block.source === "ai_generated";

    return (
        <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-[11px] text-brand-primary/40">
                <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: typeColor }}
                />
                {typeLabel}
            </span>
            <span className="text-brand-primary/20 text-[10px] leading-none">
                •
            </span>
            {isAi ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                    <Image
                        src="/lusia-symbol.png"
                        alt=""
                        width={11}
                        height={11}
                        className="object-contain opacity-70"
                    />
                    <span
                        style={{
                            background:
                                "linear-gradient(90deg, #89f7fe 0%, #66a6ff 50%, #0052d4 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                        }}
                    >
                        Gerada por IA
                    </span>
                </span>
            ) : (
                <span className="text-[11px] font-medium text-emerald-500">
                    Banco de questões
                </span>
            )}
            {block.difficulty && block.difficulty !== "mixed" && (
                <>
                    <span className="text-brand-primary/20 text-[10px] leading-none">
                        •
                    </span>
                    <span className="text-[10px] text-brand-primary/35 font-medium">
                        {block.difficulty}
                    </span>
                </>
            )}
        </div>
    );
}

/* ── Sortable child card (used inside context_group) ── */

function SortableChildCard({
    block,
    index,
    onComment,
    isNew,
}: {
    block: BlueprintBlock;
    index: number;
    onComment: (comment: string) => void;
    isNew?: boolean;
}) {
    const [isHovered, setIsHovered] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: block.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group/child relative select-none",
                isDragging && "opacity-40",
                isNew && "animate-in fade-in slide-in-from-bottom-2 duration-300",
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className={cn(
                    "relative bg-white rounded-2xl border cursor-default",
                    "transition-all duration-500",
                    isDragging && "shadow-xl",
                    isHovered
                        ? "border-brand-primary/[0.14] shadow-sm"
                        : "border-brand-primary/[0.08]",
                )}
            >
                {/* Drag handle */}
                <button
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 inset-y-0 w-7 flex items-center justify-center opacity-0 group-hover/child:opacity-100 transition-opacity cursor-grab active:cursor-grabbing rounded-l-2xl hover:bg-brand-primary/[0.04] outline-none"
                >
                    <GripVertical className="h-3.5 w-3.5 text-brand-primary/25" />
                </button>

                <div className="pl-6 pr-8 py-3.5 space-y-2.5">
                    {/* Order + goal */}
                    <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-mono text-brand-primary/25 tabular-nums shrink-0 w-4 text-right select-none">
                            {index + 1}.
                        </span>
                        <p className="text-[13.5px] font-medium text-brand-primary leading-snug">
                            {block.goal}
                        </p>
                    </div>

                    {/* Meta row */}
                    <div className="ml-6">
                        <BlockMeta block={block} />
                    </div>
                </div>
            </div>

            {/* Comment button */}
            <div className="absolute -right-5 top-1/2 -translate-y-1/2 z-10">
                <CommentButton onComment={onComment} show={isHovered} />
            </div>
        </div>
    );
}

/* ── Main sortable block card ──────────────────── */

interface BlueprintBlockCardProps {
    block: BlueprintBlock;
    index: number;
    onComment: (comment: string) => void;
    /** For context_group blocks: forward child comments with their block IDs */
    onChildComment?: (childBlockId: string, comment: string) => void;
    /** For context_group blocks: called when children are reordered */
    onChildReorder?: (newChildren: BlueprintBlock[]) => void;
    /** Block just appeared — fade-in animation */
    isNew?: boolean;
    /** Block was updated — brief blue border glow */
    isHighlighted?: boolean;
    /** IDs of blocks that just appeared (passed to children) */
    newBlockIds?: Set<string>;
}

export function BlueprintBlockCard({
    block,
    index,
    onComment,
    onChildComment,
    onChildReorder,
    isNew,
    isHighlighted,
    newBlockIds,
}: BlueprintBlockCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [glowing, setGlowing] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: block.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Sensors for nested child DndContext (always created, only used for context_groups)
    const childSensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    // Auto-clear highlight glow after 1.5s
    useEffect(() => {
        if (isHighlighted) {
            setGlowing(true);
            const t = setTimeout(() => setGlowing(false), 1500);
            return () => clearTimeout(t);
        }
        setGlowing(false);
    }, [isHighlighted]);

    // ── Context group: render as section container ──────────
    if (block.type === "context_group") {
        const childBlocks = block.children || [];

        const handleChildDragEnd = (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;

            const oldIndex = childBlocks.findIndex(
                (c) => c.id === active.id,
            );
            const newIndex = childBlocks.findIndex(
                (c) => c.id === over.id,
            );
            if (oldIndex === -1 || newIndex === -1) return;

            onChildReorder?.(arrayMove(childBlocks, oldIndex, newIndex));
        };

        return (
            <div
                ref={setNodeRef}
                style={style}
                className={cn(
                    "group relative select-none",
                    isNew &&
                        "animate-in fade-in slide-in-from-bottom-2 duration-300",
                    isDragging && "opacity-40",
                )}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Group header */}
                <div className="flex items-center gap-2 pt-4 pb-2 px-1">
                    <button
                        {...attributes}
                        {...listeners}
                        onClick={(e) => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing outline-none"
                    >
                        <GripVertical className="h-3.5 w-3.5 text-brand-primary/25" />
                    </button>
                    <span className="text-xs font-semibold text-brand-primary/40 uppercase tracking-wide">
                        {block.goal ||
                            block.group_label ||
                            `Grupo ${index + 1}`}
                    </span>
                </div>

                {/* Children — nested sortable context */}
                {childBlocks.length > 0 && (
                    <DndContext
                        sensors={childSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleChildDragEnd}
                    >
                        <SortableContext
                            items={childBlocks.map((c) => c.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2.5 ml-3 pl-3 border-l-2 border-brand-primary/[0.06]">
                                {childBlocks.map((child, i) => (
                                    <SortableChildCard
                                        key={child.id}
                                        block={child}
                                        index={i}
                                        onComment={(comment) =>
                                            onChildComment?.(
                                                child.id,
                                                comment,
                                            )
                                        }
                                        isNew={newBlockIds?.has(child.id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}

                {/* Comment button on group header */}
                <div className="absolute -right-5 top-4 z-10">
                    <CommentButton onComment={onComment} show={isHovered} />
                </div>
            </div>
        );
    }

    // ── Regular block: card rendering ──────────────────────
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative select-none",
                isNew &&
                    "animate-in fade-in slide-in-from-bottom-2 duration-300",
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Card */}
            <div
                className={cn(
                    "relative bg-white rounded-2xl border cursor-default",
                    "transition-all duration-500",
                    isDragging && "opacity-40 shadow-xl",
                    glowing
                        ? "border-blue-400/40 shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                        : isHovered
                          ? "border-brand-primary/[0.14] shadow-sm"
                          : "border-brand-primary/[0.08]",
                )}
            >
                {/* Drag handle */}
                <button
                    {...attributes}
                    {...listeners}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 inset-y-0 w-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing rounded-l-2xl hover:bg-brand-primary/[0.04] outline-none"
                >
                    <GripVertical className="h-3.5 w-3.5 text-brand-primary/25" />
                </button>

                <div className="pl-6 pr-8 py-4 space-y-3">
                    {/* Order + goal */}
                    <div className="flex items-baseline gap-2.5">
                        <span className="text-[11px] font-mono text-brand-primary/25 tabular-nums shrink-0 w-4 text-right select-none">
                            {index + 1}.
                        </span>
                        <p className="text-[13.5px] font-medium text-brand-primary leading-snug">
                            {block.goal}
                        </p>
                    </div>

                    {/* Meta row */}
                    <div className="ml-[26px]">
                        <BlockMeta block={block} />
                    </div>
                </div>
            </div>

            {/* Comment button */}
            <div
                className="absolute -right-5 top-1/2 -translate-y-1/2 z-10"
                onClick={(e) => e.stopPropagation()}
            >
                <CommentButton onComment={onComment} show={isHovered} />
            </div>
        </div>
    );
}
