"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { StudentPicker } from "./StudentPicker";
import type { SubjectInfo } from "./SubjectPicker";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { MaterialSubject, SubjectCatalog } from "@/lib/materials";
import type { StudentInfo } from "./StudentHoverCard";
import { Clock, Trash2, Loader2, Calendar as CalendarIcon, BookOpen, Tag, ChevronDown, Check, UserCircle, Repeat } from "lucide-react";
import type { SessionType } from "@/lib/session-types";
import { fetchMembers } from "@/lib/members";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { RecurrencePicker } from "./RecurrencePicker";
import { RecurrenceInfo, generateRecurrenceDates } from "@/lib/recurrence";
import { useSessionTypes } from "@/lib/queries/session-types";
import { useQuery } from "@/lib/query-client";
import { usePrimaryClass } from "@/lib/hooks/usePrimaryClass";

export interface SessionFormData {
    id?: string;
    title?: string;
    date: Date;
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    students: StudentInfo[];
    subjects: SubjectInfo[];
    teacherNotes?: string;
    sessionTypeId?: string | null;
    /** Admin-only: assign session to a different teacher */
    teacherId?: string | null;
    teacherName?: string | null;
    /** Recurrence rule */
    recurrence?: RecurrenceInfo | null;
}

interface SessionFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialData?: SessionFormData | null;
    onSubmit: (data: SessionFormData) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    /** Teacher's primary class ID — scopes student picker default list. */
    primaryClassId?: string | null;
    /** Whether the current user is an admin (enables teacher picker). */
    isAdmin?: boolean;
    /** Current user ID — used as default teacher for admin. */
    currentUserId?: string;
    /** Current user display name — used as default teacher label. */
    currentUserName?: string;
}

function formatTimeInput(value: string, isDeleting: boolean, isFocused: boolean): string {
    const hasColon = value.includes(":");

    if (hasColon) {
        const parts = value.split(":");
        const beforeColon = parts[0].replace(/\D/g, "").slice(0, 2);
        const afterColon = parts.length > 1 ? parts[1].replace(/\D/g, "").slice(0, 2) : "";

        if (beforeColon.length === 0) {
            if (isFocused && isDeleting) return "";
            return ":";
        }

        if (isFocused && isDeleting && afterColon.length === 0 && beforeColon.length <= 2) {
            return beforeColon;
        }

        if (beforeColon.length === 1) return `${beforeColon}:${afterColon}`;
        if (afterColon.length === 0) return `${beforeColon}:`;
        return `${beforeColon}:${afterColon}`;
    }

    const digits = value.replace(/\D/g, "");
    const limited = digits.slice(0, 4);

    if (isFocused && !isDeleting && limited.length === 2) return limited;

    if (limited.length === 0) return "";
    if (limited.length === 1) return limited;
    if (limited.length === 2) return `${limited}:`;
    return `${limited.slice(0, 2)}:${limited.slice(2)}`;
}

function normalizeTime(value: string): string {
    if (value.includes(":")) {
        const parts = value.split(":");
        const beforeColon = parts[0].replace(/\D/g, "");
        const afterColon = parts.length > 1 ? parts[1].replace(/\D/g, "") : "";

        if (beforeColon.length === 0) return "";

        const hours = beforeColon.padStart(2, "0");
        const hourNum = parseInt(hours, 10);
        const validHours = Math.min(Math.max(0, hourNum), 23).toString().padStart(2, "0");

        const minutes = afterColon.length > 0 ? afterColon.padStart(2, "0") : "00";
        const minuteNum = parseInt(minutes, 10);
        const validMinutes = Math.min(Math.max(0, minuteNum), 59).toString().padStart(2, "0");

        return `${validHours}:${validMinutes}`;
    }

    const digits = value.replace(/\D/g, "");
    if (digits.length === 0) return "";

    if (digits.length <= 2) {
        const hours = digits.padStart(2, "0");
        const hourNum = parseInt(hours, 10);
        if (hourNum > 23) return "23:00";
        return `${hours}:00`;
    }

    const hours = digits.slice(0, 2).padStart(2, "0");
    const minutes = digits.slice(2, 4).padStart(2, "0");
    const hourNum = parseInt(hours, 10);
    const minuteNum = parseInt(minutes, 10);
    const validHours = Math.min(Math.max(0, hourNum), 23).toString().padStart(2, "0");
    const validMinutes = Math.min(Math.max(0, minuteNum), 59).toString().padStart(2, "0");

    return `${validHours}:${validMinutes}`;
}

