"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { StudentPicker } from "@/components/calendar/StudentPicker";
import { StudentInfo } from "@/components/calendar/StudentHoverCard";
import { Artifact, fetchArtifacts } from "@/lib/artifacts";
import { Assignment, createAssignment, AssignmentCreate } from "@/lib/assignments";
import { cn } from "@/lib/utils";
import { CalendarDays, Check, ChevronDown, Clock, X } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { HugeiconsIcon } from "@hugeicons/react";
import { Quiz02Icon, Note01Icon, Pdf01Icon } from "@hugeicons/core-free-icons";

// ── Artifact icon ─────────────────────────────────────────────

function ArtifactIcon({ type, size = 14 }: { type: string | undefined; size?: number }) {
    if (type === "quiz") return <HugeiconsIcon icon={Quiz02Icon} size={size} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    if (type === "pdf") return <HugeiconsIcon icon={Pdf01Icon} size={size} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
    return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} className="text-brand-primary/60" />;
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
    preselectedArtifactId?: string | null;
}

export function CreateAssignmentDialog({
    open,
    onOpenChange,
    onCreated,
    preselectedArtifactId,
}: CreateAssignmentDialogProps) {
    const [title, setTitle] = useState("");
    const [instructions, setInstructions] = useState("");
    const [artifactId, setArtifactId] = useState<string | null>(preselectedArtifactId ?? null);
    const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
    const [dueTime, setDueTime] = useState("23:59");
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [artifactPopoverOpen, setArtifactPopoverOpen] = useState(false);
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [saving, setSaving] = useState(false);
    const [selectedStudents, setSelectedStudents] = useState<StudentInfo[]>([]);

    useEffect(() => {
        if (open) fetchArtifacts().then(setArtifacts).catch(() => setArtifacts([]));
    }, [open]);

    useEffect(() => {
        if (open && preselectedArtifactId) setArtifactId(preselectedArtifactId);
    }, [open, preselectedArtifactId]);

    useEffect(() => {
        if (!open) {
            setTitle("");
            setInstructions("");
            setArtifactId(null);
            setDueDate(undefined);
            setDueTime("23:59");
            setSelectedStudents([]);
        }
    }, [open]);

    const selectedArtifact = artifacts.find((a) => a.id === artifactId) ?? null;

    const handleSave = async () => {
        setSaving(true);
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
                artifact_id: artifactId || undefined,
                student_ids: selectedStudents.length > 0 ? selectedStudents.map((s) => s.id) : undefined,
                due_date: dueDateISO,
                status: "published",
            };
            const created = await createAssignment(data);
            onOpenChange(false);
            onCreated(created);
        } catch (e) {
            console.error("Failed to create assignment:", e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-instrument font-normal text-brand-primary">
                        Novo TPC
                    </DialogTitle>
                </DialogHeader>

                <div className="py-2 space-y-5">
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

                    {/* Artifact */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/80">
                            Documento associado
                            <span className="text-brand-primary/30 font-normal ml-1">(opcional)</span>
                        </Label>
                        <Popover open={artifactPopoverOpen} onOpenChange={setArtifactPopoverOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-input bg-background hover:bg-brand-primary/[0.03] transition-colors text-sm text-left"
                                >
                                    {selectedArtifact ? (
                                        <>
                                            <ArtifactIcon type={selectedArtifact.artifact_type} size={15} />
                                            <span className="flex-1 truncate text-brand-primary">{selectedArtifact.artifact_name}</span>
                                            <span className="text-[10px] text-brand-primary/30 capitalize shrink-0">{selectedArtifact.artifact_type}</span>
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />
                                            <span className="flex-1 text-brand-primary/40">Selecionar documento...</span>
                                        </>
                                    )}
                                    {selectedArtifact && (
                                        <span
                                            role="button"
                                            onClick={(e) => { e.stopPropagation(); setArtifactId(null); }}
                                            className="shrink-0 p-0.5 rounded hover:bg-brand-primary/10 transition-colors"
                                        >
                                            <X className="h-3 w-3 text-brand-primary/40" />
                                        </span>
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1.5" align="start">
                                <div className="max-h-52 overflow-y-auto space-y-0.5">
                                    {artifacts.length === 0 && (
                                        <p className="text-xs text-brand-primary/40 text-center py-4">Sem documentos disponíveis</p>
                                    )}
                                    {artifacts.map((a) => (
                                        <button
                                            key={a.id}
                                            type="button"
                                            onClick={() => { setArtifactId(a.id); setArtifactPopoverOpen(false); }}
                                            className={cn(
                                                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left",
                                                artifactId === a.id
                                                    ? "bg-brand-primary/8 text-brand-primary"
                                                    : "hover:bg-brand-primary/[0.04] text-brand-primary/80",
                                            )}
                                        >
                                            <div className="h-7 w-7 rounded-md bg-brand-primary/5 flex items-center justify-center shrink-0">
                                                <ArtifactIcon type={a.artifact_type} size={15} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate text-xs font-medium leading-tight">{a.artifact_name}</p>
                                                <p className="text-[10px] text-brand-primary/40 capitalize leading-tight mt-0.5">{a.artifact_type}</p>
                                            </div>
                                            {artifactId === a.id && <Check className="h-3.5 w-3.5 text-brand-primary shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Due date + time — always visible, side by side */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/80">Data de entrega</Label>
                        <div className="flex items-center gap-2">
                            {/* Date picker */}
                            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className={cn(
                                            "flex-1 flex items-center gap-2 px-3 h-10 rounded-xl border-2 border-brand-primary/15 bg-white text-sm shadow-sm transition-all hover:bg-brand-primary/[0.03]",
                                            dueDate ? "text-brand-primary font-medium" : "text-brand-primary/40",
                                        )}
                                    >
                                        <CalendarDays className="h-4 w-4 shrink-0 text-brand-primary/30" />
                                        <span className="truncate">
                                            {dueDate
                                                ? format(dueDate, "d 'de' MMM, yyyy", { locale: pt })
                                                : "Selecionar data..."}
                                        </span>
                                        {dueDate && (
                                            <span
                                                role="button"
                                                onClick={(e) => { e.stopPropagation(); setDueDate(undefined); }}
                                                className="ml-auto shrink-0 p-0.5 rounded hover:bg-brand-primary/10"
                                            >
                                                <X className="h-3 w-3 text-brand-primary/40" />
                                            </span>
                                        )}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 rounded-xl border-brand-primary/10 shadow-lg" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={dueDate}
                                        onSelect={(d) => { setDueDate(d); setCalendarOpen(false); }}
                                        disabled={(date) => {
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            return date < today;
                                        }}
                                        locale={pt}
                                        weekStartsOn={1}
                                    />
                                </PopoverContent>
                            </Popover>

                            {/* Time input */}
                            <div className="relative w-28 shrink-0">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-primary/30 pointer-events-none" />
                                <TimeInput value={dueTime} onChange={setDueTime} placeholder="23:59" />
                            </div>
                        </div>
                    </div>

                    {/* Students */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/80">Alunos</Label>
                        <StudentPicker
                            value={selectedStudents}
                            onChange={setSelectedStudents}
                            dropUp
                            enableClassFilter
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleSave}
                        disabled={saving || !title.trim()}
                        className="w-full"
                    >
                        {saving ? "A criar..." : "Publicar TPC"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
