"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { StudentPicker } from "./StudentPicker";
import { SubjectPicker, SubjectInfo } from "./SubjectPicker";
import { StudentInfo } from "./StudentHoverCard";
import { CalendarDays, Clock, Trash2, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface SessionFormData {
    id?: string;
    title?: string;
    date: Date;
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    students: StudentInfo[];
    subjects: SubjectInfo[];
    teacherNotes?: string;
}

interface SessionFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialData?: SessionFormData | null;
    onSubmit: (data: SessionFormData) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

function formatTimeInput(value: string, isDeleting: boolean, isFocused: boolean): string {
    const hasColon = value.includes(":");
    
    // If user manually typed a colon, ALWAYS preserve it and format around it
    // This prevents "2:30" from being treated as "23"
    if (hasColon) {
        const parts = value.split(":");
        const beforeColon = parts[0].replace(/\D/g, "").slice(0, 2);
        const afterColon = parts.length > 1 ? parts[1].replace(/\D/g, "").slice(0, 2) : "";
        
        if (beforeColon.length === 0) {
            // No digits before colon, but colon exists - might be deleting
            if (isFocused && isDeleting) {
                return ""; // User deleted everything before colon
            }
            return ":"; // Just colon, keep it
        }
        
        // When focused and deleting: if we only have hours (no minutes), remove colon
        if (isFocused && isDeleting && afterColon.length === 0 && beforeColon.length <= 2) {
            return beforeColon; // No colon when editing and only hours remain
        }
        
        // Format with colon preserved
        if (beforeColon.length === 1) {
            return `${beforeColon}:${afterColon}`; // Single digit before colon: "2:30"
        }
        // Two digits before colon
        if (afterColon.length === 0) {
            return `${beforeColon}:`; // User typed "12:", show it
        }
        return `${beforeColon}:${afterColon}`; // Full format "12:30"
    }
    
    // No colon - normal formatting
    const digits = value.replace(/\D/g, "");
    const limited = digits.slice(0, 4);
    
    // When focused and typing: if user explicitly removed colon, don't add it back
    if (isFocused && !isDeleting && limited.length === 2) {
        return limited; // User deleted colon, keep it removed
    }
    
    // Normal formatting: show colon when we have 2+ digits
    if (limited.length === 0) return "";
    if (limited.length === 1) return limited;
    if (limited.length === 2) return `${limited}:`;
    return `${limited.slice(0, 2)}:${limited.slice(2)}`;
}

function normalizeTime(value: string): string {
    // If value already has a colon, preserve the structure
    if (value.includes(":")) {
        const parts = value.split(":");
        const beforeColon = parts[0].replace(/\D/g, "");
        const afterColon = parts.length > 1 ? parts[1].replace(/\D/g, "") : "";
        
        if (beforeColon.length === 0) {
            return ""; // No hours, invalid
        }
        
        // Pad hours to 2 digits
        const hours = beforeColon.padStart(2, "0");
        const hourNum = parseInt(hours, 10);
        const validHours = Math.min(Math.max(0, hourNum), 23).toString().padStart(2, "0");
        
        // Pad minutes to 2 digits (default to 00 if empty)
        const minutes = afterColon.length > 0 ? afterColon.padStart(2, "0") : "00";
        const minuteNum = parseInt(minutes, 10);
        const validMinutes = Math.min(Math.max(0, minuteNum), 59).toString().padStart(2, "0");
        
        return `${validHours}:${validMinutes}`;
    }
    
    // No colon - extract all digits and format
    const digits = value.replace(/\D/g, "");
    if (digits.length === 0) return "";
    
    // If only 1-2 digits (hours), pad to HH:00
    if (digits.length <= 2) {
        const hours = digits.padStart(2, "0");
        const hourNum = parseInt(hours, 10);
        if (hourNum > 23) {
            return "23:00";
        }
        return `${hours}:00`;
    }
    
    // Format as HH:MM
    const hours = digits.slice(0, 2).padStart(2, "0");
    const minutes = digits.slice(2, 4).padStart(2, "0");
    
    const hourNum = parseInt(hours, 10);
    const minuteNum = parseInt(minutes, 10);
    
    const validHours = Math.min(Math.max(0, hourNum), 23).toString().padStart(2, "0");
    const validMinutes = Math.min(Math.max(0, minuteNum), 59).toString().padStart(2, "0");
    
    return `${validHours}:${validMinutes}`;
}

interface TimeInputProps {
    value: string; // HH:MM format
    onChange: (value: string) => void;
    placeholder?: string;
}

function TimeInput({ value, onChange, placeholder = "12:30" }: TimeInputProps) {
    const [displayValue, setDisplayValue] = useState(value);
    const [isFocused, setIsFocused] = useState(false);
    const prevValueRef = useRef(value);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync display value when value prop changes
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
        
        // Only normalize if user typed full time (HH:MM)
        if (currentDigits.length === 4) {
            const normalized = normalizeTime(formatted);
            setDisplayValue(normalized);
            prevValueRef.current = normalized;
            onChange(normalized);
        }
    };

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
        
        // Auto-complete on blur: "12" or "12:" -> "12:00"
        if (displayValue.trim()) {
            const normalized = normalizeTime(displayValue);
            setDisplayValue(normalized);
            onChange(normalized);
        } else {
            onChange("");
        }
    };


    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Allow backspace and delete to work normally
        if (e.key === "Backspace" || e.key === "Delete") {
            return;
        }
        // Allow navigation keys
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Home", "End"].includes(e.key)) {
            return;
        }
        // Allow Ctrl/Cmd combinations
        if (e.ctrlKey || e.metaKey) {
            return;
        }
        // Allow colon (user can type ":")
        if (e.key === ":" || (e.shiftKey && e.key === ";")) {
            return;
        }
        // Only allow digits
        if (!/[0-9]/.test(e.key)) {
            e.preventDefault();
        }
    };

    return (
        <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={5}
            className="w-full pl-9 pr-3 h-10 rounded-xl border-2 border-brand-primary/15 bg-white text-sm font-medium text-brand-primary shadow-sm transition-all placeholder:text-brand-primary/30 focus-visible:outline-none focus-visible:border-brand-accent/40 focus-visible:ring-2 focus-visible:ring-brand-accent/10"
        />
    );
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
    };
}

