"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { X, UserPlus, UserMinus, Pencil, Check, Users, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CourseTag } from "@/components/ui/course-tag";
import { SubjectDots } from "./SubjectDots";
import { cn } from "@/lib/utils";
import { getGradeLabel, getEducationLevelByGrade } from "@/lib/curriculum";
import type { Classroom, ClassMember } from "@/lib/classes";
import type { Subject } from "@/types/subjects";
import {
    fetchClassMembers,
    addClassMembers,
    removeClassMembers,
    updateClass,
} from "@/lib/classes";
import { fetchMembers } from "@/lib/members";
import { toast } from "sonner";

const GRADES_DESC = ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];

function groupByGrade<T extends { grade_level?: string | null }>(items: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const key = item.grade_level ?? "_";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
    }
    return map;
}

function orderedGradeKeys(grouped: Map<string, unknown[]>): string[] {
    return GRADES_DESC.filter((g) => grouped.has(g)).concat(grouped.has("_") ? ["_"] : []);
}

interface ClassDetailProps {
    classroom: Classroom;
    subjects: Subject[];
    onClose: () => void;
    onUpdated: (updated: Classroom) => void;
    onMembersChanged: () => void;
}

export function ClassDetail({ classroom, subjects, onClose, onUpdated, onMembersChanged }: ClassDetailProps) {
    const [members, setMembers] = useState<ClassMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState(classroom.name);
    const [searchQuery, setSearchQuery] = useState("");
    const [addMode, setAddMode] = useState(false);
    const [allStudents, setAllStudents] = useState<ClassMember[]>([]);
    const [loadingAll, setLoadingAll] = useState(false);
    const [selectedForAdd, setSelectedForAdd] = useState<Set<string>>(new Set());
    const [selectedForRemove, setSelectedForRemove] = useState<Set<string>>(new Set());
    const [removing, setRemoving] = useState(false);
    const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());

    const loadMembers = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchClassMembers(classroom.id);
            setMembers(data);
        } catch {
            console.error("Failed to load members");
        } finally {
            setLoading(false);
        }
    }, [classroom.id]);

    useEffect(() => { loadMembers(); }, [loadMembers]);

    useEffect(() => {
        setNameValue(classroom.name);
        setEditingName(false);
        setAddMode(false);
        setSelectedForAdd(new Set());
        setSelectedForRemove(new Set());
        setCollapsedGrades(new Set());
    }, [classroom.id, classroom.name]);

    const saveName = async () => {
        if (!nameValue.trim() || nameValue === classroom.name) {
            setEditingName(false);
            setNameValue(classroom.name);
            return;
        }
        try {
            const updated = await updateClass(classroom.id, { name: nameValue.trim() });
            onUpdated(updated);
            setEditingName(false);
            toast.success("Nome atualizado");
        } catch {
            toast.error("Erro ao atualizar nome");
        }
    };

    const loadAllStudents = async () => {
        if (allStudents.length > 0) return;
        setLoadingAll(true);
        try {
            const data = await fetchMembers("student", "active", 1, 100);
            const members: ClassMember[] = data.data.map((m) => ({
                id: m.id,
                full_name: m.full_name,
                display_name: m.display_name,
                avatar_url: m.avatar_url,
                grade_level: m.grade_level,
                course: m.course,
                subject_ids: m.subject_ids,
            }));
            setAllStudents(members);
        } catch { console.error("Failed to load students"); }
        finally { setLoadingAll(false); }
    };

    const handleAddMode = () => { setAddMode(true); loadAllStudents(); };

    const handleAddConfirm = async () => {
        if (selectedForAdd.size === 0) return;
        try {
            await addClassMembers(classroom.id, Array.from(selectedForAdd));
            toast.success(`${selectedForAdd.size} aluno(s) adicionado(s)`);
            setAddMode(false);
            setSelectedForAdd(new Set());
            loadMembers();
            onMembersChanged();
        } catch { toast.error("Erro ao adicionar alunos"); }
    };

    const handleRemoveSelected = async () => {
        if (selectedForRemove.size === 0) return;
        setRemoving(true);
        try {
            await removeClassMembers(classroom.id, Array.from(selectedForRemove));
            toast.success(`${selectedForRemove.size} aluno(s) removido(s)`);
            setSelectedForRemove(new Set());
            loadMembers();
            onMembersChanged();
        } catch { toast.error("Erro ao remover alunos"); }
        finally { setRemoving(false); }
    };

    const toggleAdd = (id: string) => setSelectedForAdd((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleRemove = (id: string) => setSelectedForRemove((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleGrade = (g: string) => setCollapsedGrades((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });

    const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
    const available = useMemo(() => allStudents.filter((s) => !memberIds.has(s.id)), [allStudents, memberIds]);

    const applySearch = <T extends { full_name?: string | null; display_name?: string | null }>(list: T[]) => {
        if (!searchQuery) return list;
        const q = searchQuery.toLowerCase();
        return list.filter((s) => s.full_name?.toLowerCase().includes(q) || s.display_name?.toLowerCase().includes(q));
    };

    const filteredMembers = applySearch(members);
    const filteredAvailable = applySearch(available);

    const membersGrouped = useMemo(() => groupByGrade(filteredMembers), [filteredMembers]);
    const availableGrouped = useMemo(() => groupByGrade(filteredAvailable), [filteredAvailable]);

    const getInitials = (name?: string | null) =>
        (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

    const renderGradedList = (
        grouped: Map<string, ClassMember[]>,
        selectedSet: Set<string>,
        onToggle: (id: string) => void,
        mode: "add" | "remove",
        emptyMsg: string,
    ) => {
        const keys = orderedGradeKeys(grouped as Map<string, unknown[]>);
        if (keys.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Users className="h-7 w-7 text-brand-primary/20" />
                    <p className="text-sm text-brand-primary/40 font-satoshi">{emptyMsg}</p>
                </div>
            );
        }
        return keys.map((gradeKey) => {
            const group = grouped.get(gradeKey) ?? [];
            const label = gradeKey === "_" ? "Sem ano" : getGradeLabel(gradeKey);
            const isCollapsed = collapsedGrades.has(gradeKey);
            const selectedCount = group.filter((s) => selectedSet.has(s.id)).length;

            return (
                <div key={gradeKey} className="border-b border-brand-primary/5 last:border-b-0">
                    <button
                        type="button"
                        onClick={() => toggleGrade(gradeKey)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left bg-brand-primary/[0.02] hover:bg-brand-primary/[0.04] transition-colors"
                    >
                        {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5 text-brand-primary/40 shrink-0" />
                            : <ChevronDown className="h-3.5 w-3.5 text-brand-primary/40 shrink-0" />
                        }
                        <span className="text-[11px] font-semibold text-brand-primary/70 font-satoshi">
                            {label}
                        </span>
                        <span className="text-[11px] text-brand-primary/40 font-satoshi">({group.length})</span>
                        {selectedCount > 0 && (
                            <span className={cn(
                                "ml-auto text-[10px] font-medium font-satoshi",
                                mode === "remove" ? "text-red-500" : "text-brand-accent"
                            )}>
                                {selectedCount} selecionados
                            </span>
                        )}
                    </button>
                    {!isCollapsed && group.map((student) => (
                        <StudentRow
                            key={student.id}
                            student={student}
                            isSelected={selectedSet.has(student.id)}
                            onToggle={() => onToggle(student.id)}
                            getInitials={getInitials}
                            mode={mode}
                        />
                    ))}
                </div>
            );
        });
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-primary/8">
                <div className="flex-1 min-w-0">
                    {editingName && !classroom.is_primary ? (
                        <div className="flex items-center gap-2">
                            <Input
                                value={nameValue}
                                onChange={(e) => setNameValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") saveName();
                                    if (e.key === "Escape") { setEditingName(false); setNameValue(classroom.name); }
                                }}
                                className="font-instrument text-xl h-8 border-brand-accent/30"
                                autoFocus
                            />
                            <Button size="icon-sm" variant="ghost" onClick={saveName}>
                                <Check className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <button onClick={() => !classroom.is_primary && setEditingName(true)} className="flex items-center gap-2 group">
                            <h2 className="font-instrument text-xl text-brand-primary truncate">{classroom.name}</h2>
                            {!classroom.is_primary && (
                                <Pencil className="h-3 w-3 text-brand-primary/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </button>
                    )}
                    {classroom.subject_ids.length > 0 && (
                        <SubjectDots subjectIds={classroom.subject_ids} subjects={subjects} showLabels size="sm" className="mt-2" />
                    )}
                </div>
                <Button size="icon-sm" variant="ghost" onClick={onClose} className="shrink-0 ml-2">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-brand-primary/5">
                <Input
                    placeholder="Pesquisar alunos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 text-sm flex-1"
                />
                {!addMode ? (
                    <div className="flex items-center gap-1.5">
                        {selectedForRemove.size > 0 && (
                            <Button size="sm" variant="destructive" onClick={handleRemoveSelected} loading={removing} className="gap-1">
                                <UserMinus className="h-3.5 w-3.5" />
                                Remover ({selectedForRemove.size})
                            </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={handleAddMode} className="gap-1">
                            <UserPlus className="h-3.5 w-3.5" />
                            Adicionar
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => { setAddMode(false); setSelectedForAdd(new Set()); }}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleAddConfirm} disabled={selectedForAdd.size === 0} className="gap-1">
                            <UserPlus className="h-3.5 w-3.5" />
                            Adicionar ({selectedForAdd.size})
                        </Button>
                    </div>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="h-5 w-5 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
                    </div>
                ) : addMode ? (
                    loadingAll ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="h-5 w-5 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
                        </div>
                    ) : (
                        renderGradedList(availableGrouped, selectedForAdd, toggleAdd, "add", "Nenhum aluno disponível")
                    )
                ) : (
                    renderGradedList(membersGrouped, selectedForRemove, toggleRemove, "remove",
                        searchQuery ? "Nenhum aluno encontrado" : "Nenhum aluno nesta turma")
                )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-brand-primary/8 text-xs text-brand-primary/40 font-satoshi">
                {members.length} {members.length === 1 ? "aluno" : "alunos"} nesta turma
            </div>
        </div>
    );
}

// ── Student Row ──

interface StudentRowProps {
    student: ClassMember;
    isSelected: boolean;
    onToggle: () => void;
    getInitials: (name?: string | null) => string;
    mode: "add" | "remove";
}

function StudentRow({ student, isSelected, onToggle, getInitials, mode }: StudentRowProps) {
    const isSecundario = getEducationLevelByGrade(student.grade_level ?? "")?.key === "secundario";

    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn(
                "w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors border-b border-brand-primary/5 last:border-b-0",
                isSelected
                    ? mode === "add"
                        ? "bg-brand-accent/[0.06]"
                        : "bg-red-50/60"
                    : "hover:bg-brand-primary/[0.03]",
            )}
        >
            <div className="h-8 w-8 rounded-full bg-brand-accent/10 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-brand-primary/5">
                {student.avatar_url ? (
                    <Image src={student.avatar_url} alt="" width={32} height={32} className="object-cover h-full w-full" />
                ) : (
                    <span className="text-[10px] font-semibold text-brand-accent">{getInitials(student.full_name)}</span>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-brand-primary truncate block font-satoshi">
                    {student.full_name}
                </span>
                {isSecundario && student.course && (
                    <CourseTag courseKey={student.course} size="sm" className="mt-0.5" />
                )}
            </div>
            <Checkbox
                checked={isSelected}
                onCheckedChange={onToggle}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    "rounded-lg shrink-0",
                    mode === "add"
                        ? "border-brand-primary/30 data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent"
                        : "border-brand-primary/30 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500",
                )}
            />
        </button>
    );
}
