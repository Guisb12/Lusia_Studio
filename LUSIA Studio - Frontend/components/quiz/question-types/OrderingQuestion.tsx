"use client";

import React, { useMemo } from "react";
import { Reorder, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, GripVertical, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageCropperDialog, useImageCropper } from "@/components/quiz/ImageCropperDialog";

interface OrderItem {
    id: string;
    text: string;
    label?: string;
    image_url?: string | null;
}

/* ─── Lightbox ─── */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <img
                src={url}
                alt=""
                className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/* ─── Student View ─── */
export function OrderingStudent({
    items,
    answer,
    onAnswerChange,
}: {
    items: OrderItem[];
    answer?: string[];
    onAnswerChange?: (value: string[]) => void;
}) {
    const currentOrder = useMemo(() => {
        if (Array.isArray(answer) && answer.length === items.length) {
            return answer;
        }
        return items.map((item) => item.id);
    }, [answer, items]);

    const itemMap = useMemo(
        () => new Map(items.map((item) => [item.id, item])),
        [items],
    );

    const moveItem = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= currentOrder.length) return;
        const next = [...currentOrder];
        [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
        onAnswerChange?.(next);
    };

    return (
        <Reorder.Group
            axis="y"
            values={currentOrder}
            onReorder={(newOrder) => onAnswerChange?.(newOrder)}
            className="space-y-2"
        >
            {currentOrder.map((itemId, index) => {
                const item = itemMap.get(itemId);
                if (!item) return null;
                return (
                    <Reorder.Item
                        key={itemId}
                        value={itemId}
                        whileDrag={{
                            scale: 1.02,
                            boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                            cursor: "grabbing",
                        }}
                        className="flex items-center gap-2 rounded-xl border-2 border-brand-primary/8 bg-white px-4 py-3.5 cursor-grab active:cursor-grabbing"
                    >
                        <GripVertical className="h-4 w-4 text-brand-primary/20 shrink-0" />
                        <motion.div
                            layout
                            className="shrink-0 w-8 h-8 rounded-lg bg-brand-primary/5 flex items-center justify-center"
                        >
                            <span className="text-xs font-bold text-brand-primary/40">
                                {index + 1}
                            </span>
                        </motion.div>
                        <span className="text-sm text-brand-primary/80 flex-1">
                            {item.text}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                            <button
                                type="button"
                                disabled={index === 0}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    moveItem(index, index - 1);
                                }}
                                className={cn(
                                    "p-1.5 rounded-lg transition-colors",
                                    index === 0
                                        ? "text-brand-primary/15"
                                        : "text-brand-primary/40 hover:bg-brand-primary/5",
                                )}
                            >
                                <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                disabled={index === currentOrder.length - 1}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    moveItem(index, index + 1);
                                }}
                                className={cn(
                                    "p-1.5 rounded-lg transition-colors",
                                    index === currentOrder.length - 1
                                        ? "text-brand-primary/15"
                                        : "text-brand-primary/40 hover:bg-brand-primary/5",
                                )}
                            >
                                <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </Reorder.Item>
                );
            })}
        </Reorder.Group>
    );
}

