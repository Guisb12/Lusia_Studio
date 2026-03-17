"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle2,
    ChevronDown,
    Circle,
    GraduationCap,
    CalendarDays,
    Users,
    BookOpen,
    PartyPopper,
} from "lucide-react";
import { useUser } from "@/components/providers/UserProvider";
import { cn } from "@/lib/utils";

interface Objective {
    id: string;
    title: string;
    description: string;
    current: number;
    target: number;
    completed: boolean;
}

interface ObjectivesData {
    objectives: Objective[];
    all_completed: boolean;
}

const OBJECTIVE_ICONS: Record<string, React.ElementType> = {
    enroll_students: GraduationCap,
    enroll_teachers: BookOpen,
    schedule_sessions: CalendarDays,
    create_classroom: Users,
};

export function OnboardingObjectives() {
    const { user } = useUser();
    const [data, setData] = useState<ObjectivesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(true);

    const isTrial = user?.organization_status === "trial";
    const isAdmin = user?.role === "admin";

    useEffect(() => {
        if (!isAdmin || !isTrial) {
            setLoading(false);
            return;
        }

        fetch("/api/onboarding-objectives")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setData(d))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [isAdmin, isTrial]);

    if (!isAdmin || !isTrial || loading || !data || data.objectives.length === 0) {
        return null;
    }

    const completedCount = data.objectives.filter((o) => o.completed).length;
    const totalCount = data.objectives.length;
    const progressPct = Math.round((completedCount / totalCount) * 100);

    return (
        <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center justify-between mb-2 w-full group"
            >
                <p className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                    Objetivos Integração
                </p>
                <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-brand-accent/10 px-2 py-0.5 text-[10px] font-medium text-brand-accent tabular-nums">
                        {completedCount}/{totalCount}
                    </span>
                    <ChevronDown
                        className={cn(
                            "h-3 w-3 text-brand-primary/25 transition-transform duration-200",
                            !open && "-rotate-90"
                        )}
                    />
                </div>
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                            <div className="bg-white rounded-md shadow-sm overflow-hidden">
                                {data.all_completed ? (
                                    <div className="px-3 py-2.5 flex items-center gap-2">
                                        <PartyPopper className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                        <p className="text-[13px] text-brand-primary font-medium flex-1">
                                            Integração concluída
                                        </p>
                                        <span className="text-[9px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-px rounded-full">
                                            Completo
                                        </span>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-brand-primary/[0.04]">
                                        {data.objectives.map((obj) => {
                                            const Icon = OBJECTIVE_ICONS[obj.id] || Circle;
                                            const itemPct = Math.round((obj.current / obj.target) * 100);
                                            return (
                                                <div key={obj.id} className="px-3 py-2.5">
                                                    {/* Row 1: icon + title + badge */}
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {obj.completed ? (
                                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                        ) : (
                                                            <Icon className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
                                                        )}
                                                        <p
                                                            className={cn(
                                                                "text-[13px] truncate leading-tight flex-1",
                                                                obj.completed
                                                                    ? "text-brand-primary/45"
                                                                    : "text-brand-primary font-medium"
                                                            )}
                                                        >
                                                            {obj.title}
                                                        </p>
                                                        {obj.completed ? (
                                                            <span className="text-[9px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-px rounded-full shrink-0">
                                                                Concluído
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] tabular-nums text-brand-primary/25 shrink-0">
                                                                {obj.current}/{obj.target}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Row 2: meta — description + inline progress */}
                                                    {!obj.completed && (
                                                        <div className="flex items-center gap-2 mt-1 ml-[22px]">
                                                            <span className="text-[10px] text-brand-primary/30 truncate">
                                                                {obj.description}
                                                            </span>
                                                            <div className="h-1 w-12 bg-brand-primary/[0.06] rounded-full overflow-hidden shrink-0">
                                                                <div
                                                                    className="h-full bg-brand-accent/60 rounded-full"
                                                                    style={{ width: `${itemPct}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.section>
    );
}
