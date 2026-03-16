"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    CheckCircle2,
    Circle,
    GraduationCap,
    CalendarDays,
    Users,
    Target,
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
    schedule_sessions: CalendarDays,
    create_classroom: Users,
};

export function OnboardingObjectives() {
    const { user } = useUser();
    const [data, setData] = useState<ObjectivesData | null>(null);
    const [loading, setLoading] = useState(true);

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
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-brand-accent" />
                    <h2 className="text-xs font-semibold text-brand-primary/40 uppercase tracking-wider">
                        Objetivos de Onboarding
                    </h2>
                </div>
                <span className="text-xs text-brand-primary/40">
                    {completedCount}/{totalCount}
                </span>
            </div>

            <div className="rounded-xl border border-brand-accent/15 bg-gradient-to-br from-brand-accent/[0.04] to-transparent p-4 space-y-3">
                {/* Progress bar */}
                <div className="h-1.5 w-full bg-brand-primary/[0.06] rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-brand-accent rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                </div>

                {data.all_completed ? (
                    <div className="flex flex-col items-center py-3 gap-2">
                        <PartyPopper className="h-8 w-8 text-brand-accent" />
                        <p className="text-sm font-medium text-brand-primary">
                            Todos os objetivos concluídos!
                        </p>
                        <p className="text-xs text-brand-primary/50 text-center">
                            Excelente trabalho. Continua a explorar a plataforma.
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-2.5">
                        {data.objectives.map((obj) => {
                            const Icon = OBJECTIVE_ICONS[obj.id] || Circle;
                            return (
                                <li key={obj.id} className="flex items-start gap-3">
                                    <div className="mt-0.5 shrink-0">
                                        {obj.completed ? (
                                            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                                        ) : (
                                            <div className="h-[18px] w-[18px] rounded-full border-2 border-brand-primary/15 flex items-center justify-center">
                                                <Icon className="h-2.5 w-2.5 text-brand-primary/30" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p
                                            className={cn(
                                                "text-sm leading-tight",
                                                obj.completed
                                                    ? "text-brand-primary/40 line-through"
                                                    : "text-brand-primary font-medium"
                                            )}
                                        >
                                            {obj.title}
                                        </p>
                                        {!obj.completed && (
                                            <p className="text-[11px] text-brand-primary/40 mt-0.5 leading-snug">
                                                {obj.description}
                                            </p>
                                        )}
                                        {!obj.completed && obj.target > 1 && (
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <div className="h-1 flex-1 bg-brand-primary/[0.06] rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-brand-accent/60 rounded-full transition-all"
                                                        style={{
                                                            width: `${Math.round((obj.current / obj.target) * 100)}%`,
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[10px] text-brand-primary/35 tabular-nums">
                                                    {obj.current}/{obj.target}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </motion.section>
    );
}