interface TimeInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

function TimeInput({ value, onChange, placeholder = "12:30" }: TimeInputProps) {
    const [displayValue, setDisplayValue] = useState(value);
    const [isFocused, setIsFocused] = useState(false);
    const prevValueRef = useRef(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setDisplayValue(value);
        prevValueRef.current = value;
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value;
        const prevValue = prevValueRef.current;
        const prevDigits = prevValue.replace(/\D/g, "");
        const currentDigits = input.replace(/\D/g, "");
        const isDeleting = currentDigits.length < prevDigits.length;

        const formatted = formatTimeInput(input, isDeleting, isFocused);
        setDisplayValue(formatted);
        prevValueRef.current = formatted;

        if (currentDigits.length === 4) {
            const normalized = normalizeTime(formatted);
            setDisplayValue(normalized);
            prevValueRef.current = normalized;
            onChange(normalized);
        }
    };

    const handleBlur = () => {
        setIsFocused(false);
        if (displayValue.trim()) {
            const normalized = normalizeTime(displayValue);
            setDisplayValue(normalized);
            onChange(normalized);
        } else {
            onChange("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" || e.key === "Delete") return;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Home", "End"].includes(e.key)) return;
        if (e.ctrlKey || e.metaKey) return;
        if (e.key === ":" || (e.shiftKey && e.key === ";")) return;
        if (!/[0-9]/.test(e.key)) e.preventDefault();
    };

    return (
        <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={5}
            className="w-full pl-9 pr-3 h-10 rounded-xl border-2 border-brand-primary/15 bg-white text-sm font-medium text-brand-primary shadow-sm transition-all placeholder:text-brand-primary/30 focus-visible:outline-none focus-visible:border-brand-accent/40 focus-visible:ring-2 focus-visible:ring-brand-accent/10"
        />
    );
}

// ── Subject conversion helpers ─────────────────────────────────

function subjectInfoToMaterial(s: SubjectInfo): MaterialSubject {
    return {
        id: s.id,
        name: s.name,
        slug: null,
        color: s.color ?? null,
        icon: s.icon ?? null,
        education_level: s.education_level || "",
        education_level_label: "",
        grade_levels: s.grade_levels ?? [],
        status: null,
        is_custom: false,
        is_selected: true,
        selected_grade: null,
    };
}

function materialToSubjectInfo(s: MaterialSubject): SubjectInfo {
    return {
        id: s.id,
        name: s.name,
        color: s.color,
        icon: s.icon,
        education_level: s.education_level,
        grade_levels: s.grade_levels,
    };
}

function getDefaultFormData(initialData?: SessionFormData | null): SessionFormData {
    const now = new Date();
    const currentHour = now.getHours();
    const nextHour = currentHour + 1;

    return {
        id: initialData?.id,
        title: initialData?.title || "",
        date: initialData?.date || now,
        startTime: initialData?.startTime || `${String(nextHour).padStart(2, "0")}:00`,
        endTime: initialData?.endTime || `${String(nextHour + 1).padStart(2, "0")}:00`,
        students: initialData?.students || [],
        subjects: initialData?.subjects || [],
        teacherNotes: initialData?.teacherNotes || "",
        sessionTypeId: initialData?.sessionTypeId ?? null,
        teacherId: initialData?.teacherId ?? null,
        teacherName: initialData?.teacherName ?? null,
        recurrence: initialData?.recurrence ?? null,
    };
}

// ── Component ─────────────────────────────────────────────────

export function SessionFormDialog({
    open,
    onOpenChange,
    initialData,
    onSubmit,
    onDelete,
    primaryClassId,
    isAdmin,
    currentUserId,
    currentUserName,
}: SessionFormDialogProps) {
    const isEditing = Boolean(initialData?.id);
    const [formData, setFormData] = useState<SessionFormData>(() =>
        getDefaultFormData(initialData)
    );
    const [submitting, setSubmitting] = useState(false);
    const [timeError, setTimeError] = useState<string | null>(null);
    const [subjectSelectorOpen, setSubjectSelectorOpen] = useState(false);
    const { primaryClassId: fetchedPrimaryClassId, loading: loadingPrimaryClass } = usePrimaryClass(open && !primaryClassId);
    const resolvedPrimaryClassId = primaryClassId ?? fetchedPrimaryClassId;

    const {
        data: catalogData,
        isLoading: loadingCatalog,
        isFetching: fetchingCatalog,
    } = useQuery<SubjectCatalog>({
        key: "subject-catalog",
        enabled: open,
        staleTime: 5 * 60_000,
        fetcher: async () => {
            const res = await fetch("/api/materials/subjects");
            if (!res.ok) {
                throw new Error(`Failed to fetch subject catalog: ${res.status}`);
            }
            return res.json();
        },
    });
    const catalog = catalogData ?? null;
    const {
        data: sessionTypes = [],
        isLoading: loadingSessionTypes,
        isFetching: fetchingSessionTypes,
    } = useSessionTypes(true, open);
    const {
        data: teachers = [],
        isLoading: loadingTeachers,
        isFetching: fetchingTeachers,
    } = useQuery<
        { id: string; name: string; avatar_url?: string | null }[]
    >({
        key: "session-form:teachers",
        enabled: open && Boolean(isAdmin),
        staleTime: 5 * 60_000,
        fetcher: async () => {
            const res = await fetchMembers("teacher,admin", "active", 1, 100);
            return res.data.map((m) => ({
                id: m.id,
                name: m.display_name || m.full_name || "Sem nome",
                avatar_url: m.avatar_url,
            }));
        },
    });
    const isLoadingReferenceData =
        loadingCatalog ||
        fetchingCatalog ||
        loadingSessionTypes ||
        fetchingSessionTypes ||
        loadingTeachers ||
        fetchingTeachers ||
        loadingPrimaryClass;
    const loadingParts = [
        (loadingCatalog || fetchingCatalog) && "disciplinas",
        (loadingSessionTypes || fetchingSessionTypes) && "tipos de sessão",
        (loadingTeachers || fetchingTeachers) && "professores",
        loadingPrimaryClass && "alunos por defeito",
    ].filter(Boolean) as string[];

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setFormData(getDefaultFormData(initialData));
            setTimeError(null);
        }
    }, [open, initialData]);

    // Auto-select default session type once types load
    useEffect(() => {
        if (!open || !sessionTypes.length) return;
        setFormData((prev) => {
            if (prev.sessionTypeId) return prev;
            const defaultType = sessionTypes.find((t) => t.is_default);
            return defaultType ? { ...prev, sessionTypeId: defaultType.id } : prev;
        });
    }, [open, sessionTypes]);

    // Auto-select current admin as default teacher (create mode only)
    useEffect(() => {
        if (!open || !isAdmin || !currentUserId) return;
        setFormData((prev) => {
            if (prev.teacherId) return prev;
            return { ...prev, teacherId: currentUserId, teacherName: currentUserName || null };
        });
    }, [open, isAdmin, currentUserId, currentUserName, isEditing]);

    // Recurrence session count preview
    const recurrenceCount = useMemo(() => {
        if (!formData.recurrence?.rule) return 0;
        return generateRecurrenceDates(formData.recurrence.rule, formData.date).length;
    }, [formData.recurrence, formData.date]);

    const handleToggleSubject = (subject: MaterialSubject) => {
        setFormData((f) => {
            const exists = f.subjects.some((s) => s.id === subject.id);
            return {
                ...f,
                subjects: exists
                    ? f.subjects.filter((s) => s.id !== subject.id)
                    : [...f.subjects, materialToSubjectInfo(subject)],
            };
        });
    };

    const handleRemoveSubject = (subjectId: string) => {
        setFormData((f) => ({ ...f, subjects: f.subjects.filter((s) => s.id !== subjectId) }));
    };

    const validateTimes = (start: string, end: string) => {
        if (!start || !end) return true;
        const [sH, sM] = start.split(":").map(Number);
        const [eH, eM] = end.split(":").map(Number);
        if (eH < sH || (eH === sH && eM <= sM)) {
            setTimeError("Hora de fim inválida");
            return false;
        }
        setTimeError(null);
        return true;
    };

    const handleSubmit = async () => {
        if (formData.students.length === 0) return;
        if (!formData.sessionTypeId) return;
        if (!validateTimes(formData.startTime, formData.endTime)) return;

        setSubmitting(true);
        try {
            await onSubmit(formData);
            onOpenChange(false);
        } catch (e) {
            console.error("Failed to save session:", e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData?.id || !onDelete) return;
        setSubmitting(true);
        try {
            await onDelete(initialData.id);
            onOpenChange(false);
        } catch (e) {
            console.error("Failed to delete session:", e);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl font-satoshi p-0 gap-0 rounded-2xl bg-white border-none shadow-xl">
                {/* Header */}
                <div className="px-8 pt-5 pb-3">
                    <DialogTitle className="font-instrument text-brand-primary text-2xl font-normal">
                        {isEditing ? "Editar Sessão" : "Nova Sessão"}
                    </DialogTitle>
                    <DialogDescription className="text-brand-primary/50 mt-0.5 text-sm">
                        {isEditing
                            ? "Sessão agendada"
                            : "Preenche os detalhes abaixo para agendar."}
                    </DialogDescription>
                </div>

                {/* Body */}
                <div className="px-8 pb-5 space-y-4">
                    {isLoadingReferenceData && (
                        <div className="flex items-center gap-2 rounded-xl border border-brand-accent/15 bg-brand-accent/6 px-3 py-2 text-xs text-brand-accent">
                            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                            <span>
                                A carregar {loadingParts.join(", ")}...
                            </span>
                        </div>
                    )}
                    {/* Título — full width */}
                    <div className="space-y-1.5">
                        <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5">
                            Título <span className="normal-case tracking-normal font-normal text-brand-primary/35">(opcional)</span>
                        </Label>
                        <Input
                            value={formData.title || ""}
                            onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                            placeholder="Ex: Revisão de Matéria"
                            className="font-satoshi rounded-xl border-2 border-brand-primary/15 h-9 shadow-sm focus-visible:ring-brand-accent/10 focus-visible:border-brand-accent/40"
                        />
                    </div>

                    {/* Sumário — full width, 2 rows fixed, scrollable */}
                    <div className="space-y-1.5">
                        <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5">
                            Sumário <span className="normal-case tracking-normal font-normal text-brand-primary/35">(opcional)</span>
                        </Label>
                        <Textarea
                            value={formData.teacherNotes || ""}
                            onChange={(e) => setFormData((f) => ({ ...f, teacherNotes: e.target.value }))}
                            placeholder="Resumo da sessão, visível para ti e para os alunos..."
                            rows={2}
                            className="font-satoshi resize-none overflow-y-auto border-2 border-brand-primary/15 shadow-sm focus-visible:ring-brand-accent/10 focus-visible:border-brand-accent/40"
                        />
                    </div>

                    {/* Professor (admin only) — right after Sumário */}
                    {isAdmin && (
                        <div className="space-y-1.5">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5">
                                Professor <span className="normal-case tracking-normal font-normal text-brand-primary/35">(opcional)</span>
                            </Label>
                            <TeacherPicker
                                teachers={teachers}
                                value={formData.teacherId ?? null}
                                valueName={formData.teacherName}
                                currentUserId={currentUserId}
                                loading={loadingTeachers || fetchingTeachers}
                                onChange={(id, name) => setFormData((f) => ({ ...f, teacherId: id, teacherName: name }))}
                            />
                        </div>
                    )}

                    {/* Data + Alunos — side by side */}
                    <div className="grid grid-cols-2 gap-x-6">
                        <div className="space-y-1.5">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                                Data
                            </Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal rounded-xl border-2 border-brand-primary/15 h-10 text-sm shadow-sm hover:bg-brand-primary/5 focus-visible:ring-2 focus-visible:ring-brand-accent/10 focus-visible:border-brand-accent/40",
                                            !formData.date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
                                        {formData.date ? (
                                            format(formData.date, "EEE, d 'de' MMM", { locale: pt })
                                        ) : (
                                            <span>Selecionar data</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[60] rounded-xl border-brand-primary/10 shadow-lg" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={formData.date}
                                        onSelect={(date) => date && setFormData((f) => ({ ...f, date }))}
                                        initialFocus
                                        locale={pt}
                                        weekStartsOn={1}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                                    Alunos <span className="text-brand-error">*</span>
                                </Label>
                                {formData.students.length === 0 && (
                                    <p className="text-xs text-brand-primary/40 font-medium shrink-0">
                                        Pelo menos um
                                    </p>
                                )}
                            </div>
                            <StudentPicker
                                value={formData.students}
                                onChange={(students) => setFormData((f) => ({ ...f, students }))}
                                enableClassFilter
                                primaryClassId={resolvedPrimaryClassId}
                            />
                        </div>
                    </div>

                    {/* 2×2 grid: Horário | Disciplinas / Repetição | Tipo */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {/* Horário */}
                        <div className="space-y-1.5">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold flex justify-between">
                                Horário
                                {timeError && (
                                    <span className="text-brand-error normal-case tracking-normal font-medium">{timeError}</span>
                                )}
                            </Label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-primary/30 pointer-events-none" />
                                    <TimeInput
                                        value={formData.startTime}
                                        onChange={(value) => {
                                            setFormData((f) => ({ ...f, startTime: value }));
                                            validateTimes(value, formData.endTime);
                                        }}
                                        placeholder="12:30"
                                    />
                                </div>
                                <span className="text-brand-primary/30 font-medium">—</span>
                                <div className="relative flex-1">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-primary/30 pointer-events-none" />
                                    <TimeInput
                                        value={formData.endTime}
                                        onChange={(value) => {
                                            setFormData((f) => ({ ...f, endTime: value }));
                                            validateTimes(formData.startTime, value);
                                        }}
                                        placeholder="13:30"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Disciplinas */}
                        <div className="space-y-1.5">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    Disciplinas <span className="normal-case tracking-normal font-normal text-brand-primary/35">(opcional)</span>
                                </span>
                                {formData.subjects.length > 0 && (
                                    <span className="normal-case tracking-normal font-medium text-brand-primary/40">
                                        {formData.subjects.length} selecionada{formData.subjects.length !== 1 ? "s" : ""}
                                    </span>
                                )}
                            </Label>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setSubjectSelectorOpen(true)}
                                disabled={!catalog && (loadingCatalog || fetchingCatalog)}
                                className="w-full justify-start gap-2 rounded-xl border-2 border-brand-primary/15 h-9 text-sm font-normal text-brand-primary/60 hover:text-brand-primary hover:bg-brand-primary/5 shadow-sm"
                            >
                                {loadingCatalog || fetchingCatalog ? (
                                    <Loader2 className="h-4 w-4 animate-spin opacity-50 shrink-0" />
                                ) : (
                                    <BookOpen className="h-4 w-4 opacity-50 shrink-0" />
                                )}
                                {!catalog && (loadingCatalog || fetchingCatalog)
                                    ? "A carregar disciplinas..."
                                    : formData.subjects.length === 0
                                    ? "Selecionar disciplinas..."
                                    : formData.subjects.map((s) => s.name).join(", ")}
                            </Button>
                            <SubjectSelector
                                open={subjectSelectorOpen}
                                onOpenChange={setSubjectSelectorOpen}
                                catalog={catalog}
                                selectedSubjects={formData.subjects.map(subjectInfoToMaterial)}
                                onToggleSubject={(s) => { handleToggleSubject(s); setSubjectSelectorOpen(false); }}
                                onRemoveSubject={handleRemoveSubject}
                            />
                        </div>

                        {/* Repetição */}
                        <div className="space-y-1.5">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5">
                                Repetição <span className="normal-case tracking-normal font-normal text-brand-primary/35">(opcional)</span>
                            </Label>
                            <RecurrencePicker
                                value={formData.recurrence ?? null}
                                onChange={(rec) => setFormData((f) => ({ ...f, recurrence: rec }))}
                                anchorDate={formData.date}
                            />
                        </div>

                        {/* Tipo de Sessão */}
                        <div className="space-y-1.5">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                                Tipo de Sessão <span className="text-brand-error">*</span>
                            </Label>
                            <SessionTypePicker
                                types={sessionTypes}
                                value={formData.sessionTypeId ?? null}
                                loading={loadingSessionTypes || fetchingSessionTypes}
                                onChange={(id) => setFormData((f) => ({ ...f, sessionTypeId: id }))}
                            />
                        </div>
                    </div>

                    {/* Recurrence preview badge — always rendered to avoid layout shift */}
                    <div
                        className={cn(
                            "flex items-center gap-2 text-xs rounded-lg px-3 py-2 transition-all duration-200",
                            formData.recurrence && recurrenceCount > 0
                                ? "text-brand-primary/60 bg-brand-primary/[0.04] opacity-100"
                                : "opacity-0 pointer-events-none select-none"
                        )}
                        aria-hidden={!(formData.recurrence && recurrenceCount > 0)}
                    >
                        <Repeat className="h-3.5 w-3.5 shrink-0 text-brand-primary/40" />
                        <span className="flex items-center flex-wrap gap-x-1">
                            {isEditing ? "Aplica a " : "Vai criar "}
                            <span className="font-semibold text-brand-primary">{recurrenceCount}</span>{" "}
                            sessão{recurrenceCount !== 1 ? "ões" : ""} · até{" "}
                            {formData.recurrence?.rule.end_date && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="font-semibold text-brand-primary underline underline-offset-2 decoration-dashed hover:decoration-solid transition-all"
                                        >
                                            {format(
                                                new Date(formData.recurrence.rule.end_date + "T00:00:00"),
                                                "d MMM yyyy",
                                                { locale: pt }
                                            )}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 z-[60] rounded-xl border-brand-primary/10 shadow-lg" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={new Date(formData.recurrence.rule.end_date + "T00:00:00")}
                                            onSelect={(d) => {
                                                if (!d || !formData.recurrence) return;
                                                const newEndStr = format(d, "yyyy-MM-dd");
                                                setFormData((f) => ({
                                                    ...f,
                                                    recurrence: f.recurrence
                                                        ? { rule: { ...f.recurrence.rule, end_date: newEndStr } }
                                                        : null,
                                                }));
                                            }}
                                            initialFocus
                                            locale={pt}
                                            weekStartsOn={1}
                                            disabled={(d) => d < formData.date}
                                        />
                                    </PopoverContent>
                                </Popover>
                            )}
                            {recurrenceCount >= 365 && (
                                <span className="text-brand-error">(limite máximo)</span>
                            )}
                        </span>
                    </div>
                </div>

                {/* Footer */}
                <div
                    data-dialog-footer
                    className="px-8 py-4 bg-gray-50/80 flex items-center justify-between rounded-b-2xl"
                >
                    {isEditing && onDelete ? (
                        <Button
                            variant="ghost"
                            onClick={handleDelete}
                            disabled={submitting}
                            className="text-brand-error hover:text-brand-error hover:bg-brand-error/10 h-10 px-4 -ml-4"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar
                        </Button>
                    ) : (
                        <div />
                    )}

                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                            className="text-brand-primary/60 hover:text-brand-primary hover:bg-brand-primary/5 h-10 px-6"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting || formData.students.length === 0 || !formData.sessionTypeId || !!timeError}
                            className="bg-brand-primary hover:bg-brand-primary/90 text-white h-10 px-6 min-w-[120px] shadow-sm shadow-brand-primary/20 rounded-lg font-medium"
                        >
                            {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isEditing ? (
                                "Guardar"
                            ) : formData.recurrence && recurrenceCount > 1 ? (
                                `Agendar (${recurrenceCount})`
                            ) : (
                                "Agendar"
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Simple Session Type Picker ────────────────────────────────

interface SessionTypePickerProps {
    types: SessionType[];
    value: string | null;
    loading?: boolean;
    onChange: (id: string) => void;
}

function SessionTypePicker({ types, value, loading = false, onChange }: SessionTypePickerProps) {
    const [open, setOpen] = useState(false);
    const selectedType = types.find((t) => t.id === value) ?? null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    type="button"
                    className={cn(
                        "w-full justify-between text-left font-normal rounded-xl border-2 h-10 text-sm shadow-sm hover:bg-brand-primary/5 focus-visible:ring-2 focus-visible:ring-brand-accent/10 focus-visible:border-brand-accent/40",
                        !value ? "border-brand-error/30 text-muted-foreground" : "border-brand-primary/15"
                    )}
                >
                    <span className="flex items-center gap-2 truncate">
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin opacity-50 shrink-0" />
                        ) : (
                            <Tag className="h-4 w-4 opacity-50 shrink-0" />
                        )}
                        {loading && !selectedType ? (
                            <span>A carregar tipos...</span>
                        ) : selectedType ? (
                            <>
                                {selectedType.color && (
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedType.color }} />
                                )}
                                <span className="truncate">{selectedType.name}</span>
                                <span className="text-[10px] text-brand-primary/40 shrink-0">
                                    {selectedType.student_price_per_hour.toFixed(0)}&euro;/h
                                </span>
                            </>
                        ) : (
                            <span>Selecionar tipo...</span>
                        )}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-30 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0 z-[60] rounded-xl border-brand-primary/10 shadow-lg"
                align="start"
            >
                <div className="max-h-[280px] overflow-y-auto p-1">
                    {types.length === 0 && (
                        <p className="text-xs text-brand-primary/40 p-3 text-center">
                            Nenhum tipo criado. Contacte o administrador.
                        </p>
                    )}
                    {types.map((type) => (
                        <div
                            key={type.id}
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                                value === type.id
                                    ? "bg-brand-primary/5 text-brand-primary"
                                    : "hover:bg-brand-primary/[0.03] text-brand-primary/70"
                            )}
                            onClick={() => { onChange(type.id); setOpen(false); }}
                        >
                            {type.color ? (
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: type.color }} />
                            ) : (
                                <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-brand-primary/10" />
                            )}
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium truncate block">{type.name}</span>
                                <span className="text-[10px] text-brand-primary/40">
                                    {type.student_price_per_hour.toFixed(2)}&euro; aluno &middot; {type.teacher_cost_per_hour.toFixed(2)}&euro; prof
                                </span>
                            </div>
                            {value === type.id && (
                                <Check className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                            )}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ── Teacher Picker (admin only, single-select) ───────────────

