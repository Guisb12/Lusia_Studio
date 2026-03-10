"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { BlueprintBlockCard } from "./BlueprintBlockCard";
import type { BlueprintBlock } from "@/lib/worksheet-generation";

interface BlueprintBlockListProps {
    blocks: BlueprintBlock[];
    onReorder: (blocks: BlueprintBlock[]) => void;
    onBlockComment: (blockId: string, comment: string) => void;
    onChildReorder: (parentBlockId: string, newChildren: BlueprintBlock[]) => void;
    /** IDs of blocks that just appeared */
    newBlockIds?: Set<string>;
    /** IDs of blocks that were updated */
    highlightedBlockIds?: Set<string>;
    /** Whether blocks are being streamed in */
    isStreaming?: boolean;
}

export function BlueprintBlockList({
    blocks,
    onReorder,
    onBlockComment,
    onChildReorder,
    newBlockIds,
    highlightedBlockIds,
    isStreaming,
}: BlueprintBlockListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = blocks.findIndex((b) => b.id === active.id);
        const newIndex = blocks.findIndex((b) => b.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return;
        onReorder(arrayMove(blocks, oldIndex, newIndex));
    };

    if (blocks.length === 0) {
        return (
            <div className="flex h-full items-center justify-center">
                {isStreaming ? (
                    <div className="flex items-center gap-2 text-sm text-brand-primary/40">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        A gerar plano...
                    </div>
                ) : (
                    <p className="text-sm text-brand-primary/30">
                        Usa o chat para adicionar questões ao plano.
                    </p>
                )}
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={blocks.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
            >
                <div className="space-y-2.5 max-w-2xl mx-auto">
                    {blocks.map((block, i) => (
                        <BlueprintBlockCard
                            key={block.id}
                            block={block}
                            index={i}
                            onComment={(comment) => onBlockComment(block.id, comment)}
                            onChildComment={
                                block.type === "context_group"
                                    ? onBlockComment
                                    : undefined
                            }
                            onChildReorder={
                                block.type === "context_group"
                                    ? (newChildren) => onChildReorder(block.id, newChildren)
                                    : undefined
                            }
                            isNew={newBlockIds?.has(block.id)}
                            isHighlighted={highlightedBlockIds?.has(block.id)}
                            newBlockIds={newBlockIds}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
