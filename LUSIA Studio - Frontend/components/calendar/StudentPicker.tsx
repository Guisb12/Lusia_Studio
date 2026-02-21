"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { StudentHoverCard, StudentInfo } from "./StudentHoverCard";
import { CourseTag } from "@/components/ui/course-tag";
import { getEducationLevelByGrade, getGradeLabel } from "@/lib/curriculum";
import { X, Search, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Grades 12→1 for ordering and filter options */
const GRADES_DESC = ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];
const COLLAPSE_THRESHOLD = 12;

interface StudentPickerProps {
    value: StudentInfo[];
    onChange: (students: StudentInfo[]) => void;
    disabled?: boolean;
    placeholder?: string;
    /** When true the results dropdown opens above the input instead of below */
    dropUp?: boolean;
}

function sortByGradeDesc(students: StudentInfo[]): StudentInfo[] {
    return [...students].sort((a, b) => {
        const ga = a.grade_level ? parseInt(a.grade_level, 10) : 0;
        const gb = b.grade_level ? parseInt(b.grade_level, 10) : 0;
        if (ga !== gb) return gb - ga; // 12 first
        return 0;
    });
}

function groupByGrade(students: StudentInfo[]): Map<string, StudentInfo[]> {
    const map = new Map<string, StudentInfo[]>();
    for (const s of students) {
        const key = s.grade_level ?? "_";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
    }
    return map;
}

