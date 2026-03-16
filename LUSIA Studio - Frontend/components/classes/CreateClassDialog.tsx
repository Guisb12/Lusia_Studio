"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Check, BookOpen, ChevronDown, UserCircle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { createClass, addClassMembers } from "@/lib/classes";
import type { MaterialSubject } from "@/lib/materials";
import type { Member } from "@/lib/members";
import { useUser } from "@/components/providers/UserProvider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StudentPicker } from "@/components/calendar/StudentPicker";
import type { StudentInfo } from "@/components/calendar/StudentHoverCard";
import { useSubjectCatalogQuery } from "@/lib/queries/subjects";
import { useTeachersQuery } from "@/lib/queries/teachers";
import {
    addStudentsToClassMembersCache,
    removeStudentsFromClassMembersCache,
    syncCreatedClassIntoQueries,
    syncStudentsIntoPrimaryStudentViews,
    removeStudentsFromPrimaryStudentViews,
} from "@/lib/queries/classes";

interface CreateClassDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
    primaryClassId: string | null;
    /** When true, shows teacher selector so admin can create classes for other teachers */
    isAdmin?: boolean;
}

export function CreateClassDialog({
    open,
    onOpenChange,
    onCreated,
    primaryClassId,
    isAdmin = false,
}: CreateClassDialogProps) {
    const [name, setName] = useState("");
    const [selectedSubjects, setSelectedSubjects] = useState<MaterialSubject[]>([]);
    const [subjectSelectorOpen, setSubjectSelectorOpen] = useState(false);
    const [selectedStudents, setSelectedStudents] = useState<StudentInfo[]>([]);
    const [creating, setCreating] = useState(false);

    const { user } = useUser();
    const { data: catalog = null } = useSubjectCatalogQuery(open);

    // Admin: teacher selector
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
    const [teacherPickerOpen, setTeacherPickerOpen] = useState(false);
    const { data: teacherOptions = [] } = useTeachersQuery(isAdmin && open);
    const teachers = useMemo<Member[]>(
        () =>
            teacherOptions
                .filter((teacher) => teacher.id !== user?.id)
                .map((teacher) => ({
                    id: teacher.id,
                    full_name: teacher.name,
                    display_name: teacher.name,
                    avatar_url: teacher.avatar_url ?? null,
                    email: null,
                    role: "teacher",
                    status: "active",
                    school_name: null,
                    phone: null,
                    grade_level: null,
                    course: null,
                    subjects_taught: null,
                    subject_ids: null,
                    class_ids: null,
                    parent_name: null,
                    parent_email: null,
                    parent_phone: null,
                    hourly_rate: null,
                    onboarding_completed: false,
                    created_at: null,
                })),
        [teacherOptions, user?.id],
    );

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setName("");
            setSelectedSubjects([]);
            setSelectedStudents([]);
            setSelectedTeacherId(null);
        }
    }, [open]);

    const selectedTeacher = useMemo(
        () => teachers.find((t) => t.id === selectedTeacherId) ?? null,
        [teachers, selectedTeacherId],
    );

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
            // If admin selected a teacher, we need to create the class "for" that teacher.
            // The backend createClass uses the current user's token, so for admin creating
            // for another teacher we pass teacher_id in the payload (backend must support this).
            const payload: Record<string, unknown> = {
                name: name.trim(),
                subject_ids: selectedSubjects.map((s) => s.id),
            };
            if (isAdmin && selectedTeacherId) {
                payload.teacher_id = selectedTeacherId;
            }

            const classroom = await createClass(payload as any);
            const createdForOwnScope = !isAdmin || !selectedTeacherId || selectedTeacherId === user?.id;
            syncCreatedClassIntoQueries(classroom, {
                includeOwn: createdForOwnScope,
                includeAll: isAdmin,
            });

            // Add students to the new class (auto-syncs to primary via addClassMembers)
            if (selectedStudents.length > 0) {
                addStudentsToClassMembersCache(classroom.id, selectedStudents);
                if (primaryClassId) {
                    syncStudentsIntoPrimaryStudentViews(selectedStudents, primaryClassId);
                }

                try {
                    await addClassMembers(classroom.id, selectedStudents.map((s) => s.id), primaryClassId);
                } catch {
                    removeStudentsFromClassMembersCache(classroom.id, selectedStudents.map((student) => student.id));
                    if (primaryClassId) {
                        removeStudentsFromPrimaryStudentViews(selectedStudents.map((student) => student.id), primaryClassId);
                    }
                    throw new Error("member-sync-failed");
                }
            }

            toast.success(`Turma "${name}" criada`);
            onCreated();
        } catch {
            toast.error("Erro ao criar turma");
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-instrument text-xl">
                            Nova Turma
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        {/* Admin: Teacher selector */}
                        {isAdmin && (
                            <div>
                                <label className="text-xs font-medium text-brand-primary/60 font-satoshi mb-1.5 block">
                                    Professor
                                </label>
                                <Popover open={teacherPickerOpen} onOpenChange={setTeacherPickerOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full justify-between gap-2 rounded-xl border-2 border-brand-primary/15 h-10 text-sm font-normal shadow-sm"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <UserCircle className="h-4 w-4 text-brand-primary/40 shrink-0" />
                                                <span className={cn("truncate", selectedTeacher ? "text-brand-primary" : "text-brand-primary/50")}>
                                                    {selectedTeacher
                                                        ? (selectedTeacher.display_name || selectedTeacher.full_name || "Professor")
                                                        : "Para mim (padrão)"}
                                                </span>
                                            </div>
                                            <ChevronDown className="h-3.5 w-3.5 text-brand-primary/40 shrink-0" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1 overflow-hidden" align="start">
                                        <AppScrollArea
                                            className="max-h-[240px]"
                                            viewportClassName="p-1"
                                            showFadeMasks
                                            desktopScrollbarOnly
                                            fadeClassName="from-white via-white"
                                        >
                                            <button
                                                onClick={() => { setSelectedTeacherId(null); setTeacherPickerOpen(false); }}
                                                className={cn(
                                                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                                    !selectedTeacherId ? "bg-brand-accent/10 text-brand-accent" : "text-brand-primary/70 hover:bg-brand-primary/5",
                                                )}
                                            >
                                                <UserCircle className="h-4 w-4 shrink-0" />
                                                Para mim (padrão)
                                                {!selectedTeacherId && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
                                            </button>
                                            {teachers.map((teacher) => (
                                                <button
                                                    key={teacher.id}
                                                    onClick={() => { setSelectedTeacherId(teacher.id); setTeacherPickerOpen(false); }}
                                                    className={cn(
                                                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                                        selectedTeacherId === teacher.id ? "bg-brand-accent/10 text-brand-accent" : "text-brand-primary/70 hover:bg-brand-primary/5",
                                                    )}
                                                >
                                                    <div className="h-5 w-5 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                                                        <span className="text-[8px] font-bold text-brand-primary">
                                                            {(teacher.full_name || "?").charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <span className="truncate">{teacher.display_name || teacher.full_name}</span>
                                                    {selectedTeacherId === teacher.id && <Check className="h-3.5 w-3.5 ml-auto shrink-0" />}
                                                </button>
                                            ))}
                                        </AppScrollArea>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        )}

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

                        {/* Subject selection */}
                        <div>
                            <label className="text-xs font-medium text-brand-primary/60 font-satoshi mb-2 block">
                                Disciplinas (opcional)
                            </label>

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
                                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: subj.color }} />
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
                            <label className="text-xs font-medium text-brand-primary/60 font-satoshi mb-1.5 block">
                                Alunos
                            </label>
                            <StudentPicker
                                value={selectedStudents}
                                onChange={setSelectedStudents}
                                placeholder="Pesquisar alunos..."
                                dropUp
                                enableClassFilter
                                primaryClassId={primaryClassId}
                                recommendSubjectIds={selectedSubjects.map((s) => s.id)}
                            />
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
