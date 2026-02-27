"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Calendar } from "lucide-react";
import { fetchMemberAssignments, type MemberAssignment } from "@/lib/members";
import { STUDENT_STATUS_LABELS, STUDENT_STATUS_COLORS } from "@/lib/assignments";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface StudentAssignmentsTabProps {
    studentId: string;
}

export function StudentAssignmentsTab({ studentId }: StudentAssignmentsTabProps) {
    const [assignments, setAssignments] = useState<MemberAssignment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchMemberAssignments(studentId)
            .then((data) => {
                if (!cancelled) setAssignments(data);
            })
            .catch(console.error)
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [studentId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            </div>
        );
    }

    const completed = assignments.filter(
        (a) => a.status === "submitted" || a.status === "graded",
    ).length;
    const total = assignments.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
        <div>
            {/* Summary */}
            {total > 0 && (
                <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-brand-primary/50">Progresso</span>
                        <span className="text-[11px] font-medium text-brand-primary">
                            {completed}/{total} concluidos
                        </span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                </div>
            )}

            {total === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <ClipboardList className="h-8 w-8 text-brand-primary/20 mb-2" />
                    <p className="text-sm text-brand-primary/40">
                        Sem trabalhos atribuidos.
                    </p>
                </div>
            ) : (
                <div className="space-y-1">
                    {assignments.map((assignment, i) => (
                        <AssignmentItem
                            key={assignment.id}
                            assignment={assignment}
                            index={i}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function AssignmentItem({
    assignment,
    index,
}: {
    assignment: MemberAssignment;
    index: number;
}) {
    const dueDate = assignment.due_date
        ? new Date(assignment.due_date).toLocaleDateString("pt-PT", {
              day: "numeric",
              month: "short",
          })
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-brand-primary/[0.02] transition-colors"
        >
            <div className="h-8 w-8 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0">
                <ClipboardList className="h-4 w-4 text-brand-primary/40" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-brand-primary truncate">
                    {assignment.assignment_title || "Sem titulo"}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                        className={cn(
                            "text-[9px] px-1.5 py-0 h-4",
                            STUDENT_STATUS_COLORS[assignment.status] || "bg-gray-100 text-gray-600",
                        )}
                    >
                        {STUDENT_STATUS_LABELS[assignment.status] || assignment.status}
                    </Badge>
                    {dueDate && (
                        <span className="text-[10px] text-brand-primary/40 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {dueDate}
                        </span>
                    )}
                </div>
            </div>
            {assignment.grade !== null && (
                <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-brand-primary">
                        {assignment.grade}%
                    </p>
                </div>
            )}
        </motion.div>
    );
}
