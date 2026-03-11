"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { X, Pencil, Check, Trash2, UserPlus, UserMinus, ChevronDown, Search } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
    addClassMembers,
    removeClassMembers,
    updateClass,
    deleteClass,
    type Classroom,
    type ClassMember,
} from "@/lib/classes";
import { toast } from "sonner";
import { StudentPicker } from "@/components/calendar/StudentPicker";
import type { StudentInfo } from "@/components/calendar/StudentHoverCard";
import type { Member } from "@/lib/members";

interface ManageClassDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    classroom: Classroom | null;
    /** All available non-primary classes (for the class switcher) */
    classes: Classroom[];
    primaryClassId: string | null;
    /** Members of the currently managed class — derived from parent state, no fetch needed */
    members: Member[];
    /** Set of ALL member IDs across all classes (for excludeIds in StudentPicker) */
    memberIds: Set<string>;
    /** Optimistic add: parent updates its caches immediately */
    onAddMembers: (classId: string, students: StudentInfo[]) => void;
    /** Optimistic remove: parent updates its caches immediately */
    onRemoveMember: (classId: string, memberId: string) => void;
    /** Rollback add on API failure */
    onAddMembersRollback?: (classId: string, studentIds: string[]) => void;
    /** Rollback remove on API failure */
    onRemoveMemberRollback?: (classId: string, member: ClassMember) => void;
    onRenamed: (classId: string, updated: Classroom) => void;
    onDeleted: (classId: string) => void;
    onSwitchClass: (classId: string) => void;
}

