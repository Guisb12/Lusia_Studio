"use client";

import React, { useMemo, useState } from "react";
import { format, getDay } from "date-fns";
import { pt } from "date-fns/locale";
import { Check, ChevronDown, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
    defaultEndDate,
    formatRecurrenceLabel,
    formatRecurrencePresetHint,
    generateRecurrenceDates,
    nthWeekdayInMonth,
    RecurrenceFreq,
    RecurrenceInfo,
    RecurrenceRule,
    toISODateString,
} from "@/lib/recurrence";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecurrencePickerProps {
    value: RecurrenceInfo | null;
    onChange: (info: RecurrenceInfo | null) => void;
    anchorDate: Date;
}

// ── Preset definition ─────────────────────────────────────────────────────────

interface Preset {
    id: string;
    label: string;
    hint?: string;
    rule: RecurrenceRule | null; // null = "no repeat"
}

function buildPresets(anchorDate: Date, endDate: string): Preset[] {
    const dow = (getDay(anchorDate) + 6) % 7; // 0=Mon..6=Sun
    const dayNum = anchorDate.getDate();
    const { nth, weekday } = nthWeekdayInMonth(anchorDate);

    return [
        {
            id: "none",
            label: "Não repetir",
            hint: undefined,
            rule: null,
        },
        {
            id: "daily",
            label: "Todo dia",
            hint: undefined,
            rule: { freq: "daily" as RecurrenceFreq, end_date: endDate },
        },
        {
            id: "weekdays",
            label: "Todos os dias úteis",
            hint: "seg – sex",
            rule: { freq: "weekdays" as RecurrenceFreq, end_date: endDate },
        },
        {
            id: "weekly",
            label: "Toda semana",
            hint: formatRecurrencePresetHint({ freq: "weekly", end_date: endDate }, anchorDate),
            rule: { freq: "weekly" as RecurrenceFreq, days_of_week: [dow], end_date: endDate },
        },
        {
            id: "biweekly",
            label: "A cada 2 semanas",
            hint: formatRecurrencePresetHint({ freq: "biweekly", end_date: endDate }, anchorDate),
            rule: {
                freq: "biweekly" as RecurrenceFreq,
                interval: 2,
                days_of_week: [dow],
                end_date: endDate,
            },
        },
        {
            id: "monthly_date",
            label: "Todo mês",
            hint: formatRecurrencePresetHint(
                { freq: "monthly_date", month_day: dayNum, end_date: endDate },
                anchorDate
            ),
            rule: {
                freq: "monthly_date" as RecurrenceFreq,
                month_day: dayNum,
                end_date: endDate,
            },
        },
        {
            id: "monthly_weekday",
            label: "Todo mês",
            hint: formatRecurrencePresetHint(
                { freq: "monthly_weekday", month_nth: nth, month_weekday: weekday, end_date: endDate },
                anchorDate
            ),
            rule: {
                freq: "monthly_weekday" as RecurrenceFreq,
                month_nth: nth,
                month_weekday: weekday,
                end_date: endDate,
            },
        },
        {
            id: "yearly",
            label: "Todo ano",
            hint: formatRecurrencePresetHint({ freq: "yearly", end_date: endDate }, anchorDate),
            rule: { freq: "yearly" as RecurrenceFreq, end_date: endDate },
        },
    ];
}

