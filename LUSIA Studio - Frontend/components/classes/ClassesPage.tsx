"use client";

import React, { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { useUser } from "@/components/providers/UserProvider";
import { useSubjects } from "@/lib/hooks/useSubjects";
import { Button } from "@/components/ui/button";
import { ClassesList } from "./ClassesList";
import type { Classroom, PaginatedClassrooms } from "@/lib/classes";
import { fetchClasses } from "@/lib/classes";

const ClassesOnboarding = dynamic(
    () => import("./ClassesOnboarding").then((m) => ({ default: m.ClassesOnboarding })),
    { ssr: false },
);
const ClassDetail = dynamic(
    () => import("./ClassDetail").then((m) => ({ default: m.ClassDetail })),
    { ssr: false },
);
const CreateClassDialog = dynamic(
    () => import("./CreateClassDialog").then((m) => ({ default: m.CreateClassDialog })),
    { ssr: false },
);

interface ClassesPageProps {
    initialClasses: PaginatedClassrooms;
}

export function ClassesPage({ initialClasses }: ClassesPageProps) {
    const { user } = useUser();
    const isAdmin = user?.role === "admin";
    const [classes, setClasses] = useState<Classroom[]>(initialClasses.data);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    const { subjects } = useSubjects({ includeCustom: true });

    const hasClasses = classes.length > 0;
    const selectedClass = classes.find((c) => c.id === selectedId) ?? null;

    // Find primary class for CreateClassDialog default source
    const primaryClass = classes.find((c) => c.is_primary) ?? null;

    const refetchClasses = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchClasses(undefined, 1, 50);
            setClasses(data.data);
        } catch (e) {
            console.error("Failed to refetch classes:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleOnboardingComplete = useCallback(() => {
        refetchClasses();
    }, [refetchClasses]);

    const handleClassCreated = useCallback(() => {
        setCreateOpen(false);
        refetchClasses();
    }, [refetchClasses]);

    const handleClassUpdated = useCallback(
        (updated: Classroom) => {
            setClasses((prev) =>
                prev.map((c) => (c.id === updated.id ? updated : c)),
            );
        },
        [],
    );

    const handleMembersChanged = useCallback(() => {
        // Members are on profiles, not the classroom itself — just trigger a re-render
        // by bumping the selected class to force ClassDetail to refetch
        setSelectedId((prev) => {
            if (!prev) return null;
            return prev;
        });
    }, []);

    // ── Onboarding (no classes yet) ──
    if (!hasClasses && !loading) {
        return (
            <div className="h-full flex flex-col">
                <ClassesOnboarding
                    onComplete={handleOnboardingComplete}
                    subjects={subjects}
                />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-1 mb-6">
                <div>
                    <h1 className="font-instrument text-3xl text-brand-primary">
                        {isAdmin ? "Turmas do Centro" : "Minhas Turmas"}
                    </h1>
                    <p className="text-sm text-brand-primary/60 font-satoshi mt-1">
                        {isAdmin
                            ? "Todas as turmas dos professores do centro"
                            : "Organize os seus alunos em turmas para operações mais rápidas"}
                    </p>
                </div>
                <Button
                    onClick={() => setCreateOpen(true)}
                    className="gap-1.5"
                    size="sm"
                >
                    <Plus className="h-4 w-4" />
                    Nova Turma
                </Button>
            </div>

            {/* Main content area with optional split panel */}
            <div className="flex-1 flex gap-0 min-h-0 overflow-hidden">
                {/* Left: class list */}
                <motion.div
                    className="flex-1 min-w-0 overflow-y-auto px-1 pt-1"
                    animate={{ width: selectedClass ? "55%" : "100%" }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                >
                    <ClassesList
                        classes={classes}
                        subjects={subjects}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        isAdmin={isAdmin}
                    />
                </motion.div>

                {/* Right: detail panel */}
                <AnimatePresence mode="wait">
                    {selectedClass && (
                        <motion.div
                            key={selectedClass.id}
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: "45%", opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="border-l border-brand-primary/5 pl-4 overflow-hidden"
                        >
                            <ClassDetail
                                classroom={selectedClass}
                                subjects={subjects}
                                onClose={() => setSelectedId(null)}
                                onUpdated={handleClassUpdated}
                                onMembersChanged={handleMembersChanged}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Create class dialog */}
            {createOpen && (
                <CreateClassDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    onCreated={handleClassCreated}
                    primaryClassId={primaryClass?.id ?? null}
                />
            )}
        </div>
    );
}