interface TeacherPickerProps {
    teachers: { id: string; name: string; avatar_url?: string | null }[];
    value: string | null;
    valueName?: string | null;
    currentUserId?: string;
    loading?: boolean;
    onChange: (id: string, name: string) => void;
}

function TeacherAvatar({ src, name, size = "sm" }: { src?: string | null; name: string; size?: "sm" | "md" }) {
    const px = size === "sm" ? "h-5 w-5" : "h-6 w-6";
    const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return (
        <span className={cn("relative shrink-0 rounded-full overflow-hidden bg-brand-primary/10 flex items-center justify-center", px)}>
            {src ? (
                <Image
                    src={src}
                    alt={name}
                    fill
                    sizes={size === "sm" ? "20px" : "24px"}
                    className="object-cover"
                />
            ) : (
                <span className="text-[9px] font-semibold text-brand-primary/50">{initials}</span>
            )}
        </span>
    );
}

function TeacherPicker({ teachers, value, valueName, currentUserId, loading = false, onChange }: TeacherPickerProps) {
    const [open, setOpen] = useState(false);
    const selected = teachers.find((t) => t.id === value);
    const displayName = selected?.name ?? valueName ?? null;
    const displaySrc = selected?.avatar_url ?? null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    type="button"
                    className="w-full justify-between text-left font-normal rounded-xl border-2 border-brand-primary/15 h-10 text-sm shadow-sm hover:bg-brand-primary/5 focus-visible:ring-2 focus-visible:ring-brand-accent/10 focus-visible:border-brand-accent/40"
                >
                    <span className="flex items-center gap-2 truncate">
                        {loading && !displayName ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin opacity-50 shrink-0" />
                                <span className="text-muted-foreground">A carregar professores...</span>
                            </>
                        ) : displayName ? (
                            <>
                                <TeacherAvatar src={displaySrc} name={displayName} />
                                <span className="truncate">{displayName}</span>
                                {value === currentUserId && (
                                    <span className="text-[10px] text-brand-primary/40 shrink-0">Tu</span>
                                )}
                            </>
                        ) : (
                            <>
                                <UserCircle className="h-4 w-4 opacity-50 shrink-0" />
                                <span className="text-muted-foreground">Selecionar professor...</span>
                            </>
                        )}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-30 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0 z-[60] rounded-xl border-brand-primary/10 shadow-lg"
                align="start"
            >
                <div className="max-h-[280px] overflow-y-auto p-1">
                    {loading && teachers.length === 0 && (
                        <p className="text-xs text-brand-primary/40 p-3 text-center">A carregar...</p>
                    )}
                    {teachers.map((teacher) => (
                        <div
                            key={teacher.id}
                            className={cn(
                                "flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                                value === teacher.id
                                    ? "bg-brand-primary/5 text-brand-primary"
                                    : "hover:bg-brand-primary/[0.03] text-brand-primary/70"
                            )}
                            onClick={() => { onChange(teacher.id, teacher.name); setOpen(false); }}
                        >
                            <TeacherAvatar src={teacher.avatar_url} name={teacher.name} size="md" />
                            <span className="flex-1 text-sm font-medium truncate">{teacher.name}</span>
                            {teacher.id === currentUserId && (
                                <span className="text-[10px] text-brand-primary/40 shrink-0">Tu</span>
                            )}
                            {value === teacher.id && (
                                <Check className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                            )}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
