"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { PickerScrollBody } from "@/components/ui/picker-scroll-body";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StudentPicker } from "@/components/calendar/StudentPicker";
import { StudentInfo } from "@/components/calendar/StudentHoverCard";
import { Artifact } from "@/lib/artifacts";
import { Assignment, ArtifactMeta, createAssignment, AssignmentCreate, GRADABLE_ARTIFACT_TYPES } from "@/lib/assignments";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronDown, ChevronUp, Clock, Loader2, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { HugeiconsIcon } from "@hugeicons/react";
import { Quiz02Icon, Note01Icon, Pdf01Icon, LicenseDraftIcon } from "@hugeicons/core-free-icons";
import { ARTIFACT_TYPES } from "@/lib/artifacts";
import { useDocArtifactsQuery } from "@/lib/queries/docs";

const MAX_ATTACHMENTS = 3;

// ── Artifact icon (matches DocsDataTable) ────────────────────

function ArtifactIcon({ artifact, size = 15 }: { artifact: Artifact | ArtifactMeta; size?: number }) {
    const cls = "text-brand-primary/60";
    if (artifact.artifact_type === "note")
        return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} className={cls} />;
    if (artifact.artifact_type === "quiz")
        return <HugeiconsIcon icon={Quiz02Icon} size={size} color="currentColor" strokeWidth={1.5} className={cls} />;
    if (artifact.artifact_type === "exercise_sheet")
        return <HugeiconsIcon icon={LicenseDraftIcon} size={size} color="currentColor" strokeWidth={1.5} className={cls} />;
    if (artifact.artifact_type === "uploaded_file") {
        const ext = ("storage_path" in artifact ? artifact.storage_path : "")?.split(".").pop()?.toLowerCase() ?? "";
        if (ext === "pdf")
            return <HugeiconsIcon icon={Pdf01Icon} size={size} color="currentColor" strokeWidth={1.5} className={cls} />;
        if (ext === "doc" || ext === "docx")
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} className={cls} />;
    }
    const emoji = artifact.icon ?? ARTIFACT_TYPES.find((t) => t.value === artifact.artifact_type)?.icon ?? "📄";
    return <span className="text-sm">{emoji}</span>;
}

// ── Time input (same pattern as SessionFormDialog) ────────────

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
        const validHours = Math.min(Math.max(0, parseInt(hours, 10)), 23).toString().padStart(2, "0");
        const minutes = afterColon.length > 0 ? afterColon.padStart(2, "0") : "00";
        const validMinutes = Math.min(Math.max(0, parseInt(minutes, 10)), 59).toString().padStart(2, "0");
        return `${validHours}:${validMinutes}`;
    }
    const digits = value.replace(/\D/g, "");
    if (digits.length === 0) return "";
    if (digits.length <= 2) {
        const hours = digits.padStart(2, "0");
        return parseInt(hours, 10) > 23 ? "23:00" : `${hours}:00`;
    }
    const validHours = Math.min(Math.max(0, parseInt(digits.slice(0, 2), 10)), 23).toString().padStart(2, "0");
    const validMinutes = Math.min(Math.max(0, parseInt(digits.slice(2, 4), 10)), 59).toString().padStart(2, "0");
    return `${validHours}:${validMinutes}`;
}

