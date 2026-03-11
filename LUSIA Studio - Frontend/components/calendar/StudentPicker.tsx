"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cachedFetch, cacheInvalidate } from "@/lib/cache";
import { toast } from "sonner";
import Image from "next/image";
import { StudentHoverCard, StudentInfo } from "./StudentHoverCard";
import { CourseTag } from "@/components/ui/course-tag";
import { getEducationLevelByGrade, getGradeLabel } from "@/lib/curriculum";
import { X, Search, Loader2, ChevronDown, ChevronRight, Users, Plus, Sparkles } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { Classroom, ClassMember } from "@/lib/classes";
import { fetchClasses, fetchClassMembers, addClassMembers } from "@/lib/classes";
import { CreateClassDialog } from "@/components/classes/CreateClassDialog";

/** Grades 12→1 for ordering and filter options */
const GRADES_DESC = ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];
const COLLAPSE_THRESHOLD = 0; // Always group by year

interface StudentPickerProps {
    value: StudentInfo[];
    onChange: (students: StudentInfo[]) => void;
    disabled?: boolean;
    placeholder?: string;
    /** When true the results dropdown opens above the input instead of below */
    dropUp?: boolean;
    /** When true, shows a "Turma" filter alongside the "Ano" filter */
    enableClassFilter?: boolean;
    /** When provided, initial student list is scoped to this class (teacher's primary class). */
    primaryClassId?: string | null;
    /** When provided, students matching these subjects are sorted first and highlighted. */
    recommendSubjectIds?: string[];
    /** IDs of students to hide from results (e.g. already in a class). */
    excludeIds?: Set<string>;
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
    primaryClassId,
    recommendSubjectIds,
    excludeIds,
}: StudentPickerProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<StudentInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [selectedPopoverOpen, setSelectedPopoverOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [yearFilter, setYearFilter] = useState<string[]>([]);
    const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // ── "Expand to all" state (when scoped by primaryClassId) ──
    const [expandedToAll, setExpandedToAll] = useState(false);
    const [loadingAll, setLoadingAll] = useState(false);
    const isScopedByPrimary = !!primaryClassId && !expandedToAll;

    // ── Primary class member tracking (for add-to-primary prompt) ──
    const [primaryMemberIds, setPrimaryMemberIds] = useState<Set<string>>(new Set());
    const [addToPrimaryPrompt, setAddToPrimaryPrompt] = useState<StudentInfo | null>(null);
    const [addingToPrimary, setAddingToPrimary] = useState(false);

    const handleExpandToAll = useCallback(() => {
        setLoadingAll(true);
        cachedFetch<StudentInfo[]>(
            "students:all",
            () => fetch("/api/calendar/students/search?limit=500")
                .then((r) => r.ok ? r.json() : []),
            60_000,
        )
            .then((all) => {
                setResults(all);
                setExpandedToAll(true);
            })
            .catch(console.error)
            .finally(() => setLoadingAll(false));
    }, []);

    // ── Class filter state ──
    const [classes, setClasses] = useState<Classroom[]>([]);
    const [classesLoaded, setClassesLoaded] = useState(false);
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [classFilter, setClassFilter] = useState<string | null>(null);
    const [createClassOpen, setCreateClassOpen] = useState(false);
    const [classMembers, setClassMembers] = useState<Map<string, StudentInfo[]>>(new Map());
    const [loadingClassMembers, setLoadingClassMembers] = useState(false);
    const pendingAutoSelect = useRef<string | null>(null);
    const initialLoadedRef = useRef(false);
    const valueRef = useRef(value);
    const classMembersRef = useRef(classMembers);
    const classFilterRef = useRef(classFilter);
    useEffect(() => { valueRef.current = value; }, [value]);
    useEffect(() => { classMembersRef.current = classMembers; }, [classMembers]);
    useEffect(() => { classFilterRef.current = classFilter; }, [classFilter]);

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

    // Load classes lazily — only when the Turma filter popover is first opened.
    // own=true ensures admins only see their own classes. Primary classes are
    // excluded because they serve as the default student scope, not a batch filter.
    const handleLoadClasses = useCallback(() => {
        if (!enableClassFilter || classesLoaded) return;
        setClassesLoaded(true);
        setLoadingClasses(true);
        cachedFetch("classes:own-list", () => fetchClasses(true, 1, 50, true), 120_000)
            .then((res) => setClasses(res.data.filter((c) => !c.is_primary)))
            .catch(console.error)
            .finally(() => setLoadingClasses(false));
    }, [enableClassFilter, classesLoaded]);

    const handleClassCreated = useCallback(() => {
        setCreateClassOpen(false);
        cacheInvalidate("classes:");
        // Reset so the next popover open re-fetches the list
        setClassesLoaded(false);
    }, []);

    const handleConfirmAddToPrimary = useCallback(async () => {
        if (!primaryClassId || !addToPrimaryPrompt) return;
        setAddingToPrimary(true);
        try {
            await addClassMembers(primaryClassId, [addToPrimaryPrompt.id]);
            setPrimaryMemberIds((prev) => new Set(prev).add(addToPrimaryPrompt.id));
            cacheInvalidate(`students:class:${primaryClassId}`);
            toast.success(`${addToPrimaryPrompt.display_name || addToPrimaryPrompt.full_name} adicionado aos teus alunos.`);
        } catch {
            toast.error("Não foi possível adicionar o aluno.");
        } finally {
            setAddingToPrimary(false);
            setAddToPrimaryPrompt(null);
        }
    }, [primaryClassId, addToPrimaryPrompt]);

    // Load members on demand — cached 60s so re-selecting the same class costs nothing
    useEffect(() => {
        if (!classFilter || classMembersRef.current.has(classFilter)) return;
        setLoadingClassMembers(true);
        const id = classFilter;
        cachedFetch<ClassMember[]>(
            `class:members:${id}`,
            () => fetchClassMembers(id),
            60_000,
        )
            .then((members) => {
                const infos = toStudentInfos(members);
                setClassMembers((prev) => new Map(prev).set(id, infos));
                if (pendingAutoSelect.current === id && classFilterRef.current === id) {
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

    // Load students lazily — only the first time the dropdown opens.
    // When primaryClassId is provided, default to that class's members.
    useEffect(() => {
        if (!open || initialLoadedRef.current) return;
        initialLoadedRef.current = true;
        setLoading(true);

        const cacheKey = primaryClassId ? `students:class:${primaryClassId}` : "students:all";

        const fetcher = primaryClassId
            ? () => fetchClassMembers(primaryClassId).then(toStudentInfos)
            : () => fetch("/api/calendar/students/search?limit=500")
                .then((r) => r.ok ? r.json() : []);

        cachedFetch<StudentInfo[]>(cacheKey, fetcher, 60_000)
            .then((data) => {
                setResults(data);
                // Track primary class members so we can prompt "add to my students" later
                if (primaryClassId) {
                    setPrimaryMemberIds(new Set(data.map((s) => s.id)));
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [open, primaryClassId]);

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
            // Prompt to add to primary class if student isn't in it
            if (primaryClassId && primaryMemberIds.size > 0 && !primaryMemberIds.has(student.id)) {
                setAddToPrimaryPrompt(student);
            }
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

    // Subject recommendation set — for sorting matching students first
    const recommendSet = useMemo(
        () => new Set(recommendSubjectIds ?? []),
        [recommendSubjectIds],
    );
    const hasRecommendations = recommendSet.size > 0;

    const matchesRecommendedSubjects = useCallback(
        (student: StudentInfo) => {
            if (!hasRecommendations) return false;
            return (student.subject_ids ?? []).some((id) => recommendSet.has(id));
        },
        [recommendSet, hasRecommendations],
    );

    // Include all (selected + unselected); apply query + year + class filter; sort 12→1
    const filteredResults = useMemo(() => {
        let list = [...results];
        if (excludeIds && excludeIds.size > 0) {
            list = list.filter((s) => !excludeIds.has(s.id));
        }
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
    }, [results, query, yearFilter, classFilter, classMembers, excludeIds]);

    // Split recommended students into their own section when subject filter is active
    const { recommendedStudents, nonRecommendedStudents } = useMemo(() => {
        if (!hasRecommendations) return { recommendedStudents: [] as StudentInfo[], nonRecommendedStudents: filteredResults };
        const rec: StudentInfo[] = [];
        const rest: StudentInfo[] = [];
        for (const s of filteredResults) {
            if (matchesRecommendedSubjects(s)) rec.push(s);
            else rest.push(s);
        }
        return { recommendedStudents: rec, nonRecommendedStudents: rest };
    }, [filteredResults, hasRecommendations, matchesRecommendedSubjects]);

    const byYear = useMemo(() => groupByGrade(nonRecommendedStudents), [nonRecommendedStudents]);
    const useGroups = filteredResults.length > COLLAPSE_THRESHOLD;
    const orderedYearKeys = useGroups
        ? GRADES_DESC.filter((g) => byYear.has(g)).concat(byYear.has("_") ? ["_"] : [])
        : [];

    const flatForKeyboard = useMemo(() => {
        const out: StudentInfo[] = [...recommendedStudents];
        if (!useGroups) {
            out.push(...nonRecommendedStudents);
        } else {
            for (const key of orderedYearKeys) {
                if (collapsedYears.has(key)) continue;
                out.push(...(byYear.get(key) ?? []));
            }
        }
        return out;
    }, [useGroups, recommendedStudents, nonRecommendedStudents, orderedYearKeys, collapsedYears, byYear]);

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
        const isRecommended = hasRecommendations && matchesRecommendedSubjects(student);
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
                            <span className="text-xs font-medium truncate font-satoshi flex items-center gap-1">
                                {student.full_name}
                                {student.display_name && student.display_name !== student.full_name && (
                                    <span className="text-brand-primary/60 font-normal"> · {student.display_name}</span>
                                )}
                                {isRecommended && <Sparkles className="h-3 w-3 text-brand-accent shrink-0" />}
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
                    "flex items-center gap-1.5 min-w-0 h-9 rounded-xl border-2 border-brand-primary/10 bg-white px-3 overflow-hidden",
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
                {(value.length > 1 || selectedPopoverOpen) && (
                    <Popover open={selectedPopoverOpen} onOpenChange={setSelectedPopoverOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelectedPopoverOpen((v) => !v); }}
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
                                        onClick={(e) => { e.stopPropagation(); toggleStudent(student); }}
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
                {enableClassFilter && (
                    <Popover onOpenChange={(open) => { if (open) handleLoadClasses(); }}>
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
                            {loadingClasses ? (
                                <div className="py-4 flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 animate-spin text-brand-primary/30" />
                                </div>
                            ) : classesLoaded && classes.length === 0 ? (
                                /* Empty state — prompt to create */
                                <div className="py-3 px-1 text-center">
                                    <p className="text-xs text-brand-primary/50 mb-2">
                                        Ainda não tens turmas.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setCreateClassOpen(true)}
                                        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-accent hover:text-brand-accent/80 transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Criar turma
                                    </button>
                                </div>
                            ) : (
                                <>
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
                                                        if (!newId) {
                                                            pendingAutoSelect.current = null;
                                                        } else {
                                                            const cached = classMembersRef.current.get(newId);
                                                            if (cached) {
                                                                const currentIds = new Set(valueRef.current.map((s) => s.id));
                                                                const toAdd = cached.filter((m) => !currentIds.has(m.id));
                                                                if (toAdd.length > 0) onChange([...valueRef.current, ...toAdd]);
                                                            } else {
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
                                            onClick={() => { pendingAutoSelect.current = null; setClassFilter(null); }}
                                            className="mt-1 w-full text-center text-[11px] text-brand-primary/50 hover:text-brand-primary font-medium py-1"
                                        >
                                            Limpar filtro
                                        </button>
                                    )}
                                    {/* Create new class link */}
                                    <button
                                        type="button"
                                        onClick={() => setCreateClassOpen(true)}
                                        className="mt-1.5 pt-1.5 border-t border-brand-primary/8 w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-brand-primary/50 hover:text-brand-accent transition-colors"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Criar turma
                                    </button>
                                </>
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
                                {isScopedByPrimary && (
                                    <button
                                        type="button"
                                        onClick={handleExpandToAll}
                                        disabled={loadingAll}
                                        className="block mx-auto mt-2 text-xs text-brand-accent hover:text-brand-accent/80 font-medium transition-colors"
                                    >
                                        {loadingAll ? "A carregar..." : "Procurar em todos os alunos do centro"}
                                    </button>
                                )}
                            </div>
                        )}
                        {loading && filteredResults.length === 0 && (
                            <div className="px-3 py-4 text-center text-sm text-brand-primary/40 font-satoshi flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                A procurar...
                            </div>
                        )}

                        {/* Recommended students section */}
                        {hasRecommendations && recommendedStudents.length > 0 && !loading && (
                            <div className="mb-1">
                                <div className="w-[calc(100%-6px)] mx-1 flex items-center gap-2 px-2 py-1 text-left text-xs font-semibold text-brand-accent/80">
                                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                    <span>Recomendados</span>
                                    <span className="text-brand-accent/40 font-normal">({recommendedStudents.length})</span>
                                </div>
                                {recommendedStudents.map((student, idx) =>
                                    renderStudentRow(student, idx, highlightedIndex === idx, value.some((s) => s.id === student.id))
                                )}
                                {nonRecommendedStudents.length > 0 && (
                                    <div className="mx-3 my-1.5 border-t border-brand-primary/8" />
                                )}
                            </div>
                        )}

                        {!useGroups &&
                            nonRecommendedStudents.map((student, idx) => {
                                const flatIdx = recommendedStudents.length + idx;
                                return renderStudentRow(student, flatIdx, highlightedIndex === flatIdx, value.some((s) => s.id === student.id));
                            })}

                        {useGroups &&
                            (() => {
                                let flatIdx = recommendedStudents.length;
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

                        {/* "Ver todos" button at bottom of results when scoped */}
                        {isScopedByPrimary && filteredResults.length > 0 && !loading && (
                            <button
                                type="button"
                                onClick={handleExpandToAll}
                                disabled={loadingAll}
                                className="w-[calc(100%-6px)] mx-1 my-1 py-2 rounded-lg text-center text-[11px] font-medium text-brand-primary/40 hover:text-brand-accent hover:bg-brand-accent/5 border border-dashed border-brand-primary/10 hover:border-brand-accent/20 transition-colors"
                            >
                                {loadingAll ? "A carregar..." : "Ver todos os alunos do centro"}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Create class dialog (opened from Turma filter) */}
            {enableClassFilter && (
                <CreateClassDialog
                    open={createClassOpen}
                    onOpenChange={setCreateClassOpen}
                    onCreated={handleClassCreated}
                    primaryClassId={primaryClassId ?? null}
                />
            )}

            {/* Add-to-primary-class prompt */}
            <AlertDialog open={!!addToPrimaryPrompt} onOpenChange={(open) => { if (!open) setAddToPrimaryPrompt(null); }}>
                <AlertDialogContent className="rounded-2xl font-satoshi">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-brand-primary font-instrument">
                            Adicionar aos teus alunos?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-brand-primary/60">
                            <strong className="text-brand-primary/80">{addToPrimaryPrompt?.display_name || addToPrimaryPrompt?.full_name}</strong>{" "}
                            não está na tua lista de alunos. Queres adicioná-lo para que apareça sempre por defeito?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="rounded-xl font-satoshi"
                            disabled={addingToPrimary}
                        >
                            Não, obrigado
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmAddToPrimary}
                            disabled={addingToPrimary}
                            className="rounded-xl bg-brand-accent text-white hover:bg-brand-accent/90 font-satoshi"
                        >
                            {addingToPrimary ? "A adicionar..." : "Sim, adicionar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
