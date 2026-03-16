"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Calendar, ChevronRight } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Pdf01Icon,
    Note01Icon,
    Quiz02Icon,
    LicenseDraftIcon,
} from "@hugeicons/core-free-icons";
import { type MemberAssignment } from "@/lib/members";
import { useMemberAssignmentsQuery } from "@/lib/queries/members";

interface StudentAssignmentsTabProps {
    studentId: string;
}

function ArtifactTypeIcon({ type, size = 14 }: { type?: string | null; size?: number }) {
    switch (type) {
        case "quiz":
            return <HugeiconsIcon icon={Quiz02Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "note":
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "exercise_sheet":
            return <HugeiconsIcon icon={LicenseDraftIcon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "uploaded_file":
            return <HugeiconsIcon icon={Pdf01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        default:
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
    }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    not_started: { label: "Não iniciado", color: "text-brand-primary/30", bg: "bg-brand-primary/[0.04]" },
    in_progress: { label: "Em progresso", color: "text-amber-500", bg: "bg-amber-50" },
    submitted: { label: "Entregue", color: "text-blue-500", bg: "bg-blue-50" },
    graded: { label: "Avaliado", color: "text-brand-success", bg: "bg-emerald-50" },
};

export function StudentAssignmentsTab({ studentId }: StudentAssignmentsTabProps) {
    const { data: assignments = [], isLoading: loading } = useMemberAssignmentsQuery(studentId);

    const { completed, pending, overdue } = useMemo(() => {
        const now = new Date();
        let completed = 0;
        let pending = 0;
        let overdue = 0;
        for (const a of assignments) {
            if (a.status === "submitted" || a.status === "graded") {
                completed++;
            } else if (a.due_date && new Date(a.due_date) < now) {
                overdue++;
            } else {
                pending++;
            }
        }
        return { completed, pending, overdue };
    }, [assignments]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (assignments.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <ClipboardList className="h-8 w-8 text-brand-primary/20 mb-2" />
                <p className="text-sm text-brand-primary/40">
                    Sem TPC&apos;s atribuidos.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Stats bar */}
            <div className="flex items-center gap-3">
                <StatPill label="Concluídos" value={completed} color="text-brand-success" />
                <StatPill label="Pendentes" value={pending} color="text-brand-primary/50" />
                {overdue > 0 && (
                    <StatPill label="Atrasados" value={overdue} color="text-brand-error" />
                )}
            </div>

            {/* Assignments list */}
            <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                <div className="bg-white rounded-md shadow-sm overflow-hidden divide-y divide-brand-primary/[0.06]">
                    {assignments.map((assignment) => (
                        <AssignmentRow key={assignment.id} assignment={assignment} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold ${color} tabular-nums`}>{value}</span>
            <span className="text-[10px] text-brand-primary/35">{label}</span>
        </div>
    );
}

function AssignmentRow({ assignment }: { assignment: MemberAssignment }) {
    const router = useRouter();
    const config = STATUS_CONFIG[assignment.status] ?? STATUS_CONFIG.not_started;

    const dueLabel = useMemo(() => {
        if (!assignment.due_date) return null;
        const due = new Date(assignment.due_date);
        const now = new Date();
        const diffMs = due.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        const dateStr = due.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });

        if (assignment.status === "submitted" || assignment.status === "graded") {
            return { text: dateStr, overdue: false };
        }
        if (diffDays < 0) {
            return { text: `${dateStr} (atrasado)`, overdue: true };
        }
        if (diffDays === 0) {
            return { text: "Hoje", overdue: false };
        }
        if (diffDays === 1) {
            return { text: "Amanhã", overdue: false };
        }
        return { text: dateStr, overdue: false };
    }, [assignment.due_date, assignment.status]);

    const handleClick = () => {
        router.push(`/dashboard/assignments?selected=${assignment.assignment_id}`);
    };

    return (
        <div
            className="flex items-center gap-2.5 px-3.5 py-2 cursor-pointer hover:bg-brand-primary/[0.02] transition-colors"
            onClick={handleClick}
        >
            <div className={`h-6 w-6 rounded-md ${config.bg} flex items-center justify-center shrink-0 ${config.color}`}>
                <ArtifactTypeIcon type={assignment.artifact_type} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] text-brand-primary truncate leading-tight">
                    {assignment.assignment_title || "Sem título"}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] font-medium ${config.color}`}>
                        {config.label}
                    </span>
                    {dueLabel && (
                        <span className={`text-[9px] flex items-center gap-0.5 ${
                            dueLabel.overdue ? "text-brand-error" : "text-brand-primary/30"
                        }`}>
                            <Calendar className="h-2.5 w-2.5" />
                            {dueLabel.text}
                        </span>
                    )}
                </div>
            </div>
            {assignment.grade !== null && (
                <span className="text-[11px] font-bold text-brand-primary tabular-nums shrink-0">
                    {assignment.grade}%
                </span>
            )}
            <ChevronRight className="h-3 w-3 text-brand-primary/20 shrink-0" />
        </div>
    );
}
