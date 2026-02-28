"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { X, Check, Users, Sparkles, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { CourseTag } from "@/components/ui/course-tag";
import { cn } from "@/lib/utils";
import { getGradeLabel, getEducationLevelByGrade } from "@/lib/curriculum";
import type { ClassMember } from "@/lib/classes";
import { fetchClassMembers, createClass, addClassMembers } from "@/lib/classes";
import { fetchSubjectCatalog, MaterialSubject, SubjectCatalog } from "@/lib/materials";
import { toast } from "sonner";

interface CreateClassDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
    primaryClassId: string | null;
}

export function CreateClassDialog({
    open,
    onOpenChange,
    onCreated,
    primaryClassId,
}: CreateClassDialogProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedSubjects, setSelectedSubjects] = useState<MaterialSubject[]>([]);
    const [subjectSelectorOpen, setSubjectSelectorOpen] = useState(false);
    const [catalog, setCatalog] = useState<SubjectCatalog | null>(null);
    const [students, setStudents] = useState<ClassMember[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [creating, setCreating] = useState(false);
    const [showAllStudents, setShowAllStudents] = useState(false);
    const [allStudents, setAllStudents] = useState<ClassMember[]>([]);
    const [loadingAll, setLoadingAll] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
    const [studentSectionOpen, setStudentSectionOpen] = useState(false);

    const GRADES_DESC = ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];
    const toggleGrade = (g: string) => setCollapsedGrades((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });

    // Fetch subject catalog once
    useEffect(() => {
        fetchSubjectCatalog().then(setCatalog).catch(() => {});
    }, []);

    // Load students only when section is opened
    const handleOpenStudentSection = () => {
        setStudentSectionOpen(true);
        if (primaryClassId && students.length === 0 && !loadingStudents) {
            setLoadingStudents(true);
            fetchClassMembers(primaryClassId)
                .then(setStudents)
                .catch(console.error)
                .finally(() => setLoadingStudents(false));
        } else if (!primaryClassId) {
            loadAllStudents();
        }
    };

    const loadAllStudents = async () => {
        if (allStudents.length > 0) return;
        setLoadingAll(true);
        try {
            const res = await fetch("/api/calendar/students/search?limit=500");
            if (res.ok) {
                const data = await res.json();
                setAllStudents(data);
                if (!primaryClassId) setStudents(data);
            }
        } catch {
            console.error("Failed to load all students");
        } finally {
            setLoadingAll(false);
        }
    };

    const handleShowAll = () => {
        setShowAllStudents(true);
        loadAllStudents();
    };

    const selectedSubjectIds = useMemo(() => selectedSubjects.map((s) => s.id), [selectedSubjects]);

    const displayStudents = useMemo(() => {
        const base = showAllStudents && allStudents.length > 0 ? allStudents : students;

        if (selectedSubjectIds.length > 0) {
            const subjectSet = new Set(selectedSubjectIds);
            return [...base].sort((a, b) => {
                const aMatch = (a.subject_ids || []).some((id) => subjectSet.has(id));
                const bMatch = (b.subject_ids || []).some((id) => subjectSet.has(id));
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
        }
        return base;
    }, [students, allStudents, showAllStudents, selectedSubjectIds]);

    const filteredStudents = searchQuery
        ? displayStudents.filter(
              (s) =>
                  s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  s.display_name?.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : displayStudents;

    const toggleStudent = (id: string) => {
        setSelectedStudentIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleToggleSubject = (subject: MaterialSubject) => {
        setSelectedSubjects((prev) =>
            prev.some((s) => s.id === subject.id)
                ? prev.filter((s) => s.id !== subject.id)
                : [...prev, subject],
        );
    };

    const handleRemoveSubject = (subjectId: string) => {
        setSelectedSubjects((prev) => prev.filter((s) => s.id !== subjectId));
    };

    const handleCreate = async () => {
        if (!name.trim()) return;
        setCreating(true);
        try {
            const classroom = await createClass({
                name: name.trim(),
                description: description.trim() || undefined,
                subject_ids: selectedSubjects.map((s) => s.id),
            });
            if (selectedStudentIds.size > 0) {
                await addClassMembers(classroom.id, Array.from(selectedStudentIds));
            }
            toast.success(`Turma "${name}" criada`);
            onCreated();
        } catch {
            toast.error("Erro ao criar turma");
        } finally {
            setCreating(false);
        }
    };

    const getInitials = (name?: string | null) =>
        (name || "?")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

    const matchesSubjects = (student: ClassMember) => {
        if (selectedSubjectIds.length === 0) return false;
        const subjectSet = new Set(selectedSubjectIds);
        return (student.subject_ids || []).some((id) => subjectSet.has(id));
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="font-instrument text-xl">
                            Nova Turma
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-5 py-2">
                        {/* Name */}
                        <div>
                            <label className="text-xs font-medium text-brand-primary/60 font-satoshi mb-1.5 block">
                                Nome
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Grupo Reforço Matemática"
                                className="font-satoshi"
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="text-xs font-medium text-brand-primary/60 font-satoshi mb-1.5 block">
                                Descrição (opcional)
                            </label>
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Breve descrição do grupo..."
                                rows={2}
                                className="font-satoshi resize-none"
                            />
                        </div>

                        {/* Subject selection */}
                        <div>
                            <label className="text-xs font-medium text-brand-primary/60 font-satoshi mb-2 block">
                                Disciplinas (opcional)
                            </label>

                            {/* Selected pills */}
                            {selectedSubjects.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {selectedSubjects.map((subj) => (
                                        <span
                                            key={subj.id}
                                            className="inline-flex items-center gap-1 rounded-full border pl-2 pr-1.5 py-1 text-[11px] font-medium font-satoshi"
                                            style={{
                                                backgroundColor: subj.color ? `${subj.color}15` : "rgba(15,23,42,0.05)",
                                                borderColor: subj.color ? `${subj.color}40` : "rgba(15,23,42,0.1)",
                                                color: subj.color || "rgba(15,23,42,0.8)",
                                            }}
                                        >
                                            {subj.color && (
                                                <span
                                                    className="h-2 w-2 rounded-full shrink-0"
                                                    style={{ backgroundColor: subj.color }}
                                                />
                                            )}
                                            <span className="truncate max-w-[120px]">{subj.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveSubject(subj.id)}
                                                className="rounded-full p-0.5 opacity-50 hover:opacity-100 transition-opacity ml-0.5"
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Open selector button */}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setSubjectSelectorOpen(true)}
                                className="w-full justify-start gap-2 rounded-xl border-2 border-brand-primary/15 h-10 text-sm font-normal text-brand-primary/60 hover:text-brand-primary hover:bg-brand-primary/5 shadow-sm"
                            >
                                <BookOpen className="h-4 w-4 opacity-50" />
                                {selectedSubjects.length === 0
                                    ? "Selecionar disciplinas..."
                                    : "Adicionar disciplinas..."}
                            </Button>
                        </div>

                        {/* Student selection */}
                        <div>
                            {/* Collapsed trigger */}
                            {!studentSectionOpen ? (
                                <button
                                    type="button"
                                    onClick={handleOpenStudentSection}
                                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-brand-primary/10 bg-brand-primary/[0.02] hover:bg-brand-primary/[0.04] transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-brand-primary/40" />
                                        <span className="text-sm font-medium text-brand-primary/60 font-satoshi">
                                            Adicionar alunos
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {selectedStudentIds.size > 0 && (
                                            <span className="text-[10px] bg-brand-accent/10 text-brand-accent font-semibold font-satoshi px-1.5 py-0.5 rounded-full">
                                                {selectedStudentIds.size}
                                            </span>
                                        )}
                                        <ChevronDown className="h-3.5 w-3.5 text-brand-primary/30" />
                                    </div>
                                </button>
                            ) : (
                            <>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-medium text-brand-primary/60 font-satoshi">
                                    Alunos
                                    {selectedStudentIds.size > 0 && (
                                        <span className="ml-1.5 text-brand-accent">{selectedStudentIds.size} sel.</span>
                                    )}
                                </label>
                                {!showAllStudents && primaryClassId && (
                                    <button
                                        type="button"
                                        onClick={handleShowAll}
                                        className="text-[10px] text-brand-accent hover:text-brand-accent-hover font-medium font-satoshi"
                                    >
                                        Ver todos
                                    </button>
                                )}
                            </div>

                            <Input
                                placeholder="Pesquisar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 text-sm mb-2"
                            />

                            <div className="max-h-52 overflow-y-auto rounded-xl border border-brand-primary/10">
                                {loadingStudents || loadingAll ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="h-5 w-5 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
                                    </div>
                                ) : filteredStudents.length === 0 ? (
                                    <div className="py-8 text-center text-sm text-brand-primary/40 font-satoshi">
                                        Nenhum aluno encontrado
                                    </div>
                                ) : (() => {
                                    const grouped = new Map<string, ClassMember[]>();
                                    for (const s of filteredStudents) {
                                        const key = s.grade_level ?? "_";
                                        if (!grouped.has(key)) grouped.set(key, []);
                                        grouped.get(key)!.push(s);
                                    }
                                    const keys = GRADES_DESC.filter((g) => grouped.has(g)).concat(grouped.has("_") ? ["_"] : []);

                                    return keys.map((gradeKey) => {
                                        const group = grouped.get(gradeKey) ?? [];
                                        const label = gradeKey === "_" ? "Sem ano" : getGradeLabel(gradeKey);
                                        const isCollapsed = collapsedGrades.has(gradeKey);
                                        const selectedCount = group.filter((s) => selectedStudentIds.has(s.id)).length;

                                        return (
                                            <div key={gradeKey} className="border-b border-brand-primary/5 last:border-b-0">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGrade(gradeKey)}
                                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left bg-brand-primary/[0.02] hover:bg-brand-primary/[0.04] transition-colors"
                                                >
                                                    {isCollapsed
                                                        ? <ChevronRight className="h-3 w-3 text-brand-primary/40 shrink-0" />
                                                        : <ChevronDown className="h-3 w-3 text-brand-primary/40 shrink-0" />
                                                    }
                                                    <span className="text-[11px] font-semibold text-brand-primary/70 font-satoshi">{label}</span>
                                                    <span className="text-[11px] text-brand-primary/40 font-satoshi">({group.length})</span>
                                                    {selectedCount > 0 && (
                                                        <span className="ml-auto text-[10px] text-brand-accent font-medium font-satoshi">
                                                            {selectedCount} sel.
                                                        </span>
                                                    )}
                                                </button>
                                                {!isCollapsed && group.map((student) => {
                                                    const matches = matchesSubjects(student);
                                                    const isSelected = selectedStudentIds.has(student.id);
                                                    const isSecundario = getEducationLevelByGrade(student.grade_level ?? "")?.key === "secundario";
                                                    return (
                                                        <button
                                                            key={student.id}
                                                            type="button"
                                                            onClick={() => toggleStudent(student.id)}
                                                            className={cn(
                                                                "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-brand-primary/5 last:border-b-0",
                                                                isSelected ? "bg-brand-accent/[0.06]" : "hover:bg-brand-primary/[0.03]",
                                                            )}
                                                        >
                                                            <div className="h-7 w-7 rounded-full bg-brand-primary/[0.07] flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-brand-primary/10">
                                                                {student.avatar_url ? (
                                                                    <Image src={student.avatar_url} alt="" width={28} height={28} className="object-cover h-full w-full" />
                                                                ) : (
                                                                    <span className="text-[9px] font-semibold text-brand-accent">{getInitials(student.full_name)}</span>
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-xs font-medium text-brand-primary truncate font-satoshi">
                                                                        {student.full_name}
                                                                    </span>
                                                                    {matches && <Sparkles className="h-3 w-3 text-brand-accent shrink-0" />}
                                                                </div>
                                                                {isSecundario && student.course && (
                                                                    <CourseTag courseKey={student.course} size="sm" className="mt-0.5" />
                                                                )}
                                                            </div>
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={() => toggleStudent(student.id)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="rounded-lg shrink-0 border-brand-primary/30 data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent"
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                            </>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-brand-primary/8">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={!name.trim()}
                            loading={creating}
                            className="gap-1.5"
                        >
                            <Check className="h-4 w-4" />
                            Criar Turma
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Subject selector dialog */}
            <SubjectSelector
                open={subjectSelectorOpen}
                onOpenChange={setSubjectSelectorOpen}
                catalog={catalog}
                selectedSubjects={selectedSubjects}
                onToggleSubject={handleToggleSubject}
                onRemoveSubject={handleRemoveSubject}
            />
        </>
    );
}
