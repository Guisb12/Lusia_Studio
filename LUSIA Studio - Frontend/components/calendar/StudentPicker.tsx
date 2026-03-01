"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { StudentHoverCard, StudentInfo } from "./StudentHoverCard";
import { CourseTag } from "@/components/ui/course-tag";
import { getEducationLevelByGrade, getGradeLabel } from "@/lib/curriculum";
import { X, Search, Loader2, ChevronDown, ChevronRight, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { Classroom, ClassMember } from "@/lib/classes";
import { fetchClasses, fetchClassMembers } from "@/lib/classes";

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
    /** When true, shows a "Turma" filter alongside the "Ano" filter */
    enableClassFilter?: boolean;
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
    enableClassFilter = false,
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


    // ── Class filter state ──
    const [classes, setClasses] = useState<Classroom[]>([]);
    const [classFilter, setClassFilter] = useState<string | null>(null);
    const [classMembers, setClassMembers] = useState<Map<string, StudentInfo[]>>(new Map());
    const [loadingClassMembers, setLoadingClassMembers] = useState(false);
    const pendingAutoSelect = useRef<string | null>(null);
    const valueRef = useRef(value);
    const classMembersRef = useRef(classMembers);
    useEffect(() => { valueRef.current = value; }, [value]);
    useEffect(() => { classMembersRef.current = classMembers; }, [classMembers]);

    const toStudentInfos = (members: ClassMember[]): StudentInfo[] =>
        members.map((m) => ({
            id: m.id,
            full_name: m.full_name,
            display_name: m.display_name,
            avatar_url: m.avatar_url,
            grade_level: m.grade_level,
            course: m.course,
            subject_ids: m.subject_ids,
        }));

    // Load classes and pre-fetch all their members immediately
    useEffect(() => {
        if (!enableClassFilter) return;
        fetchClasses(true, 1, 50)
            .then((res) => {
                setClasses(res.data);
                // Pre-fetch members for all classes in parallel so clicks are instant
                Promise.all(
                    res.data.map((cls) =>
                        fetchClassMembers(cls.id)
                            .then((members) => {
                                setClassMembers((prev) => new Map(prev).set(cls.id, toStudentInfos(members)));
                            })
                            .catch(console.error),
                    ),
                );
            })
            .catch(console.error);
    }, [enableClassFilter]);

    // Fallback: load members on demand if not yet cached (e.g. class added after mount)
    useEffect(() => {
        if (!classFilter || classMembersRef.current.has(classFilter)) return;
        setLoadingClassMembers(true);
        fetchClassMembers(classFilter)
            .then((members) => {
                const infos = toStudentInfos(members);
                setClassMembers((prev) => new Map(prev).set(classFilter, infos));
                if (pendingAutoSelect.current === classFilter) {
                    pendingAutoSelect.current = null;
                    const currentIds = new Set(valueRef.current.map((s) => s.id));
                    const toAdd = infos.filter((m) => !currentIds.has(m.id));
                    if (toAdd.length > 0) onChange([...valueRef.current, ...toAdd]);
                }
            })
            .catch(console.error)
            .finally(() => setLoadingClassMembers(false));
    }, [classFilter]);

    const selectClassMembers = (classId: string) => {
        const members = classMembers.get(classId);
        if (!members) return;
        // Merge with existing selection (no duplicates)
        const currentIds = new Set(value.map((s) => s.id));
        const toAdd = members.filter((m) => !currentIds.has(m.id));
        if (toAdd.length > 0) {
            onChange([...value, ...toAdd]);
        }
    };

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/calendar/students/search?limit=500`)
            .then((res) => res.ok ? res.json() : [])
            .then((data) => setResults(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        setHighlightedIndex(-1);
        setOpen(true);
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

    // Include all (selected + unselected); apply query + year + class filter; sort 12→1
    const filteredResults = useMemo(() => {
        let list = [...results];
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            list = list.filter((s) =>
                s.full_name?.toLowerCase().includes(q) ||
                s.display_name?.toLowerCase().includes(q),
            );
        }
        if (classFilter && classMembers.has(classFilter)) {
            const memberIds = new Set(classMembers.get(classFilter)!.map((m) => m.id));
            list = list.filter((s) => memberIds.has(s.id));
        }
        if (yearFilter.length > 0) {
            list = list.filter((s) => s.grade_level && yearFilter.includes(s.grade_level));
        }
        return sortByGradeDesc(list);
    }, [results, query, yearFilter, classFilter, classMembers]);

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
                        onFocus={() => setOpen(true)}
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
                {/* Class filter — only shown when enabled */}
                {enableClassFilter && classes.length > 0 && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                    "shrink-0 flex items-center gap-1 border-l border-brand-primary/10 pl-2.5 pr-2 py-0 bg-transparent text-sm font-satoshi font-medium transition-colors",
                                    classFilter
                                        ? "text-brand-accent"
                                        : "text-brand-primary/60 hover:text-brand-primary/80"
                                )}
                            >
                                <Users className="h-3 w-3" />
                                Turma
                                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2 rounded-xl border-brand-primary/10 font-satoshi" align="end">
                            <div className="space-y-0.5">
                                {classes.map((cls) => {
                                    const isActive = classFilter === cls.id;
                                    return (
                                        <button
                                            key={cls.id}
                                            type="button"
                                            onClick={() => {
                                                const newId = isActive ? null : cls.id;
                                                setClassFilter(newId);
                                                if (newId) {
                                                    const cached = classMembersRef.current.get(newId);
                                                    if (cached) {
                                                        // Already pre-fetched — select instantly
                                                        const currentIds = new Set(valueRef.current.map((s) => s.id));
                                                        const toAdd = cached.filter((m) => !currentIds.has(m.id));
                                                        if (toAdd.length > 0) onChange([...valueRef.current, ...toAdd]);
                                                    } else {
                                                        // Fallback: select once load completes
                                                        pendingAutoSelect.current = newId;
                                                    }
                                                }
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                                                isActive
                                                    ? "bg-brand-accent/10 text-brand-accent"
                                                    : "hover:bg-brand-primary/5 text-brand-primary/70"
                                            )}
                                        >
                                            <Users className="h-3.5 w-3.5 shrink-0" />
                                            <span className="text-xs font-medium truncate">{cls.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Select all from class */}
                            {classFilter && classMembers.has(classFilter) && (
                                <button
                                    type="button"
                                    onClick={() => selectClassMembers(classFilter)}
                                    className="mt-2 w-full text-center text-[11px] text-brand-accent hover:text-brand-accent-hover font-medium py-1 border-t border-brand-primary/8"
                                >
                                    Selecionar todos da turma
                                </button>
                            )}
                            {classFilter && (
                                <button
                                    type="button"
                                    onClick={() => setClassFilter(null)}
                                    className="mt-1 w-full text-center text-[11px] text-brand-primary/50 hover:text-brand-primary font-medium py-1"
                                >
                                    Limpar filtro
                                </button>
                            )}
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