/* ─── Editor View ─── */
export function OrderingEditor({
    items,
    correctOrder,
    onContentChange,
    onImageUpload,
}: {
    items: OrderItem[];
    correctOrder: string[];
    onContentChange: (patch: Record<string, any>) => void;
    onImageUpload?: (file: File) => Promise<string>;
}) {
    const { cropperState, openCropper, closeCropper } = useImageCropper();
    const [lightbox, setLightbox] = React.useState<string | null>(null);

    const displayOrder = useMemo(() => {
        if (correctOrder.length > 0) return correctOrder;
        return items.map((i) => i.id);
    }, [correctOrder, items]);

    const itemMap = useMemo(
        () => new Map(items.map((item) => [item.id, item])),
        [items],
    );

    /* compute backend-compatible solution (label array) from a UUID order */
    const toSolution = (uuidOrder: string[]) =>
        uuidOrder.map((id) => itemMap.get(id)?.label).filter(Boolean) as string[];

    const updateItem = (itemIndex: number, patch: Partial<OrderItem>) => {
        const next = [...items];
        next[itemIndex] = { ...next[itemIndex], ...patch };
        onContentChange({ items: next });
    };

    const handleImageSelect = (itemIndex: number, file: File) => {
        if (!onImageUpload) return;
        openCropper(file, async (blob) => {
            const url = await onImageUpload(new File([blob], file.name, { type: blob.type }));
            updateItem(itemIndex, { image_url: url });
        });
    };

    return (
        <>
            <div className="space-y-3">
                <p className="text-xs text-brand-primary/35">
                    Arrasta para definir a ordem correta. Clica no texto para editar.
                </p>

                <Reorder.Group
                    axis="y"
                    values={displayOrder}
                    onReorder={(newOrder) =>
                        onContentChange({ correct_order: newOrder, solution: toSolution(newOrder) })
                    }
                    className="space-y-2.5"
                >
                    {displayOrder.map((id, index) => {
                        const item = itemMap.get(id);
                        if (!item) return null;
                        const itemIndex = items.findIndex((i) => i.id === id);

                        return (
                            <Reorder.Item
                                key={id}
                                value={id}
                                whileDrag={{
                                    scale: 1.02,
                                    boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                                    cursor: "grabbing",
                                    zIndex: 50,
                                }}
                                className="list-none"
                            >
                                <div className="group flex items-start gap-3 p-4 rounded-xl bg-brand-accent border-2 border-brand-accent shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing">
                                    <GripVertical className="h-4 w-4 text-white/40 shrink-0 mt-0.5" />
                                    <div className="shrink-0 mt-0.5 w-6 h-6 rounded-lg bg-white/20 text-white text-xs font-bold flex items-center justify-center">
                                        {item.label ?? LETTERS[index] ?? index + 1}
                                    </div>

                                    {/* Thumbnail */}
                                    {item.image_url && (
                                        <div className="relative shrink-0 group/thumb" onClick={(e) => e.stopPropagation()}>
                                            <img
                                                src={item.image_url}
                                                alt=""
                                                className="w-12 h-12 rounded-lg object-cover cursor-zoom-in ring-1 ring-black/5"
                                                onClick={() => setLightbox(item.image_url!)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => updateItem(itemIndex, { image_url: null })}
                                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-sm"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}

                                    <textarea
                                        value={item.text}
                                        onChange={(e) => updateItem(itemIndex, { text: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder={`Item ${index + 1}`}
                                        rows={1}
                                        className="flex-1 bg-transparent outline-none text-sm font-semibold text-white placeholder:text-white/50 resize-none overflow-hidden leading-snug pt-0.5"
                                    />

                                    <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                                    >
                                        {onImageUpload && !item.image_url && (
                                            <label className="cursor-pointer p-1.5 rounded-lg transition-colors hover:bg-white/20">
                                                <ImagePlus className="h-3.5 w-3.5 text-white/60" />
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0];
                                                        if (f) handleImageSelect(itemIndex, f);
                                                        e.currentTarget.value = "";
                                                    }}
                                                />
                                            </label>
                                        )}
                                        {items.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextItems = items.filter((_, i) => i !== itemIndex);
                                                    const nextOrder = displayOrder.filter((orderId) => orderId !== id);
                                                    onContentChange({
                                                        items: nextItems,
                                                        correct_order: nextOrder,
                                                        solution: toSolution(nextOrder),
                                                    });
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                                            >
                                                <Trash2 className="h-3.5 w-3.5 text-white/70" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </Reorder.Item>
                        );
                    })}
                </Reorder.Group>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        const newLabel = LETTERS[items.length] ?? String(items.length + 1);
                        const newItem: OrderItem = { id: crypto.randomUUID(), text: "", label: newLabel, image_url: null };
                        const nextItems = [...items, newItem];
                        const nextOrder = [...displayOrder, newItem.id];
                        onContentChange({
                            items: nextItems,
                            correct_order: nextOrder,
                            solution: toSolution(nextOrder),
                        });
                    }}
                    className="gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar item
                </Button>
            </div>

            <ImageCropperDialog
                open={cropperState.open}
                onClose={closeCropper}
                imageSrc={cropperState.imageSrc}
                aspect={cropperState.aspect}
                onCropComplete={cropperState.onCrop}
            />
            {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
        </>
    );
}

/* ─── Review View ─── */
export function OrderingReview({
    items,
    answer,
    correctOrder,
}: {
    items: OrderItem[];
    answer?: string[];
    correctOrder: string[];
}) {
    const studentOrder = useMemo(() => {
        if (Array.isArray(answer) && answer.length) return answer;
        return items.map((i) => i.id);
    }, [answer, items]);

    const itemMap = useMemo(
        () => new Map(items.map((item) => [item.id, item])),
        [items],
    );

    return (
        <div className="space-y-2">
            {studentOrder.map((itemId, index) => {
                const item = itemMap.get(itemId);
                const correctPosition = correctOrder.indexOf(itemId);
                const isCorrectPosition = correctPosition === index;

                return (
                    <div
                        key={itemId}
                        className={cn(
                            "flex items-center gap-2 rounded-xl border-2 px-4 py-3.5",
                            isCorrectPosition
                                ? "border-emerald-400 bg-emerald-50/40"
                                : "border-red-300 bg-red-50/30",
                        )}
                    >
                        <div
                            className={cn(
                                "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                                isCorrectPosition
                                    ? "bg-emerald-100"
                                    : "bg-red-100",
                            )}
                        >
                            <span
                                className={cn(
                                    "text-xs font-bold",
                                    isCorrectPosition
                                        ? "text-emerald-600"
                                        : "text-red-500",
                                )}
                            >
                                {index + 1}
                            </span>
                        </div>
                        <span className="text-sm text-brand-primary/80 flex-1">
                            {item?.text || itemId}
                        </span>
                        {isCorrectPosition ? (
                            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                            <span className="text-xs text-red-500 shrink-0">
                                <X className="h-4 w-4 inline" /> (pos. correta: {correctPosition + 1})
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