function TimeInput({ value, onChange, placeholder = "23:59" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
    const [displayValue, setDisplayValue] = useState(value);
    const [isFocused, setIsFocused] = useState(false);
    const prevValueRef = useRef(value);

    useEffect(() => {
        setDisplayValue(value);
        prevValueRef.current = value;
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value;
        const prevDigits = prevValueRef.current.replace(/\D/g, "");
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
        if (["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Home", "End"].includes(e.key)) return;
        if (e.ctrlKey || e.metaKey) return;
        if (e.key === ":" || (e.shiftKey && e.key === ";")) return;
        if (!/[0-9]/.test(e.key)) e.preventDefault();
    };

    return (
        <input
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

// ── Dialog ────────────────────────────────────────────────────

interface CreateAssignmentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (assignment: Assignment) => void;
    preselectedArtifact?: Artifact | null;
    /** @deprecated Use preselectedArtifact instead */
    preselectedArtifactId?: string | null;
    /** Teacher's primary class ID — scopes student picker default list. */
    primaryClassId?: string | null;
}

const RESOLVABLE_TYPES = new Set(["quiz", "exercise_sheet"]);

export function CreateAssignmentDialog({
    open,
    onOpenChange,
    onCreated,
    preselectedArtifact,
    preselectedArtifactId,
    primaryClassId,
}: CreateAssignmentDialogProps) {
    const [title, setTitle] = useState("");
    const [instructions, setInstructions] = useState("");
    const [selectedArtifacts, setSelectedArtifacts] = useState<Artifact[]>([]);
    const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
    const [dueTime, setDueTime] = useState("23:59");
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [artifactPopoverOpen, setArtifactPopoverOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedStudents, setSelectedStudents] = useState<StudentInfo[]>([]);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const { data: artifacts = [] } = useDocArtifactsQuery();

    useEffect(() => {
        if (!open) return;
        const artifact = preselectedArtifact;
        const id = artifact?.id ?? preselectedArtifactId ?? null;
        if (id && artifact) {
            setSelectedArtifacts([artifact]);
            if (RESOLVABLE_TYPES.has(artifact.artifact_type)) {
                setTitle(`Resolver ${artifact.artifact_name}`);
            }
        } else if (id) {
            const found = artifacts.find((a) => a.id === id);
            if (found) {
                setSelectedArtifacts([found]);
                if (RESOLVABLE_TYPES.has(found.artifact_type)) {
                    setTitle(`Resolver ${found.artifact_name}`);
                }
            }
        }
    }, [open, preselectedArtifact, preselectedArtifactId, artifacts]);

    useEffect(() => {
        if (!open) {
            setTitle("");
            setInstructions("");
            setSelectedArtifacts([]);
            setDueDate(undefined);
            setDueTime("23:59");
            setSelectedStudents([]);
            setError(null);
            setDragIndex(null);
        }
    }, [open]);

    const selectedIds = new Set(selectedArtifacts.map((a) => a.id));
    const availableArtifacts = artifacts.filter((a) => !selectedIds.has(a.id));
    const canAddMore = selectedArtifacts.length < MAX_ATTACHMENTS;

    const addArtifact = useCallback((artifact: Artifact) => {
        setSelectedArtifacts((prev) => {
            if (prev.length >= MAX_ATTACHMENTS) return prev;
            if (prev.some((a) => a.id === artifact.id)) return prev;
            return [...prev, artifact];
        });
        setArtifactPopoverOpen(false);
    }, []);

    const removeArtifact = useCallback((id: string) => {
        setSelectedArtifacts((prev) => prev.filter((a) => a.id !== id));
    }, []);

    const moveArtifact = useCallback((fromIndex: number, toIndex: number) => {
        setSelectedArtifacts((prev) => {
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            let dueDateISO: string | undefined;
            if (dueDate) {
                const [h, m] = dueTime.split(":").map(Number);
                const d = new Date(dueDate);
                d.setHours(isNaN(h) ? 23 : h, isNaN(m) ? 59 : m, 0, 0);
                dueDateISO = d.toISOString();
            }
            const data: AssignmentCreate = {
                title: title.trim() || undefined,
                instructions: instructions.trim() || undefined,
                artifact_ids: selectedArtifacts.length > 0 ? selectedArtifacts.map((a) => a.id) : undefined,
                student_ids: selectedStudents.length > 0 ? selectedStudents.map((s) => s.id) : undefined,
                due_date: dueDateISO,
                status: "published",
            };
            const created = await createAssignment(data);
            onOpenChange(false);
            onCreated(created);
        } catch (e) {
            console.error("Failed to create assignment:", e);
            setError("Erro ao criar o TPC. Por favor, tenta novamente.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 rounded-2xl border-none bg-white p-0 font-satoshi shadow-xl sm:max-w-2xl sm:max-h-[calc(100dvh-2rem)]">
                {/* ── Header ── */}
                <div className="shrink-0 px-6 pt-4 pb-2 sm:px-8">
                    <DialogTitle className="font-instrument text-brand-primary text-[28px] leading-none font-normal">
                        Novo TPC
                    </DialogTitle>
                </div>

                {/* ── Body ── */}
                <AppScrollArea className="min-h-0 flex-1" viewportClassName="h-full px-6 pb-5 sm:px-8" showFadeMasks desktopScrollbarOnly interactiveScrollbar>
                    <div className="space-y-5">
                        {/* Title */}
                        <div className="space-y-2">
                            <Label className="text-brand-primary/80">Título</Label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ex: Exercícios de Matemática — Cap. 5"
                                autoFocus
                            />
                        </div>

                        {/* Instructions */}
                        <div className="space-y-2">
                            <Label className="text-brand-primary/80">Instruções</Label>
                            <Textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="Ex: Resolver os exercícios 1 a 15 do manual..."
                                rows={3}
                                className="resize-none"
                            />
                        </div>

                        {/* Artifacts (multi-select, ordered) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-brand-primary/80">
                                    Documentos
                                    <span className="text-brand-primary/30 font-normal ml-1">(até {MAX_ATTACHMENTS})</span>
                                </Label>
                                {selectedArtifacts.length > 0 && canAddMore && (
                                    <Popover open={artifactPopoverOpen} onOpenChange={setArtifactPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <button type="button"
                                                className="flex items-center gap-1 text-[11px] text-brand-primary/40 hover:text-brand-primary/70 transition-colors">
                                                <Plus className="h-3 w-3" />
                                                Adicionar
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72 p-0" align="end"
                                            onOpenAutoFocus={(e) => e.preventDefault()}>
                                            <PickerScrollBody maxHeight={220}>
                                                {availableArtifacts.length === 0 && (
                                                    <p className="text-xs text-brand-primary/40 text-center py-4">
                                                        {artifacts.length === 0 ? "Sem documentos disponíveis" : "Todos os documentos já foram adicionados"}
                                                    </p>
                                                )}
                                                {availableArtifacts.map((a) => (
                                                    <button key={a.id} type="button" onClick={() => addArtifact(a)}
                                                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors text-left hover:bg-brand-primary/[0.04] text-brand-primary/80">
                                                        <div className="h-7 w-7 rounded-md bg-brand-primary/5 flex items-center justify-center shrink-0">
                                                            <ArtifactIcon artifact={a} size={15} />
                                                        </div>
                                                        <p className="flex-1 min-w-0 truncate text-xs font-medium">{a.artifact_name}</p>
                                                    </button>
                                                ))}
                                            </PickerScrollBody>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>

                            {/* No artifacts yet — full add button */}
                            {selectedArtifacts.length === 0 && (
                                <Popover open={artifactPopoverOpen} onOpenChange={setArtifactPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <button type="button"
                                            className="w-full flex items-center gap-2 h-9 px-3 rounded-xl border-2 border-dashed border-brand-primary/15 hover:border-brand-primary/25 hover:bg-brand-primary/[0.02] transition-colors text-left">
                                            <Plus className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
                                            <span className="text-brand-primary/35 text-sm">Adicionar documento...</span>
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start"
                                        onOpenAutoFocus={(e) => e.preventDefault()}>
                                        <PickerScrollBody maxHeight={220}>
                                            {availableArtifacts.length === 0 && (
                                                <p className="text-xs text-brand-primary/40 text-center py-4">Sem documentos disponíveis</p>
                                            )}
                                            {availableArtifacts.map((a) => (
                                                <button key={a.id} type="button" onClick={() => addArtifact(a)}
                                                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors text-left hover:bg-brand-primary/[0.04] text-brand-primary/80">
                                                    <div className="h-7 w-7 rounded-md bg-brand-primary/5 flex items-center justify-center shrink-0">
                                                        <ArtifactIcon artifact={a} size={15} />
                                                    </div>
                                                    <p className="flex-1 min-w-0 truncate text-xs font-medium">{a.artifact_name}</p>
                                                </button>
                                            ))}
                                        </PickerScrollBody>
                                    </PopoverContent>
                                </Popover>
                            )}

                            {/* Selected artifacts */}
                            {selectedArtifacts.length > 0 && (
                                <div className="space-y-1">
                                    {selectedArtifacts.map((artifact, index) => (
                                        <div key={artifact.id}
                                            className="flex items-center gap-2 h-9 px-3 rounded-xl border-2 border-brand-primary/15 bg-white group">
                                            <ArtifactIcon artifact={artifact} size={14} />
                                            <span className="flex-1 min-w-0 truncate text-sm text-brand-primary">
                                                {artifact.artifact_name}
                                            </span>
                                            {/* Arrows */}
                                            {selectedArtifacts.length > 1 && (
                                                <div className="flex items-center shrink-0 -mr-1">
                                                    <button type="button" disabled={index === 0}
                                                        onClick={() => moveArtifact(index, index - 1)}
                                                        className="p-0.5 rounded text-brand-primary/20 hover:text-brand-primary/50 disabled:text-brand-primary/8 transition-colors">
                                                        <ChevronUp className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button type="button" disabled={index === selectedArtifacts.length - 1}
                                                        onClick={() => moveArtifact(index, index + 1)}
                                                        className="p-0.5 rounded text-brand-primary/20 hover:text-brand-primary/50 disabled:text-brand-primary/8 transition-colors">
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                            <button type="button" onClick={() => removeArtifact(artifact.id)}
                                                className="shrink-0 p-0.5 rounded text-brand-primary/15 opacity-0 group-hover:opacity-100 hover:text-brand-primary/50 transition-all">
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Ordering hint */}
                            {selectedArtifacts.length > 1 && (
                                <p className="text-[10px] text-brand-primary/35 italic pl-1">
                                    Os alunos verão os documentos pela ordem definida acima.
                                </p>
                            )}

                        </div>

                        {/* Due date + time */}
                        <div className="space-y-2">
                            <Label className="text-brand-primary/80">Data de entrega</Label>
                            <div className="flex items-center gap-2">
                                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                    <PopoverTrigger asChild>
                                        <button type="button"
                                            className={cn(
                                                "flex-1 flex items-center gap-2 px-3 h-10 rounded-xl border-2 border-brand-primary/15 bg-white text-sm shadow-sm transition-all hover:bg-brand-primary/[0.03]",
                                                dueDate ? "text-brand-primary font-medium" : "text-brand-primary/40",
                                            )}>
                                            <CalendarDays className="h-4 w-4 shrink-0 text-brand-primary/30" />
                                            <span className="truncate">
                                                {dueDate ? format(dueDate, "d 'de' MMM, yyyy", { locale: pt }) : "Selecionar data..."}
                                            </span>
                                            {dueDate && (
                                                <span role="button" onClick={(e) => { e.stopPropagation(); setDueDate(undefined); }}
                                                    className="ml-auto shrink-0 p-0.5 rounded hover:bg-brand-primary/10">
                                                    <X className="h-3 w-3 text-brand-primary/40" />
                                                </span>
                                            )}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 rounded-xl border-brand-primary/10 shadow-lg" align="start">
                                        <Calendar
                                            mode="single" selected={dueDate}
                                            onSelect={(d) => { setDueDate(d); setCalendarOpen(false); }}
                                            disabled={(date) => { const today = new Date(); today.setHours(0, 0, 0, 0); return date < today; }}
                                            locale={pt} weekStartsOn={1}
                                        />
                                    </PopoverContent>
                                </Popover>
                                <div className="relative w-28 shrink-0">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-primary/30 pointer-events-none" />
                                    <TimeInput value={dueTime} onChange={setDueTime} placeholder="23:59" />
                                </div>
                            </div>
                        </div>

                        {/* Students */}
                        <div className="space-y-2">
                            <Label className="text-brand-primary/80">
                                Alunos
                                {selectedStudents.length === 0 && (
                                    <span className="text-red-400 font-normal ml-1 text-xs">· obrigatório</span>
                                )}
                            </Label>
                            <StudentPicker
                                value={selectedStudents}
                                onChange={setSelectedStudents}
                                dropUp
                                enableClassFilter
                                primaryClassId={primaryClassId}
                            />
                        </div>
                    </div>
                </AppScrollArea>

                {/* ── Footer ── */}
                <div className="flex shrink-0 items-center justify-between rounded-b-2xl bg-gray-50/80 px-6 py-3 sm:px-8">
                    {error && (
                        <p className="text-xs text-red-500 flex-1 min-w-0 mr-3">{error}</p>
                    )}
                    {!error && <div />}
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-brand-primary/50">
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving || !title.trim() || selectedStudents.length === 0}
                            className="gap-1.5"
                        >
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {saving ? "A criar..." : "Publicar TPC"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