export function ManageClassDialog({
    open,
    onOpenChange,
    classroom,
    classes,
    primaryClassId,
    members,
    memberIds,
    onAddMembers,
    onRemoveMember,
    onAddMembersRollback,
    onRemoveMemberRollback,
    onRenamed,
    onDeleted,
    onSwitchClass,
}: ManageClassDialogProps) {
    // Rename
    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState("");
    const [savingName, setSavingName] = useState(false);

    // Delete
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Add students (using StudentPicker)
    const [addMode, setAddMode] = useState(false);
    const [studentsToAdd, setStudentsToAdd] = useState<StudentInfo[]>([]);
    const [adding, setAdding] = useState(false);

    // Search members
    const [searchQuery, setSearchQuery] = useState("");

    // Remove (track which member is being removed for loading state)
    const [removingId, setRemovingId] = useState<string | null>(null);

    // Class picker
    const [classPickerOpen, setClassPickerOpen] = useState(false);

    // Reset state when dialog opens or class switches
    useEffect(() => {
        if (open && classroom) {
            setNameValue(classroom.name);
            setEditingName(false);
            setConfirmDelete(false);
            setAddMode(false);
            setStudentsToAdd([]);
            setSearchQuery("");
            setRemovingId(null);
        }
    }, [open, classroom?.id, classroom?.name]);

    const filteredMembers = useMemo(() => {
        if (!searchQuery) return members;
        const q = searchQuery.toLowerCase();
        return members.filter((m) =>
            m.full_name?.toLowerCase().includes(q) ||
            m.display_name?.toLowerCase().includes(q),
        );
    }, [members, searchQuery]);

    // ── Handlers ──────────────────────────────────────────────

    const handleSaveName = async () => {
        if (!classroom || !nameValue.trim() || nameValue === classroom.name) {
            setEditingName(false);
            return;
        }
        setSavingName(true);
        try {
            const updated = await updateClass(classroom.id, { name: nameValue.trim() });
            onRenamed(classroom.id, updated);
            setEditingName(false);
            toast.success("Nome atualizado");
        } catch {
            toast.error("Erro ao renomear");
        } finally {
            setSavingName(false);
        }
    };

    const handleDelete = async () => {
        if (!classroom) return;
        setDeleting(true);
        try {
            await deleteClass(classroom.id);
            onDeleted(classroom.id);
            onOpenChange(false);
            toast.success("Turma arquivada");
        } catch {
            toast.error("Erro ao arquivar turma");
        } finally {
            setDeleting(false);
        }
    };

    const handleRemove = async (memberId: string) => {
        if (!classroom) return;
        setRemovingId(memberId);
        const memberToRemove = members.find((m) => m.id === memberId);
        // Optimistic: update parent immediately
        onRemoveMember(classroom.id, memberId);
        try {
            await removeClassMembers(classroom.id, [memberId]);
            toast.success("Aluno removido");
        } catch {
            // Rollback on failure
            if (memberToRemove) {
                onRemoveMemberRollback?.(classroom.id, {
                    id: memberToRemove.id,
                    full_name: memberToRemove.full_name,
                    display_name: memberToRemove.display_name,
                    avatar_url: memberToRemove.avatar_url,
                    grade_level: memberToRemove.grade_level,
                    course: memberToRemove.course,
                    subject_ids: memberToRemove.subject_ids,
                });
            }
            toast.error("Erro ao remover");
        } finally {
            setRemovingId(null);
        }
    };

    const handleAddStudents = async () => {
        if (!classroom || studentsToAdd.length === 0) return;
        setAdding(true);
        const toAdd = [...studentsToAdd]; // capture before clearing
        // Optimistic: update parent immediately
        onAddMembers(classroom.id, toAdd);
        setStudentsToAdd([]);
        setAddMode(false);
        try {
            await addClassMembers(classroom.id, toAdd.map((s) => s.id), primaryClassId);
            toast.success(`${toAdd.length} aluno(s) adicionado(s)`);
        } catch {
            // Rollback on failure
            onAddMembersRollback?.(classroom.id, toAdd.map((s) => s.id));
            toast.error("Erro ao adicionar");
        } finally {
            setAdding(false);
        }
    };

    const getInitials = (name?: string | null) =>
        (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

    if (!classroom) return null;

    const nonPrimaryClasses = classes.filter((c) => !c.is_primary);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg p-0 gap-0 flex flex-col max-h-[85vh] overflow-visible">
                {/* Header: class name + class picker */}
                <div className="px-5 pt-5 pb-3 border-b border-brand-primary/8 shrink-0">
                    <div className="flex items-center gap-1.5 mb-2">
                        {editingName ? (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Input
                                    value={nameValue}
                                    onChange={(e) => setNameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveName();
                                        if (e.key === "Escape") { setEditingName(false); setNameValue(classroom.name); }
                                    }}
                                    disabled={savingName}
                                    className="font-instrument text-xl h-9 border-brand-accent/30"
                                    autoFocus
                                />
                                <Button size="icon-sm" variant="ghost" onClick={handleSaveName} disabled={savingName}>
                                    <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon-sm" variant="ghost" onClick={() => { setEditingName(false); setNameValue(classroom.name); }}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <DialogHeader className="flex-row items-center gap-1.5 flex-1 min-w-0 space-y-0">
                                <DialogTitle className="font-instrument text-xl truncate">
                                    {classroom.name}
                                </DialogTitle>
                                <button
                                    onClick={() => { setEditingName(true); setNameValue(classroom.name); }}
                                    className="p-1 rounded-md text-brand-primary/25 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors shrink-0"
                                    title="Renomear"
                                >
                                    <Pencil className="h-3 w-3" />
                                </button>
                            </DialogHeader>
                        )}
                    </div>

                    {/* Class picker — switch between classes */}
                    {nonPrimaryClasses.length > 1 && (
                        <Popover open={classPickerOpen} onOpenChange={setClassPickerOpen}>
                            <PopoverTrigger asChild>
                                <button className="inline-flex items-center gap-1.5 text-xs text-brand-primary/50 hover:text-brand-primary/70 transition-colors">
                                    <span>A gerir:</span>
                                    <span className="font-medium text-brand-primary/70">{classroom.name}</span>
                                    <ChevronDown className="h-3 w-3" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-1 max-h-[200px] overflow-y-auto" align="start">
                                {nonPrimaryClasses.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => {
                                            onSwitchClass(c.id);
                                            setClassPickerOpen(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                            c.id === classroom.id
                                                ? "bg-brand-accent/10 text-brand-accent"
                                                : "text-brand-primary/70 hover:bg-brand-primary/5",
                                        )}
                                    >
                                        <span className="truncate">{c.name}</span>
                                        {c.id === classroom.id && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
                                    </button>
                                ))}
                            </PopoverContent>
                        </Popover>
                    )}
                </div>

                {/* Toolbar: search/add toggle + StudentPicker */}
                <div className="px-5 py-3 border-b border-brand-primary/5 shrink-0 relative z-20">
                    {addMode ? (
                        <div className="space-y-2.5">
                            <StudentPicker
                                value={studentsToAdd}
                                onChange={setStudentsToAdd}
                                placeholder="Pesquisar alunos para adicionar..."
                                primaryClassId={primaryClassId}
                                excludeIds={memberIds}
                            />
                            <div className="flex items-center justify-end gap-1.5">
                                <Button size="sm" variant="ghost" onClick={() => { setAddMode(false); setStudentsToAdd([]); }}>
                                    Cancelar
                                </Button>
                                <Button size="sm" onClick={handleAddStudents} disabled={studentsToAdd.length === 0} loading={adding} className="gap-1">
                                    <UserPlus className="h-3.5 w-3.5" />
                                    Adicionar ({studentsToAdd.length})
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-primary/30 pointer-events-none" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Pesquisar membros..."
                                    className="h-8 text-sm pl-8"
                                />
                            </div>
                            <Button size="sm" variant="outline" onClick={() => { setAddMode(true); setStudentsToAdd([]); setSearchQuery(""); }} className="gap-1 shrink-0">
                                <UserPlus className="h-3.5 w-3.5" />
                                Adicionar
                            </Button>
                        </div>
                    )}
                </div>

                {/* Member list — scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {filteredMembers.length === 0 ? (
                        <div className="py-12 text-center text-sm text-brand-primary/40">
                            {searchQuery ? "Nenhum membro encontrado" : "Nenhum aluno nesta turma."}
                        </div>
                    ) : (
                        <div className="divide-y divide-brand-primary/5">
                            {filteredMembers.map((member) => {
                                const isRemoving = removingId === member.id;
                                return (
                                    <div
                                        key={member.id}
                                        className={cn(
                                            "group/row flex items-center gap-3 px-5 py-2.5 transition-opacity",
                                            isRemoving && "opacity-50",
                                        )}
                                    >
                                        <div className="h-8 w-8 rounded-full bg-brand-accent/10 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-brand-primary/5">
                                            {member.avatar_url ? (
                                                <Image src={member.avatar_url} alt="" width={32} height={32} className="object-cover h-full w-full" />
                                            ) : (
                                                <span className="text-[10px] font-semibold text-brand-accent">{getInitials(member.full_name)}</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium text-brand-primary truncate block">
                                                {member.full_name || member.display_name || "Sem nome"}
                                            </span>
                                            {member.grade_level && (
                                                <span className="text-[11px] text-brand-primary/35">{member.grade_level}º ano</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleRemove(member.id)}
                                            disabled={isRemoving}
                                            title="Remover da turma"
                                            className="opacity-0 group-hover/row:opacity-100 p-1 rounded-md text-brand-primary/30 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                                        >
                                            <UserMinus className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer: member count + delete */}
                <div className="px-5 py-3 border-t border-brand-primary/8 flex items-center justify-between shrink-0">
                    <span className="text-xs text-brand-primary/40">
                        {members.length} {members.length === 1 ? "aluno" : "alunos"}
                    </span>

                    {confirmDelete ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-brand-primary/60">Arquivar turma?</span>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                                Não
                            </Button>
                            <Button size="sm" variant="destructive" onClick={handleDelete} loading={deleting}>
                                Arquivar
                            </Button>
                        </div>
                    ) : (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDelete(true)}
                            className="gap-1.5 text-brand-primary/40 hover:text-red-500"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Arquivar
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
