"use client";

import React, { useMemo } from "react";
import { Reorder } from "framer-motion";
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface OrderItem {
    id: string;
    text: string;
}

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
                        className="flex items-center gap-2 rounded-xl border-2 border-brand-primary/8 bg-white px-3 py-3 cursor-grab active:cursor-grabbing"
                    >
                        <GripVertical className="h-4 w-4 text-brand-primary/25 shrink-0" />
                        <span className="text-xs font-medium text-brand-primary/40 w-6 text-center shrink-0">
                            {index + 1}
                        </span>
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
}: {
    items: OrderItem[];
    correctOrder: string[];
    onContentChange: (patch: Record<string, any>) => void;
}) {
    const displayOrder = useMemo(() => {
        if (correctOrder.length === items.length) return correctOrder;
        return items.map((i) => i.id);
    }, [correctOrder, items]);

    const itemMap = useMemo(
        () => new Map(items.map((item) => [item.id, item])),
        [items],
    );

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-brand-primary/60 text-xs">Itens</Label>
                {items.map((item, index) => (
                    <div key={item.id} className="flex items-center gap-2">
                        <Input
                            value={item.text}
                            onChange={(e) => {
                                const next = [...items];
                                next[index] = { ...item, text: e.target.value };
                                onContentChange({ items: next });
                            }}
                            placeholder={`Item ${index + 1}`}
                            className="text-sm"
                        />
                        {items.length > 2 && (
                            <button
                                type="button"
                                onClick={() => {
                                    const nextItems = items.filter((_, i) => i !== index);
                                    const nextOrder = correctOrder.filter((id) => id !== item.id);
                                    onContentChange({ items: nextItems, correct_order: nextOrder });
                                }}
                                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                            >
                                <Trash2 className="h-3.5 w-3.5 text-brand-error/60" />
                            </button>
                        )}
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        const newItem = { id: crypto.randomUUID(), text: "" };
                        onContentChange({
                            items: [...items, newItem],
                            correct_order: [...correctOrder, newItem.id],
                        });
                    }}
                    className="gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar item
                </Button>
            </div>

            <div className="space-y-2">
                <Label className="text-brand-primary/60 text-xs">Ordem correta</Label>
                {displayOrder.map((id, index) => {
                    const item = itemMap.get(id);
                    return (
                        <div
                            key={id}
                            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/20 px-3 py-2.5"
                        >
                            <span className="text-xs font-medium text-emerald-600 w-6 text-center shrink-0">
                                {index + 1}
                            </span>
                            <span className="text-sm text-brand-primary/75 flex-1">
                                {item?.text || id}
                            </span>
                            <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => {
                                        const next = [...displayOrder];
                                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                        onContentChange({ correct_order: next });
                                    }}
                                    className={cn(
                                        "p-1 rounded-lg transition-colors",
                                        index === 0
                                            ? "text-brand-primary/15"
                                            : "text-emerald-600/60 hover:bg-emerald-50",
                                    )}
                                >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    disabled={index === displayOrder.length - 1}
                                    onClick={() => {
                                        const next = [...displayOrder];
                                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                        onContentChange({ correct_order: next });
                                    }}
                                    className={cn(
                                        "p-1 rounded-lg transition-colors",
                                        index === displayOrder.length - 1
                                            ? "text-brand-primary/15"
                                            : "text-emerald-600/60 hover:bg-emerald-50",
                                    )}
                                >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        onContentChange({
                            correct_order: items.map((i) => i.id),
                        })
                    }
                >
                    Usar ordem dos itens como correta
                </Button>
            </div>
        </div>
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
                            "flex items-center gap-2 rounded-xl border-2 px-3 py-3",
                            isCorrectPosition
                                ? "border-emerald-400 bg-emerald-50/40"
                                : "border-red-300 bg-red-50/30",
                        )}
                    >
                        <span
                            className={cn(
                                "text-xs font-medium w-6 text-center shrink-0",
                                isCorrectPosition
                                    ? "text-emerald-600"
                                    : "text-red-500",
                            )}
                        >
                            {index + 1}
                        </span>
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
