"use client";

import React, { useMemo, useState, useCallback } from "react";
import { Plus, Users, Settings2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import type { Classroom, ClassMember } from "@/lib/classes";
import { fetchClassMembers } from "@/lib/classes";
import type { Subject } from "@/types/subjects";

interface AdminClassesViewProps {
    classes: Classroom[];
    subjects: Subject[];
    teacherNames: Record<string, string>;
    memberCounts: Record<string, number>;
    /** Pre-loaded class members from parent cache — instant expand */
    classMembersData?: Record<string, ClassMember[]>;
    loading?: boolean;
    onAddClassClick: () => void;
    /** Open ManageClassDialog for a class */
    onManageClass: (classId: string) => void;
    /** Select a student to show in the detail side card */
    onStudentClick: (memberId: string) => void;
    selectedStudentId?: string | null;
}

function getInitials(name: string | null | undefined): string {
    if (!name) return "?";
    return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function AdminClassesView({
    classes,
    subjects,
    teacherNames,
    memberCounts,
    classMembersData,
    loading = false,
    onAddClassClick,
    onManageClass,
    onStudentClick,
    selectedStudentId,
}: AdminClassesViewProps) {
    // Group classes by teacher_id
    const grouped = useMemo(() => {
        const map = new Map<string, Classroom[]>();
        for (const cls of classes) {
            const arr = map.get(cls.teacher_id) || [];
            arr.push(cls);
            map.set(cls.teacher_id, arr);
        }
        return [...map.entries()].sort((a, b) => {
            const nameA = teacherNames[a[0]] || "Professor";
            const nameB = teacherNames[b[0]] || "Professor";
            return nameA.localeCompare(nameB, "pt");
        });
    }, [classes, teacherNames]);

    // Expanded class — shows students inline
    const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
    const [expandedMembers, setExpandedMembers] = useState<ClassMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    const handleExpand = useCallback(async (classroom: Classroom) => {
        if (expandedClassId === classroom.id) {
            setExpandedClassId(null);
            setExpandedMembers([]);
            return;
        }
        setExpandedClassId(classroom.id);
        // Use parent cache if available (instant, no loading)
        if (classMembersData?.[classroom.id]) {
            setExpandedMembers(classMembersData[classroom.id]);
            setLoadingMembers(false);
            return;
        }
        // Fallback to fetch
        setLoadingMembers(true);
        try {
            const members = await fetchClassMembers(classroom.id);
            setExpandedMembers(members);
        } catch {
            setExpandedMembers([]);
        } finally {
            setLoadingMembers(false);
        }
    }, [expandedClassId, classMembersData]);

    function resolveSubjectInfo(classroom: Classroom) {
        const first = classroom.subject_ids.length > 0
            ? subjects.find((s) => s.id === classroom.subject_ids[0])
            : undefined;
        return {
            color: first?.color || (classroom.is_primary ? "#0a1bb6" : "#6B7280"),
            icon: first?.icon ?? "users",
        };
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (grouped.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
                <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-brand-primary/30" />
                </div>
                <h3 className="text-lg font-medium text-brand-primary/80 mb-1">Sem turmas</h3>
                <p className="text-sm text-brand-primary/50 max-w-sm">
                    As turmas aparecerão aqui quando os professores as criarem.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <span className="text-xs text-brand-primary/50 font-medium">
                    {classes.filter((c) => !c.is_primary).length} turma{classes.filter((c) => !c.is_primary).length !== 1 ? "s" : ""} · {grouped.length} professor{grouped.length !== 1 ? "es" : ""}
                </span>
                <Button onClick={onAddClassClick} size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Nova Turma
                </Button>
            </div>

            {/* Kanban board */}
            <div
                className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden pb-2 scrollbar-none"
                style={{ scrollbarWidth: "none" }}
            >
                <div className="flex gap-4 h-full min-w-min">
                    {grouped.map(([teacherId, teacherClasses]) => {
                        const teacherName = teacherNames[teacherId] || "Professor";
                        const nonPrimaryClasses = teacherClasses.filter((c) => !c.is_primary);
                        const primaryClass = teacherClasses.find((c) => c.is_primary);
                        const totalStudents = primaryClass ? (memberCounts[primaryClass.id] ?? 0) : 0;

                        return (
                            <div
                                key={teacherId}
                                className="w-[280px] shrink-0 flex flex-col rounded-xl border border-brand-primary/8 bg-white overflow-hidden"
                            >
                                {/* Column header */}
                                <div className="px-4 py-3 border-b border-brand-primary/5 shrink-0">
                                    <div className="flex items-center gap-2.5">
                                        <Avatar className="h-8 w-8 shrink-0">
                                            <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-[10px] font-bold">
                                                {getInitials(teacherName)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-semibold text-brand-primary truncate">
                                                {teacherName}
                                            </h3>
                                            <p className="text-[10px] text-brand-primary/40">
                                                {nonPrimaryClasses.length} turma{nonPrimaryClasses.length !== 1 ? "s" : ""}
                                                {totalStudents > 0 ? ` · ${totalStudents} alunos` : ""}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Column body */}
                                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                                    {nonPrimaryClasses.length === 0 ? (
                                        <div className="py-8 text-center text-xs text-brand-primary/25">
                                            Sem turmas
                                        </div>
                                    ) : (
                                        nonPrimaryClasses
                                            .sort((a, b) => a.name.localeCompare(b.name, "pt"))
                                            .map((classroom) => {
                                                const { color, icon } = resolveSubjectInfo(classroom);
                                                const Icon = getSubjectIcon(icon);
                                                const isExpanded = expandedClassId === classroom.id;
                                                const count = memberCounts[classroom.id] ?? 0;

                                                return (
                                                    <div
                                                        key={classroom.id}
                                                        className={cn(
                                                            "rounded-lg border transition-all overflow-hidden",
                                                            isExpanded
                                                                ? "border-brand-primary/15 bg-white shadow-sm"
                                                                : "border-brand-primary/8 bg-brand-primary/[0.01] hover:border-brand-primary/12 hover:bg-white",
                                                        )}
                                                    >
                                                        {/* Class card header */}
                                                        <div className="flex items-center gap-2.5 px-3 py-2.5">
                                                            <button
                                                                onClick={() => handleExpand(classroom)}
                                                                className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                                                            >
                                                                <div
                                                                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                                                                    style={{ backgroundColor: color }}
                                                                >
                                                                    <Icon style={{ height: "14px", width: "14px", color: "#fff" }} />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[13px] font-semibold text-brand-primary truncate">
                                                                        {classroom.name}
                                                                    </p>
                                                                    <p className="text-[10px] text-brand-primary/35">
                                                                        {count} {count === 1 ? "aluno" : "alunos"}
                                                                    </p>
                                                                </div>
                                                            </button>
                                                            <button
                                                                onClick={() => onManageClass(classroom.id)}
                                                                title="Gerir turma"
                                                                className="p-1.5 rounded-md text-brand-primary/25 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors shrink-0"
                                                            >
                                                                <Settings2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>

                                                        {/* Expanded: student list */}
                                                        {isExpanded && (
                                                            <div className="border-t border-brand-primary/5">
                                                                {loadingMembers ? (
                                                                    <div className="flex items-center justify-center py-6">
                                                                        <div className="h-4 w-4 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                                                                    </div>
                                                                ) : expandedMembers.length === 0 ? (
                                                                    <div className="px-3 py-5 text-center text-[11px] text-brand-primary/30">
                                                                        Nenhum aluno
                                                                    </div>
                                                                ) : (
                                                                    <div className="max-h-[220px] overflow-y-auto divide-y divide-brand-primary/5">
                                                                        {expandedMembers.map((member) => (
                                                                            <button
                                                                                key={member.id}
                                                                                onClick={() => onStudentClick(member.id)}
                                                                                className={cn(
                                                                                    "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
                                                                                    selectedStudentId === member.id
                                                                                        ? "bg-brand-primary/5"
                                                                                        : "hover:bg-brand-primary/[0.02]",
                                                                                )}
                                                                            >
                                                                                <Avatar className="h-6 w-6 shrink-0">
                                                                                    <AvatarImage src={member.avatar_url || undefined} />
                                                                                    <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-[8px] font-medium">
                                                                                        {getInitials(member.full_name)}
                                                                                    </AvatarFallback>
                                                                                </Avatar>
                                                                                <span className="text-[12px] text-brand-primary truncate flex-1">
                                                                                    {member.full_name || member.display_name || "Sem nome"}
                                                                                </span>
                                                                                {member.grade_level && (
                                                                                    <span className="text-[10px] text-brand-primary/30 shrink-0">
                                                                                        {member.grade_level}º
                                                                                    </span>
                                                                                )}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