export function SessionFormDialog({
    open,
    onOpenChange,
    initialData,
    onSubmit,
    onDelete,
}: SessionFormDialogProps) {
    const isEditing = Boolean(initialData?.id);
    const [formData, setFormData] = useState<SessionFormData>(() =>
        getDefaultFormData(initialData)
    );
    const [submitting, setSubmitting] = useState(false);
    const [timeError, setTimeError] = useState<string | null>(null);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setFormData(getDefaultFormData(initialData));
            setTimeError(null);
        }
    }, [open, initialData]);

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
            <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto font-satoshi p-0 gap-0 overflow-hidden rounded-2xl bg-white border-none shadow-xl">
                {/* Header */}
                <div className="px-8 py-6 pb-2">
                    <DialogTitle className="font-instrument text-brand-primary text-3xl font-normal">
                        {isEditing ? "Editar Sessão" : "Nova Sessão"}
                    </DialogTitle>
                    <DialogDescription className="text-brand-primary/50 mt-1 text-base">
                        {isEditing
                            ? "Sessão agendada"
                            : "Preenche os detalhes abaixo para agendar."}
                    </DialogDescription>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 px-8 pb-8 gap-8">
                    {/* Left Column: Logistics */}
                    <div className="space-y-6 min-w-0">
                        {/* Date */}
                        <div className="space-y-2">
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
                                            format(formData.date, "EEEE, d 'de' MMMM", { locale: pt })
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

                        {/* Time */}
                        <div className="space-y-2">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold flex justify-between">
                                Horário
                                {timeError && <span className="text-brand-error normal-case tracking-normal font-medium">{timeError}</span>}
                            </Label>
                            <div className="flex items-center gap-3">
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

                        {/* Title */}
                        <div className="space-y-2 pt-1">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                                Título (Opcional)
                            </Label>
                            <Input
                                value={formData.title || ""}
                                onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                                placeholder="Ex: Revisão de Matéria"
                                className="font-satoshi border-2 border-brand-primary/15 shadow-sm focus-visible:ring-brand-accent/10 focus-visible:border-brand-accent/40"
                            />
                        </div>
                    </div>

                    {/* Right Column: Participants & Details */}
                    <div className="space-y-6 min-w-0">
                        {/* Students */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                                    Alunos <span className="text-brand-error">*</span>
                                </Label>
                                {formData.students.length === 0 && (
                                    <p className="text-xs text-brand-primary/40 font-medium shrink-0">
                                        Adiciona pelo menos um aluno
                                    </p>
                                )}
                            </div>
                            <StudentPicker
                                value={formData.students}
                                onChange={(students) => setFormData((f) => ({ ...f, students }))}
                            />
                        </div>

                        {/* Subjects */}
                        <div className="space-y-2">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                                Disciplinas
                            </Label>
                            <SubjectPicker
                                value={formData.subjects}
                                onChange={(subjects) => setFormData((f) => ({ ...f, subjects }))}
                            />
                        </div>

                        {/* Notes */}
                        <div className="space-y-2 flex-1">
                            <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                                Notas da Sessão
                            </Label>
                            <Textarea
                                value={formData.teacherNotes || ""}
                                onChange={(e) => setFormData((f) => ({ ...f, teacherNotes: e.target.value }))}
                                placeholder="Notas visíveis para ti e para os alunos..."
                                className="font-satoshi resize-none min-h-[100px] border-2 border-brand-primary/15 shadow-sm focus-visible:ring-brand-accent/10 focus-visible:border-brand-accent/40"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div
                    data-dialog-footer
                    className="px-8 py-5 bg-gray-50/50 flex items-center justify-between mt-auto"
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
                            disabled={submitting || formData.students.length === 0 || !!timeError}
                            className="bg-brand-primary hover:bg-brand-primary/90 text-white h-10 px-6 min-w-[120px] shadow-sm shadow-brand-primary/20 rounded-lg font-medium"
                        >
                            {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                isEditing ? "Guardar" : "Agendar"
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
