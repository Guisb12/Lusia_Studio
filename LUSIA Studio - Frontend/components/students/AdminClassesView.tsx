"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, Plus, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Classroom, ClassMember } from "@/lib/classes";
import { fetchClassMembers } from "@/lib/classes";
import type { Subject } from "@/types/subjects";
import { ClassCard } from "./ClassCard";

interface AdminClassesViewProps {
    classes: Classroom[];
    subjects: Subject[];
    teacherNames: Record<string, string>;
    memberCounts: Record<string, number>;
    loading?: boolean;
    onClassClick: (classroom: Classroom) => void;
    onAddClassClick: () => void;
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
    loading = false,
    onClassClick,
    onAddClassClick,
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

    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    // Expanded class — shows its students inline
    const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
    const [expandedMembers, setExpandedMembers] = useState<ClassMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    const toggleCollapse = (teacherId: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(teacherId)) next.delete(teacherId);
            else next.add(teacherId);
            return next;
        });
    };

    // Load members when a class is expanded
    const handleClassExpand = useCallback(async (classroom: Classroom) => {
        if (expandedClassId === classroom.id) {
            setExpandedClassId(null);
            setExpandedMembers([]);
            return;
        }
        setExpandedClassId(classroom.id);
        setLoadingMembers(true);
        try {
            const members = await fetchClassMembers(classroom.id);
            setExpandedMembers(members);
        } catch {
            setExpandedMembers([]);
        } finally {
            setLoadingMembers(false);
        }
    }, [expandedClassId]);

    function resolveSubjectInfo(classroom: Classroom) {
        const first = classroom.subject_ids.length > 0
            ? subjects.find((s) => s.id === classroom.subject_ids[0])
            : undefined;
        return {
            color: first?.color || (classroom.is_primary ? "#0a1bb6" : "#6B7280"),
            icon: first?.icon ?? null,
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
        <div className="flex-1 min-h-0 overflow-auto space-y-6">
            {/* Header toolbar */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-brand-primary/50 font-medium">
                    {classes.filter((c) => !c.is_primary).length} turma{classes.filter((c) => !c.is_primary).length !== 1 ? "s" : ""} · {grouped.length} professor{grouped.length !== 1 ? "es" : ""}
                </span>
                <Button onClick={onAddClassClick} size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Nova Turma
                </Button>
            </div>

            {/* Teacher sections */}
            {grouped.map(([teacherId, teacherClasses]) => {
                const isCollapsed = collapsed.has(teacherId);
                const teacherName = teacherNames[teacherId] || "Professor";
                const nonPrimaryClasses = teacherClasses.filter((c) => !c.is_primary);
                const primaryClass = teacherClasses.find((c) => c.is_primary);

                return (
                    <div key={teacherId} className="rounded-xl border border-brand-primary/8 bg-white overflow-hidden">
                        {/* Teacher header — big and clear */}
                        <button
                            onClick={() => toggleCollapse(teacherId)}
                            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-brand-primary/[0.02] transition-colors"
                        >
                            <div className="h-9 w-9 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-brand-primary">
                                    {getInitials(teacherName)}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                                <h3 className="text-sm font-semibold text-brand-primary truncate">
                                    {teacherName}
                                </h3>
                                <p className="text-[11px] text-brand-primary/40 mt-0.5">
                                    {nonPrimaryClasses.length} turma{nonPrimaryClasses.length !== 1 ? "s" : ""}
                                    {primaryClass && memberCounts[primaryClass.id] !== undefined
                                        ? ` · ${memberCounts[primaryClass.id]} alunos`
                                        : ""}
                                </p>
                            </div>
                            {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-brand-primary/30 shrink-0" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-brand-primary/30 shrink-0" />
                            )}
                        </button>

                        {/* Classes — full-size cards in a horizontal scroll */}
                        {!isCollapsed && (
                            <div className="border-t border-brand-primary/5">
                                {nonPrimaryClasses.length === 0 ? (
                                    <div className="px-5 py-6 text-center text-sm text-brand-primary/30">
                                        Nenhuma turma criada
                                    </div>
                                ) : (
                                    <div className="px-5 py-4">
                                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                                            {nonPrimaryClasses
                                                .sort((a, b) => a.name.localeCompare(b.name, "pt"))
                                                .map((classroom) => {
                                                    const { color, icon } = resolveSubjectInfo(classroom);
                                                    const isExpanded = expandedClassId === classroom.id;
                                                    return (
                                                        <div key={classroom.id} className="flex-shrink-0">
                                                            <ClassCard
                                                                label={classroom.name}
                                                                subjectColor={color}
                                                                subjectIcon={icon}
                                                                memberCount={memberCounts[classroom.id]}
                                                                isActive={isExpanded}
                                                                onClick={() => handleClassExpand(classroom)}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                        </div>

                                        {/* Expanded class — student list inline */}
                                        {expandedClassId && nonPrimaryClasses.some((c) => c.id === expandedClassId) && (
                                            <div className="mt-3 rounded-lg border border-brand-primary/8 bg-brand-primary/[0.01] overflow-hidden">
                                                <div className="flex items-center justify-between px-4 py-2.5 border-b border-brand-primary/5">
                                                    <span className="text-xs font-medium text-brand-primary/60">
                                                        Alunos de {nonPrimaryClasses.find((c) => c.id === expandedClassId)?.name}
                                                    </span>
                                                    <button
                                                        onClick={() => onClassClick(nonPrimaryClasses.find((c) => c.id === expandedClassId)!)}
                                                        className="text-[11px] text-brand-accent hover:text-brand-accent/80 font-medium transition-colors"
                                                    >
                                                        Ver todos
                                                    </button>
                                                </div>
                                                {loadingMembers ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <div className="h-4 w-4 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                                                    </div>
                                                ) : expandedMembers.length === 0 ? (
                                                    <div className="px-4 py-6 text-center text-sm text-brand-primary/30">
                                                        Nenhum aluno nesta turma
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-brand-primary/5 max-h-[240px] overflow-y-auto">
                                                        {expandedMembers.map((member) => (
                                                            <div key={member.id} className="flex items-center gap-2.5 px-4 py-2">
                                                                <Avatar className="h-7 w-7 shrink-0">
                                                                    <AvatarImage src={member.avatar_url || undefined} />
                                                                    <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-[10px] font-medium">
                                                                        {getInitials(member.full_name)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <span className="text-sm text-brand-primary truncate">
                                                                    {member.full_name || member.display_name || "Sem nome"}
                                                                </span>
                                                                {member.grade_level && (
                                                                    <span className="text-[10px] text-brand-primary/35 shrink-0 ml-auto">
                                                                        {member.grade_level}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