export function StudentPicker({
    value = [],
    onChange,
    disabled = false,
    placeholder = "Pesquisar alunos...",
    dropUp = false,
}: StudentPickerProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<StudentInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [yearFilter, setYearFilter] = useState<string[]>([]);
    const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const fetchInitialStudents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/calendar/students/search?limit=500`);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
            }
        } catch (e) {
            console.error("Failed to load initial students:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInitialStudents();
    }, [fetchInitialStudents]);

    const searchStudents = useCallback(async (q: string) => {
        if (!q.trim()) {
            fetchInitialStudents();
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/calendar/students/search?q=${encodeURIComponent(q)}&limit=500`);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
            }
        } catch (e) {
            console.error("Student search failed:", e);
        } finally {
            setLoading(false);
        }
    }, [fetchInitialStudents]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        setHighlightedIndex(-1);
        setOpen(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchStudents(val), 250);
    };

    const addStudent = (student: StudentInfo) => {
        if (!value.find((s) => s.id === student.id)) {
            onChange([...value, student]);
        }
        setQuery("");
        inputRef.current?.focus();
    };

    const toggleStudent = (student: StudentInfo) => {
        const inValue = value.some((s) => s.id === student.id);
        if (inValue) {
            onChange(value.filter((s) => s.id !== student.id));
        } else {
            onChange([...value, student]);
        }
    };

    const removeStudent = (id: string) => {
        onChange(value.filter((s) => s.id !== id));
    };

    const toggleYearFilter = (grade: string) => {
        setYearFilter((prev) =>
            prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade].sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
        );
    };

    const toggleCollapsed = (grade: string) => {
        setCollapsedYears((prev) => {
            const next = new Set(prev);
            if (next.has(grade)) next.delete(grade);
            else next.add(grade);
            return next;
        });
    };

    const getInitials = (name?: string | null) =>
        (name || "?")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

    // Include all (selected + unselected); apply year filter; sort 12→1
    const filteredResults = useMemo(() => {
        let list = [...results];
        if (yearFilter.length > 0) {
            list = list.filter((s) => s.grade_level && yearFilter.includes(s.grade_level));
        }
        return sortByGradeDesc(list);
    }, [results, yearFilter]);

    const byYear = useMemo(() => groupByGrade(filteredResults), [filteredResults]);
    const useGroups = filteredResults.length > COLLAPSE_THRESHOLD;
    const orderedYearKeys = useGroups
        ? GRADES_DESC.filter((g) => byYear.has(g)).concat(byYear.has("_") ? ["_"] : [])
        : [];

    const flatForKeyboard = useMemo(() => {
        if (!useGroups) return filteredResults;
        const out: StudentInfo[] = [];
        for (const key of orderedYearKeys) {
            if (collapsedYears.has(key)) continue;
            out.push(...(byYear.get(key) ?? []));
        }
        return out;
    }, [useGroups, filteredResults, orderedYearKeys, collapsedYears, byYear]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev < flatForKeyboard.length - 1 ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : flatForKeyboard.length - 1));
        } else if (e.key === "Enter" && highlightedIndex >= 0 && flatForKeyboard[highlightedIndex]) {
            e.preventDefault();
            toggleStudent(flatForKeyboard[highlightedIndex]);
        } else if (e.key === "Backspace" && !query && value.length > 0) {
            removeStudent(value[value.length - 1].id);
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    const comboboxRowStyles = cn(
        "w-[calc(100%-6px)] mx-1 my-0.5 flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-lg transition-colors border border-transparent"
    );

    function renderStudentRow(student: StudentInfo, idx: number, isHighlighted: boolean, isSelected: boolean) {
        const looksHovered = isHighlighted || isSelected;
        return (
            <StudentHoverCard key={student.id} student={student} openDelay={1000}>
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        toggleStudent(student);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onMouseLeave={() => setHighlightedIndex(-1)}
                    className={cn(
                        comboboxRowStyles,
                        looksHovered
                            ? "bg-brand-accent/8 text-brand-accent border-brand-accent/20"
                            : "hover:bg-brand-primary/5 text-brand-primary hover:border-brand-primary/10"
                    )}
                >
                    <div className="h-7 w-7 rounded-full bg-brand-accent/10 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-brand-primary/5">
                        {student.avatar_url ? (
                            <Image
                                src={student.avatar_url}
                                alt=""
                                width={28}
                                height={28}
                                className="object-cover h-full w-full"
                            />
                        ) : (
                            <span className="text-[10px] font-semibold text-brand-accent">
                                {getInitials(student.full_name)}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium truncate font-satoshi">
                                {student.full_name}
                                {student.display_name && student.display_name !== student.full_name && (
                                    <span className="text-brand-primary/60 font-normal"> · {student.display_name}</span>
                                )}
                            </span>
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleStudent(student)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-lg shrink-0 border-brand-primary/30 data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent"
                            />
                        </div>
                        <div className="flex justify-between items-end gap-2 mt-0.5">
                            <div className="min-w-0">
                                {student.course &&
                                    getEducationLevelByGrade(student.grade_level ?? "")?.key === "secundario" && (
                                        <CourseTag courseKey={student.course} size="sm" />
                                    )}
                            </div>
                            {student.grade_level && (
                                <span className="text-[10px] font-medium text-brand-primary/50 tabular-nums shrink-0">
                                    {getGradeLabel(student.grade_level)}
                                </span>
                            )}
                        </div>
                    </div>
                </button>
            </StudentHoverCard>
        );
    }

    return (
        <div ref={containerRef} className="relative">
            <div
                className={cn(
                    "flex items-center gap-1.5 min-w-0 rounded-xl border-2 border-brand-primary/10 bg-white px-3 py-2 overflow-hidden",
                    "transition-all duration-200",
                    "focus-within:border-brand-accent/40 focus-within:ring-2 focus-within:ring-brand-accent/10",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => inputRef.current?.focus()}
            >
                <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                    <Search className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => {
                            setOpen(true);
                            if (query.trim()) {
                                if (debounceRef.current) clearTimeout(debounceRef.current);
                                searchStudents(query);
                            } else {
                                fetchInitialStudents();
                            }
                        }}
                        placeholder={value.length === 0 ? placeholder : "Adicionar..."}
                        disabled={disabled}
                        className="flex-1 min-w-0 bg-transparent text-sm text-brand-primary placeholder:text-brand-primary/40 outline-none font-satoshi"
                    />
                    {loading && <Loader2 className="h-3.5 w-3.5 text-brand-primary/30 animate-spin shrink-0" />}
                </div>
                {/* Selected: 1 chip, or "X alunos" with popover */}
                {value.length === 1 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        <StudentHoverCard key={value[0].id} student={value[0]}>
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/5 border border-brand-primary/10 pl-0.5 pr-1.5 py-0.5 text-brand-primary cursor-pointer group hover:bg-brand-primary/8 hover:border-brand-primary/15 transition-colors shrink-0">
                                <span className="h-5 w-5 rounded-full bg-brand-accent/10 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-brand-primary/5">
                                    {value[0].avatar_url ? (
                                        <Image
                                            src={value[0].avatar_url}
                                            alt=""
                                            width={20}
                                            height={20}
                                            className="object-cover h-full w-full"
                                        />
                                    ) : (
                                        <span className="text-[9px] font-bold text-brand-accent">{getInitials(value[0].full_name)}</span>
                                    )}
                                </span>
                                <span className="truncate max-w-[80px] text-[11px] font-medium font-satoshi">
                                    {value[0].display_name || value[0].full_name}
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeStudent(value[0].id);
                                    }}
                                    className="rounded-full p-0.5 opacity-50 hover:opacity-100 hover:bg-brand-primary/10 transition-all shrink-0"
                                    disabled={disabled}
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </span>
                        </StudentHoverCard>
                    </div>
                )}
                {value.length > 1 && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                disabled={disabled}
                                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-brand-primary/5 border border-brand-primary/10 pl-2 pr-2.5 py-1 text-[11px] font-medium font-satoshi text-brand-primary hover:bg-brand-primary/8 hover:border-brand-primary/15 transition-colors"
                            >
                                {value.length} alunos
                                <ChevronDown className="h-3 w-3 opacity-70" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="min-w-72 p-2 rounded-xl border-brand-primary/10 font-satoshi" align="start" sideOffset={4}>
                            <div className="max-h-56 overflow-y-auto space-y-0.5">
                                {value.map((student) => (
                                    <button
                                        key={student.id}
                                        type="button"
                                        onClick={() => toggleStudent(student)}
                                        className={cn(
                                            "w-full my-0.5 flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-lg transition-colors border border-transparent",
                                            "bg-brand-accent/8 text-brand-accent border-brand-accent/20 hover:bg-brand-accent/12"
                                        )}
                                    >
                                        <div className="h-7 w-7 rounded-full bg-brand-accent/10 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-brand-primary/5">
                                            {student.avatar_url ? (
                                                <Image
                                                    src={student.avatar_url}
                                                    alt=""
                                                    width={28}
                                                    height={28}
                                                    className="object-cover h-full w-full"
                                                />
                                            ) : (
                                                <span className="text-[10px] font-semibold text-brand-accent">
                                                    {getInitials(student.full_name)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-medium truncate font-satoshi">
                                                    {student.full_name}
                                                    {student.display_name && student.display_name !== student.full_name && (
                                                        <span className="text-brand-primary/60 font-normal"> · {student.display_name}</span>
                                                    )}
                                                </span>
                                                <Checkbox
                                                    checked={true}
                                                    onCheckedChange={() => toggleStudent(student)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="rounded-lg shrink-0 border-brand-primary/30 data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent"
                                                />
                                            </div>
                                            <div className="flex justify-between items-end gap-2 mt-0.5">
                                                <div className="min-w-0">
                                                    {student.course &&
                                                        getEducationLevelByGrade(student.grade_level ?? "")?.key === "secundario" && (
                                                            <CourseTag courseKey={student.course} size="sm" />
                                                        )}
                                                </div>
                                                {student.grade_level && (
                                                    <span className="text-[10px] font-medium text-brand-primary/50 tabular-nums shrink-0">
                                                        {getGradeLabel(student.grade_level)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
                {/* Year filter — same style as input (part of the same field) */}
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                                "shrink-0 flex items-center gap-1 border-l border-brand-primary/10 pl-2.5 pr-2 py-0 bg-transparent text-sm font-satoshi font-medium transition-colors",
                                yearFilter.length > 0
                                    ? "text-brand-accent"
                                    : "text-brand-primary/60 hover:text-brand-primary/80"
                            )}
                        >
                            Ano{yearFilter.length > 0 ? ` (${yearFilter.length})` : ""}
                            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2 rounded-xl border-brand-primary/10 font-satoshi" align="end">
                        <div className="flex flex-wrap gap-1">
                            {GRADES_DESC.map((grade) => {
                                const active = yearFilter.includes(grade);
                                return (
                                    <button
                                        key={grade}
                                        type="button"
                                        onClick={() => toggleYearFilter(grade)}
                                        className={cn(
                                            "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                                            active
                                                ? "bg-brand-accent/15 text-brand-accent border-brand-accent/40"
                                                : "bg-brand-primary/5 text-brand-primary/70 border-brand-primary/15 hover:bg-brand-primary/10"
                                        )}
                                    >
                                        {getGradeLabel(grade)}
                                    </button>
                                );
                            })}
                        </div>
                        {yearFilter.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setYearFilter([])}
                                className="mt-2 w-full text-center text-[11px] text-brand-primary/50 hover:text-brand-primary font-medium py-1"
                            >
                                Limpar filtros
                            </button>
                        )}
                    </PopoverContent>
                </Popover>
            </div>

            {open && (query.trim() || results.length > 0 || loading) && (
                <div className={cn("absolute z-50 w-full bg-white rounded-xl border border-brand-primary/10 shadow-lg overflow-hidden", dropUp ? "bottom-full mb-1.5" : "mt-1.5")}>
                    <div className="max-h-72 overflow-y-auto py-1.5 px-1.5" onMouseLeave={() => setHighlightedIndex(-1)}>
                        {filteredResults.length === 0 && !loading && (
                            <div className="px-3 py-4 text-center text-sm text-brand-primary/40 font-satoshi">
                                {query.trim()
                                    ? "Nenhum aluno encontrado"
                                    : yearFilter.length > 0
                                        ? "Nenhum aluno nos anos selecionados"
                                        : "Nenhum aluno"}
                            </div>
                        )}
                        {loading && filteredResults.length === 0 && (
                            <div className="px-3 py-4 text-center text-sm text-brand-primary/40 font-satoshi flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                A procurar...
                            </div>
                        )}

                        {!useGroups &&
                            filteredResults.map((student, idx) =>
                                renderStudentRow(student, idx, highlightedIndex === idx, value.some((s) => s.id === student.id))
                            )}

                        {useGroups &&
                            (() => {
                                let flatIdx = 0;
                                return orderedYearKeys.map((yearKey) => {
                                    const studentsInYear = byYear.get(yearKey) ?? [];
                                    const label = yearKey === "_" ? "Sem ano" : getGradeLabel(yearKey);
                                    const isCollapsed = collapsedYears.has(yearKey);
                                    const startIdx = flatIdx;
                                    if (!isCollapsed) flatIdx += studentsInYear.length;
                                    return (
                                        <div key={yearKey} className="mb-0.5">
                                            <button
                                                type="button"
                                                onClick={() => toggleCollapsed(yearKey)}
                                                className="w-[calc(100%-6px)] mx-1 flex items-center gap-2 px-2 py-1 rounded-lg text-left text-xs font-semibold text-brand-primary/70 hover:bg-brand-primary/5 border border-transparent"
                                            >
                                                {isCollapsed ? (
                                                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                                ) : (
                                                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                                )}
                                                <span>{label}</span>
                                                <span className="text-brand-primary/40 font-normal">({studentsInYear.length})</span>
                                            </button>
                                            {!isCollapsed &&
                                                studentsInYear.map((student, idx) =>
                                                    renderStudentRow(student, startIdx + idx, highlightedIndex === startIdx + idx, value.some((s) => s.id === student.id))
                                                )}
                                        </div>
                                    );
                                });
                            })()}
                    </div>
                </div>
            )}
        </div>
    );
}
