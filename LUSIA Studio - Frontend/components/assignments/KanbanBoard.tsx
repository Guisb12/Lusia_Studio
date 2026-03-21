"use client";

import type { ReactNode } from "react";
import { useState, useMemo, useCallback } from "react";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
    type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Assignment } from "@/lib/assignments";
import { KanbanColumn } from "@/components/assignments/KanbanColumn";
import { KanbanCardOverlay } from "@/components/assignments/KanbanCard";
import { cn } from "@/lib/utils";

// Virtual column IDs
const COL_ACTIVE = "active";
const COL_REVIEW = "review";
const COL_CLOSED = "closed";

const COLUMNS = [
    { id: COL_ACTIVE, title: "Ativos", accentColor: "#10b981" },
    { id: COL_REVIEW, title: "Para Corrigir", accentColor: "#f59e0b" },
    { id: COL_CLOSED, title: "Fechados", accentColor: "#1e40af" },
] as const;

function isReadyToReview(a: Assignment): boolean {
    const now = new Date();
    const deadlinePassed = !!a.due_date && new Date(a.due_date) < now;
    const allSubmitted =
        (a.student_count ?? 0) > 0 &&
        (a.submitted_count ?? 0) >= (a.student_count ?? 0);
    return deadlinePassed || allSubmitted;
}

function getColumnForAssignment(a: Assignment): string {
    if (a.status === "closed") return COL_CLOSED;
    if (a.status === "published" && isReadyToReview(a)) return COL_REVIEW;
    return COL_ACTIVE;
}

function canDropIntoColumn(assignment: Assignment | null | undefined, columnId: string): boolean {
    if (!assignment) return false;

    if (columnId === COL_CLOSED) return assignment.status !== "closed";
    if (columnId === COL_ACTIVE) return assignment.status === "closed" || getColumnForAssignment(assignment) !== COL_ACTIVE;
    if (columnId === COL_REVIEW) return isReadyToReview(assignment);

    return false;
}

interface KanbanBoardProps {
    assignments: Assignment[];
    isAdminGlobalView?: boolean;
    compact?: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onStatusChange: (id: string, newStatus: "published" | "closed") => void;
    onPrefetchAssignment?: (id: string) => void;
    closedAssignments?: Assignment[];
    closedHeaderContent?: ReactNode;
    closedFooterContent?: ReactNode;
    onClosedColumnEndReached?: () => void;
    onCreateNew?: () => void;
}

export function KanbanBoard({
    assignments,
    isAdminGlobalView,
    compact,
    selectedId,
    onSelect,
    onStatusChange,
    onPrefetchAssignment,
    closedAssignments,
    closedHeaderContent,
    closedFooterContent,
    onClosedColumnEndReached,
    onCreateNew,
}: KanbanBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [overColumnId, setOverColumnId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    // Group assignments into columns
    const columnMap = useMemo(() => {
        const map: Record<string, Assignment[]> = {
            [COL_ACTIVE]: [],
            [COL_REVIEW]: [],
            [COL_CLOSED]: closedAssignments ?? [],
        };
        for (const a of assignments) {
            const col = getColumnForAssignment(a);
            map[col].push(a);
        }
        return map;
    }, [assignments, closedAssignments]);

    const allAssignmentsById = useMemo(() => {
        const map = new Map<string, Assignment>();
        for (const a of assignments) map.set(a.id, a);
        for (const a of closedAssignments ?? []) map.set(a.id, a);
        return map;
    }, [assignments, closedAssignments]);

    const activeAssignment = activeId
        ? allAssignmentsById.get(activeId)
        : undefined;

    // Find which column an item belongs to
    const findColumn = useCallback(
        (id: string): string | null => {
            if (id === COL_ACTIVE || id === COL_REVIEW || id === COL_CLOSED) return id;
            for (const [colId, items] of Object.entries(columnMap)) {
                if (items.some((a) => a.id === id)) return colId;
            }
            return null;
        },
        [columnMap],
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    }, []);

    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            const { over } = event;
            if (!over) {
                setOverColumnId(null);
                return;
            }
            const col = findColumn(over.id as string) ?? (over.id as string);
            setOverColumnId(col);
        },
        [findColumn],
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            setActiveId(null);
            setOverColumnId(null);

            const { active, over } = event;
            if (!over) return;

            const activeAssignmentId = active.id as string;
            const sourceCol = findColumn(activeAssignmentId);
            const destCol = findColumn(over.id as string) ?? (over.id as string);
            const draggedAssignment = allAssignmentsById.get(activeAssignmentId);

            // Same column or invalid drop — no-op
            if (!sourceCol || !destCol || sourceCol === destCol) return;

            if (!canDropIntoColumn(draggedAssignment, destCol)) return;

            // Map column to backend status
            if (destCol === COL_CLOSED) {
                onStatusChange(activeAssignmentId, "closed");
            } else if (destCol === COL_ACTIVE || destCol === COL_REVIEW) {
                onStatusChange(activeAssignmentId, "published");
            }
        },
        [allAssignmentsById, findColumn, onStatusChange],
    );

    const handleDragCancel = useCallback(() => {
        setActiveId(null);
        setOverColumnId(null);
    }, []);

    const isDragging = activeId !== null;
    const activeColumn = activeAssignment ? getColumnForAssignment(activeAssignment) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className={cn("flex h-full min-h-0 min-w-0 w-full", compact ? "gap-2" : "gap-4")}>
                {COLUMNS.map((col) => (
                    <KanbanColumn
                        key={col.id}
                        id={col.id}
                        title={col.title}
                        count={columnMap[col.id].length}
                        assignments={columnMap[col.id]}
                        accentColor={col.accentColor}
                        isAdminGlobalView={isAdminGlobalView}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        onPrefetchAssignment={onPrefetchAssignment}
                        headerContent={col.id === COL_CLOSED ? closedHeaderContent : undefined}
                        footerContent={col.id === COL_CLOSED ? closedFooterContent : undefined}
                        onScrollEnd={col.id === COL_CLOSED ? onClosedColumnEndReached : undefined}
                        compact={compact}
                        isDragging={isDragging}
                        isDropBlocked={isDragging && overColumnId === col.id && !canDropIntoColumn(activeAssignment, col.id)}
                        isValidDrop={isDragging && overColumnId === col.id && canDropIntoColumn(activeAssignment, col.id) && activeColumn !== col.id}
                        isDropAvailable={isDragging && canDropIntoColumn(activeAssignment, col.id) && activeColumn !== col.id}
                        onCreateNew={col.id === COL_ACTIVE ? onCreateNew : undefined}
                    />
                ))}
            </div>

            <DragOverlay dropAnimation={null}>
                {activeAssignment ? (
                    <KanbanCardOverlay
                        assignment={activeAssignment}
                        accentColor={COLUMNS.find((column) => column.id === (activeColumn ?? getColumnForAssignment(activeAssignment)))?.accentColor}
                        isAdminGlobalView={isAdminGlobalView}
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
