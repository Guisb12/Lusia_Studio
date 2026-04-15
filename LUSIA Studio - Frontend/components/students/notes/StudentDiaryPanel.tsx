"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Search, Trash2, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSubjects } from "@/lib/hooks/useSubjects";
import {
    createStudentDiaryEntry,
    deleteStudentDiaryEntry,
    updateStudentDiaryEntry,
    useStudentDiaryQuery,
    invalidateStudentDiaryQueries,
    type StudentDiaryEntry,
} from "@/lib/queries/student-diary";
import { useUser } from "@/components/providers/UserProvider";

function getInitials(name: string | null): string {
    if (!name) return "?";
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
}

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function defaultDateRange() {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    return { from: isoDate(from), to: isoDate(to) };
}

function formatDate(value: string | null): string {
    if (!value) return "Sem data";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

interface StudentDiaryPanelProps {
    studentId: string;
}

export function StudentDiaryPanel({ studentId }: StudentDiaryPanelProps) {
    const { user } = useUser();
    const [dateRange, setDateRange] = useState(defaultDateRange);
    const [subjectId, setSubjectId] = useState<string>("");
    const [content, setContent] = useState("");
    const [entryDate, setEntryDate] = useState(() => isoDate(new Date()));
    const [entrySubjectId, setEntrySubjectId] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [editDate, setEditDate] = useState(isoDate(new Date()));
    const [editSubjectId, setEditSubjectId] = useState<string>("");

    const { subjects } = useSubjects({ includeCustom: true });

    const listParams = useMemo(
        () => ({
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            subjectId: subjectId || undefined,
            limit: 100,
            offset: 0,
        }),
        [dateRange.from, dateRange.to, subjectId],
    );

    const { data: entries = [], isLoading } = useStudentDiaryQuery(
        studentId,
        listParams,
        Boolean(studentId),
    );

    const subjectMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of subjects) m.set(s.id, s.name);
        return m;
    }, [subjects]);

    async function handleCreate() {
        const trimmed = content.trim();
        if (!trimmed) return;
        try {
            setIsSaving(true);
            await createStudentDiaryEntry(studentId, {
                content: trimmed,
                entry_date: entryDate,
                subject_id: entrySubjectId || null,
            });
            setContent("");
            setEntrySubjectId("");
            setEntryDate(isoDate(new Date()));
            invalidateStudentDiaryQueries(studentId);
        } catch {
            toast.error("Erro ao criar entrada no diário");
        } finally {
            setIsSaving(false);
        }
    }

    function openEdit(entry: StudentDiaryEntry) {
        setEditingId(entry.id);
        setEditContent(entry.content);
        setEditDate((entry.entry_date ?? "").slice(0, 10) || isoDate(new Date()));
        setEditSubjectId(entry.subject_id ?? "");
    }

    async function handleUpdate(entryId: string) {
        const trimmed = editContent.trim();
        if (!trimmed) {
            toast.error("Conteúdo não pode estar vazio");
            return;
        }
        try {
            setIsSaving(true);
            await updateStudentDiaryEntry(studentId, entryId, {
                content: trimmed,
                entry_date: editDate,
                subject_id: editSubjectId || null,
            });
            setEditingId(null);
            invalidateStudentDiaryQueries(studentId);
        } catch {
            toast.error("Erro ao atualizar entrada");
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(entryId: string) {
        try {
            await deleteStudentDiaryEntry(studentId, entryId);
            invalidateStudentDiaryQueries(studentId);
        } catch {
            toast.error("Erro ao apagar entrada");
        }
    }

    return (
        <div className="space-y-3">
            <div className="rounded-xl border border-brand-primary/10 bg-white p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-brand-primary/35 font-medium">Nova entrada</p>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Escreve uma observação para o diário do aluno..."
                    className="w-full min-h-[88px] rounded-lg border border-brand-primary/10 bg-white px-3 py-2 text-[13px] text-brand-primary outline-none focus:border-brand-primary/30"
                    maxLength={2000}
                />
                <div className="flex flex-wrap gap-2 items-center">
                    <input
                        type="date"
                        value={entryDate}
                        onChange={(e) => setEntryDate(e.target.value)}
                        className="h-8 rounded-lg border border-brand-primary/10 px-2 text-[12px] text-brand-primary bg-white"
                    />
                    <select
                        value={entrySubjectId}
                        onChange={(e) => setEntrySubjectId(e.target.value)}
                        className="h-8 rounded-lg border border-brand-primary/10 px-2 text-[12px] text-brand-primary bg-white min-w-[160px]"
                    >
                        <option value="">Sem disciplina</option>
                        {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={isSaving || !content.trim()}
                        className="h-8 px-3 rounded-lg text-[11px] font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-50"
                    >
                        Guardar
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-brand-primary/10 bg-white p-3 space-y-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-brand-primary/35 font-medium">
                    <Search className="h-3 w-3" />
                    Filtros
                </div>
                <div className="flex flex-wrap gap-2">
                    <input
                        type="date"
                        value={dateRange.from}
                        onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                        className="h-8 rounded-lg border border-brand-primary/10 px-2 text-[12px] text-brand-primary bg-white"
                    />
                    <input
                        type="date"
                        value={dateRange.to}
                        onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                        className="h-8 rounded-lg border border-brand-primary/10 px-2 text-[12px] text-brand-primary bg-white"
                    />
                    <select
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value)}
                        className="h-8 rounded-lg border border-brand-primary/10 px-2 text-[12px] text-brand-primary bg-white min-w-[160px]"
                    >
                        <option value="">Todas as disciplinas</option>
                        {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => {
                            setDateRange(defaultDateRange());
                            setSubjectId("");
                        }}
                        className="h-8 px-3 rounded-lg text-[11px] font-semibold text-brand-primary/60 hover:bg-brand-primary/[0.04]"
                    >
                        Limpar
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                {isLoading && (
                    <div className="rounded-xl border border-brand-primary/10 bg-white p-4 text-[12px] text-brand-primary/45">
                        A carregar diário...
                    </div>
                )}

                {!isLoading && entries.length === 0 && (
                    <div className="rounded-xl border border-brand-primary/10 bg-white p-6 text-center">
                        <div className="mx-auto h-10 w-10 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center mb-2">
                            <BookOpen className="h-4 w-4 text-brand-primary/30" />
                        </div>
                        <p className="text-[12px] text-brand-primary/40">Sem entradas no período selecionado.</p>
                    </div>
                )}

                {!isLoading && entries.map((entry) => {
                    const isEditing = editingId === entry.id;
                    const subjectLabel = entry.subject_name ?? (entry.subject_id ? subjectMap.get(entry.subject_id) : null);
                    const isOwnEntry = entry.teacher_id === user?.id;

                    return (
                        <div key={entry.id} className="rounded-xl border border-brand-primary/10 bg-white p-3">
                            {isEditing ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        className="w-full min-h-[72px] rounded-lg border border-brand-primary/10 px-3 py-2 text-[13px] text-brand-primary outline-none focus:border-brand-primary/30"
                                        maxLength={2000}
                                    />
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <input
                                            type="date"
                                            value={editDate}
                                            onChange={(e) => setEditDate(e.target.value)}
                                            className="h-8 rounded-lg border border-brand-primary/10 px-2 text-[12px] text-brand-primary bg-white"
                                        />
                                        <select
                                            value={editSubjectId}
                                            onChange={(e) => setEditSubjectId(e.target.value)}
                                            className="h-8 rounded-lg border border-brand-primary/10 px-2 text-[12px] text-brand-primary bg-white min-w-[160px]"
                                        >
                                            <option value="">Sem disciplina</option>
                                            {subjects.map((s) => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        <div className="flex-1" />
                                        <button
                                            type="button"
                                            onClick={() => setEditingId(null)}
                                            className="h-8 px-3 rounded-lg text-[11px] font-semibold text-brand-primary/60 hover:bg-brand-primary/[0.04]"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleUpdate(entry.id)}
                                            disabled={isSaving}
                                            className="h-8 px-3 rounded-lg text-[11px] font-semibold bg-brand-accent text-white hover:bg-brand-accent-hover disabled:opacity-50"
                                        >
                                            Atualizar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-start gap-2">
                                        <Avatar className="h-7 w-7 shrink-0 ring-1 ring-brand-primary/10">
                                            <AvatarImage src={entry.teacher_avatar_url || undefined} />
                                            <AvatarFallback className="text-[9px] bg-brand-primary/10 text-brand-primary font-bold">
                                                {getInitials(entry.teacher_name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                <span className="text-[11px] font-semibold text-brand-primary">
                                                    {entry.teacher_name ?? "Professor"}
                                                </span>
                                                {isOwnEntry && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-accent/10 text-brand-accent">
                                                        Tua
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-brand-primary/35">
                                                    {formatDate(entry.entry_date)}
                                                </span>
                                                {subjectLabel && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-primary/[0.06] text-brand-primary/75">
                                                        {subjectLabel}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[13px] text-brand-primary/85 whitespace-pre-wrap leading-relaxed">
                                                {entry.content}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(entry)}
                                                className="h-7 w-7 rounded-md text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/[0.04]"
                                                title="Editar"
                                            >
                                                <Pencil className="h-3.5 w-3.5 mx-auto" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleDelete(entry.id)}
                                                className="h-7 w-7 rounded-md text-brand-error/70 hover:text-brand-error hover:bg-brand-error/10"
                                                title="Apagar"
                                            >
                                                <Trash2 className="h-3.5 w-3.5 mx-auto" />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