function getActivePresetId(rule: RecurrenceRule | null, anchorDate: Date): string {
    if (!rule) return "none";
    const { nth, weekday } = nthWeekdayInMonth(anchorDate);
    const dow = (getDay(anchorDate) + 6) % 7;
    switch (rule.freq) {
        case "daily": return "daily";
        case "weekdays": return "weekdays";
        case "weekly": return "weekly";
        case "biweekly": return "biweekly";
        case "monthly_date": return "monthly_date";
        case "monthly_weekday": return "monthly_weekday";
        case "yearly": return "yearly";
        case "custom": return "custom";
        default: return "none";
    }
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RecurrencePicker({ value, onChange, anchorDate }: RecurrencePickerProps) {
    const [open, setOpen] = useState(false);
    const [customDialogOpen, setCustomDialogOpen] = useState(false);
    const [endDatePopoverOpen, setEndDatePopoverOpen] = useState(false);

    // Derive the current end_date from the value or compute the default
    const currentEndDate = value?.rule.end_date ?? toISODateString(defaultEndDate(anchorDate));

    const presets = useMemo(
        () => buildPresets(anchorDate, currentEndDate),
        [anchorDate, currentEndDate]
    );

    const activePresetId = getActivePresetId(value?.rule ?? null, anchorDate);

    const handleSelectPreset = (preset: Preset) => {
        if (preset.id === "custom") {
            setOpen(false);
            setCustomDialogOpen(true);
            return;
        }
        onChange(preset.rule ? { rule: preset.rule } : null);
        setOpen(false);
    };

    const handleEndDateChange = (newEndDate: Date | undefined) => {
        if (!newEndDate) return;
        const newEndStr = toISODateString(newEndDate);
        setEndDatePopoverOpen(false);
        if (!value) {
            // If no rule yet, just store the end date; user will pick a freq next
            return;
        }
        onChange({ rule: { ...value.rule, end_date: newEndStr } });
    };

    const triggerLabel = value
        ? formatRecurrenceLabel(value.rule, anchorDate)
        : "Não se repete";

    const parsedEndDate = new Date(currentEndDate + "T00:00:00");

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        type="button"
                        className={cn(
                            "w-full justify-between text-left font-normal rounded-xl border-2 h-10 text-sm shadow-sm hover:bg-brand-primary/5 focus-visible:ring-2 focus-visible:ring-brand-accent/10 focus-visible:border-brand-accent/40",
                            value
                                ? "border-brand-accent/30 text-brand-primary"
                                : "border-brand-primary/15 text-brand-primary/50"
                        )}
                    >
                        <span className="flex items-center gap-2 truncate">
                            <Repeat className="h-4 w-4 opacity-50 shrink-0" />
                            <span className="truncate">{triggerLabel}</span>
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-30 shrink-0" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0 z-[60] rounded-xl border-brand-primary/10 shadow-lg"
                    align="start"
                >
                    {/* Preset list */}
                    <div className="p-1">
                        {presets.map((preset) => (
                            <div
                                key={preset.id}
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
                                    activePresetId === preset.id
                                        ? "bg-brand-primary/5 text-brand-primary"
                                        : "hover:bg-brand-primary/[0.03] text-brand-primary/70"
                                )}
                                onClick={() => handleSelectPreset(preset)}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{preset.label}</span>
                                    {preset.hint && (
                                        <span className="text-[11px] text-brand-primary/40">{preset.hint}</span>
                                    )}
                                </div>
                                {activePresetId === preset.id && (
                                    <Check className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                                )}
                            </div>
                        ))}

                        {/* Custom option */}
                        <div
                            className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors border-t border-brand-primary/5 mt-1",
                                activePresetId === "custom"
                                    ? "bg-brand-primary/5 text-brand-primary"
                                    : "hover:bg-brand-primary/[0.03] text-brand-primary/70"
                            )}
                            onClick={() => {
                                setOpen(false);
                                setCustomDialogOpen(true);
                            }}
                        >
                            <span className="text-sm font-medium">Personalizado...</span>
                            {activePresetId === "custom" && (
                                <Check className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                            )}
                        </div>
                    </div>

                    {/* End date section */}
                    {value && (
                        <div className="border-t border-brand-primary/8 px-3 py-2.5 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-brand-primary/50 font-medium">Repetir até</span>
                            <Popover open={endDatePopoverOpen} onOpenChange={setEndDatePopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        type="button"
                                        className="h-7 px-2 text-[11px] text-brand-primary font-semibold hover:bg-brand-primary/5 rounded-lg"
                                    >
                                        {format(parsedEndDate, "d MMM yyyy", { locale: pt })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[70] rounded-xl border-brand-primary/10 shadow-lg" align="end">
                                    <Calendar
                                        mode="single"
                                        selected={parsedEndDate}
                                        onSelect={handleEndDateChange}
                                        initialFocus
                                        locale={pt}
                                        weekStartsOn={1}
                                        disabled={(d) => d < anchorDate}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                </PopoverContent>
            </Popover>

            {/* Custom Recurrence Dialog */}
            <CustomRecurrenceDialog
                open={customDialogOpen}
                onOpenChange={setCustomDialogOpen}
                initialRule={value?.rule ?? null}
                anchorDate={anchorDate}
                onConfirm={(rule) => onChange({ rule })}
            />
        </>
    );
}

// ── Custom Recurrence Dialog ──────────────────────────────────────────────────

const PT_WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface CustomRecurrenceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialRule: RecurrenceRule | null;
    anchorDate: Date;
    onConfirm: (rule: RecurrenceRule) => void;
}

function CustomRecurrenceDialog({
    open,
    onOpenChange,
    initialRule,
    anchorDate,
    onConfirm,
}: CustomRecurrenceDialogProps) {
    const [interval, setInterval] = useState(
        initialRule?.freq === "custom" ? (initialRule.interval ?? 1) : 1
    );
    const [selectedDays, setSelectedDays] = useState<number[]>(() => {
        if (initialRule?.freq === "custom" && initialRule.days_of_week) {
            return initialRule.days_of_week;
        }
        const dow = (getDay(anchorDate) + 6) % 7;
        return [dow];
    });
    const [endDatePopoverOpen, setEndDatePopoverOpen] = useState(false);
    const [endDate, setEndDate] = useState<Date>(() => {
        if (initialRule?.end_date) return new Date(initialRule.end_date + "T00:00:00");
        return defaultEndDate(anchorDate);
    });

    const toggleDay = (dow: number) => {
        setSelectedDays((prev) =>
            prev.includes(dow)
                ? prev.filter((d) => d !== dow)
                : [...prev, dow].sort((a, b) => a - b)
        );
    };

    const handleConfirm = () => {
        const rule: RecurrenceRule = {
            freq: "custom",
            interval,
            days_of_week: selectedDays.length > 0 ? selectedDays : undefined,
            end_date: toISODateString(endDate),
        };
        onConfirm(rule);
        onOpenChange(false);
    };

    const preview = useMemo(() => {
        if (selectedDays.length === 0) return 0;
        const rule: RecurrenceRule = {
            freq: "custom",
            interval,
            days_of_week: selectedDays,
            end_date: toISODateString(endDate),
        };
        return generateRecurrenceDates(rule, anchorDate).length;
    }, [interval, selectedDays, endDate, anchorDate]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm font-satoshi p-0 gap-0 rounded-2xl bg-white border-none shadow-xl z-[70]">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="font-instrument text-brand-primary text-2xl font-normal">
                        Repetição personalizada
                    </DialogTitle>
                </DialogHeader>

                <div className="px-6 pb-6 space-y-5">
                    {/* Interval */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                            Repetir a cada
                        </Label>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center border-2 border-brand-primary/15 rounded-xl overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setInterval((v) => Math.max(1, v - 1))}
                                    className="px-3 h-10 text-brand-primary/50 hover:bg-brand-primary/5 transition-colors text-lg"
                                >
                                    −
                                </button>
                                <span className="px-3 min-w-[2rem] text-center text-sm font-semibold text-brand-primary">
                                    {interval}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setInterval((v) => Math.min(52, v + 1))}
                                    className="px-3 h-10 text-brand-primary/50 hover:bg-brand-primary/5 transition-colors text-lg"
                                >
                                    +
                                </button>
                            </div>
                            <span className="text-sm text-brand-primary/60">
                                semana{interval > 1 ? "s" : ""}
                            </span>
                        </div>
                    </div>

                    {/* Days of week */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                            Nos dias
                        </Label>
                        <div className="flex gap-1.5 flex-wrap">
                            {PT_WEEKDAY_SHORT.map((label, dow) => (
                                <button
                                    key={dow}
                                    type="button"
                                    onClick={() => toggleDay(dow)}
                                    className={cn(
                                        "h-9 min-w-[38px] px-2 rounded-lg text-[11px] font-semibold border-2 transition-all",
                                        selectedDays.includes(dow)
                                            ? "bg-brand-primary text-white border-brand-primary"
                                            : "bg-white text-brand-primary/50 border-brand-primary/15 hover:border-brand-primary/30"
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* End date */}
                    <div className="space-y-2">
                        <Label className="text-brand-primary/60 text-[11px] uppercase tracking-widest font-bold">
                            Repetir até
                        </Label>
                        <Popover open={endDatePopoverOpen} onOpenChange={setEndDatePopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    type="button"
                                    className="w-full justify-start text-left font-normal rounded-xl border-2 border-brand-primary/15 h-10 text-sm shadow-sm hover:bg-brand-primary/5"
                                >
                                    {format(endDate, "d 'de' MMMM yyyy", { locale: pt })}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 z-[80] rounded-xl border-brand-primary/10 shadow-lg" align="start">
                                <Calendar
                                    mode="single"
                                    selected={endDate}
                                    onSelect={(d) => {
                                        if (d) { setEndDate(d); setEndDatePopoverOpen(false); }
                                    }}
                                    initialFocus
                                    locale={pt}
                                    weekStartsOn={1}
                                    disabled={(d) => d < anchorDate}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Preview */}
                    {preview > 0 && (
                        <p className="text-xs text-brand-primary/50 bg-brand-primary/[0.03] rounded-lg px-3 py-2">
                            Vai criar <span className="font-semibold text-brand-primary">{preview}</span>{" "}
                            sessão{preview !== 1 ? "ões" : ""}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 text-brand-primary/60 hover:text-brand-primary hover:bg-brand-primary/5 h-10"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleConfirm}
                            disabled={selectedDays.length === 0}
                            className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white h-10 rounded-lg font-medium"
                        >
                            Aplicar
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
