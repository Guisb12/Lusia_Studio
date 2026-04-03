"use client";

import React, {
    startTransition,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { toast } from "sonner";
import Image from "next/image";
import { StudentInfo } from "./StudentHoverCard";
import { CourseTag } from "@/components/ui/course-tag";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { getEducationLevelByGrade, getGradeLabel } from "@/lib/curriculum";
import { X, Search, Loader2, ChevronDown, ChevronRight, Users, Plus, Sparkles } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
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
import type { Classroom } from "@/lib/classes";
import { addClassMembers } from "@/lib/classes";
import { CreateClassDialog } from "@/components/classes/CreateClassDialog";
import {
    invalidateOwnClassesQuery,
    syncStudentsIntoPrimaryStudentViews,
    useClassMembersQuery,
    useOwnClassesQuery,
} from "@/lib/queries/classes";
import { useStudentSearchQuery } from "@/lib/queries/students";

const GRADES_DESC = ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];
const COLLAPSE_THRESHOLD = 0;

interface StudentPickerProps {
    value: StudentInfo[];
    onChange: (students: StudentInfo[]) => void;
    disabled?: boolean;
    placeholder?: string;
    /** @deprecated kept for API compatibility */
    dropUp?: boolean;
    enableClassFilter?: boolean;
    primaryClassId?: string | null;
    recommendSubjectIds?: string[];
    excludeIds?: Set<string>;
}

function GradePill({ grade }: { grade: string }) {
    return (
        <span
            style={{ color: "#4B5563", backgroundColor: "#F3F4F6", border: "1.5px solid #9CA3AF", borderBottomWidth: "3px" }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none font-satoshi"
        >
            {grade}º
        </span>
    );
}

function sortByGradeDesc(students: StudentInfo[]): StudentInfo[] {
    return [...students].sort((a, b) => {
        const ga = a.grade_level ? parseInt(a.grade_level, 10) : 0;
        const gb = b.grade_level ? parseInt(b.grade_level, 10) : 0;
        return gb - ga;
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
    dropUp: _dropUp,
    enableClassFilter = false,
    primaryClassId,
    recommendSubjectIds,
    excludeIds,
}: StudentPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [yearFilter, setYearFilter] = useState<string[]>([]);
    const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
    const inputRef = useRef<HTMLInputElement>(null);

    const [expandedToAll, setExpandedToAll] = useState(false);
    const isScopedByPrimary = !!primaryClassId && !expandedToAll;
    const deferredQuery = useDeferredValue(query);
    const [debouncedQuery, setDebouncedQuery] = useState("");

    useEffect(() => {
        const id = window.setTimeout(() => setDebouncedQuery(deferredQuery.trim()), 180);
        return () => window.clearTimeout(id);
    }, [deferredQuery]);

    const [addToPrimaryPrompt, setAddToPrimaryPrompt] = useState<StudentInfo | null>(null);
    const [addingToPrimary, setAddingToPrimary] = useState(false);

    const handleExpandToAll = useCallback(() => setExpandedToAll(true), []);

    const [classFilter, setClassFilter] = useState<string | null>(null);
    const [createClassOpen, setCreateClassOpen] = useState(false);
    const [shouldLoadClasses, setShouldLoadClasses] = useState(false);
    const pendingAutoSelect = useRef<string | null>(null);
    const valueRef = useRef(value);
    useEffect(() => { valueRef.current = value; }, [value]);

    const handleLoadClasses = useCallback(() => {
        if (!enableClassFilter) return;
        setShouldLoadClasses(true);
    }, [enableClassFilter]);

    const {
        data: ownClassesResponse,
        isLoading: loadingClasses,
        refetch: refetchClasses,
    } = useOwnClassesQuery(enableClassFilter && shouldLoadClasses);

    const classes = useMemo<Classroom[]>(
        () => (ownClassesResponse?.data ?? []).filter((c) => !c.is_primary),
        [ownClassesResponse],
    );

    const handleClassCreated = useCallback(() => {
        setCreateClassOpen(false);
        setShouldLoadClasses(true);
        invalidateOwnClassesQuery();
        void refetchClasses();
    }, [refetchClasses]);

    const handleConfirmAddToPrimary = useCallback(async () => {
        if (!primaryClassId || !addToPrimaryPrompt) return;
        setAddingToPrimary(true);
        try {
            await addClassMembers(primaryClassId, [addToPrimaryPrompt.id]);
            syncStudentsIntoPrimaryStudentViews([addToPrimaryPrompt], primaryClassId);
            toast.success(`${addToPrimaryPrompt.display_name || addToPrimaryPrompt.full_name} adicionado aos teus alunos.`);
        } catch {
            toast.error("Não foi possível adicionar o aluno.");
        } finally {
            setAddingToPrimary(false);
            setAddToPrimaryPrompt(null);
        }
    }, [primaryClassId, addToPrimaryPrompt]);

    const { data: primaryScopedStudents = [], isLoading: loadingPrimaryScopedStudents } =
        useClassMembersQuery(primaryClassId ?? null, open && Boolean(primaryClassId) && !expandedToAll);

    const { data: classFilteredStudents = [], isLoading: loadingClassMembers } =
        useClassMembersQuery(classFilter, open && Boolean(classFilter));

    const shouldSearchAll = open && !classFilter && (!primaryClassId || expandedToAll);
    const {
        data: searchedStudents = [],
        isLoading: loadingSearchedStudents,
        isFetching: fetchingSearchedStudents,
    } = useStudentSearchQuery({
        query: debouncedQuery,
        limit: debouncedQuery ? 60 : 200,
        enabled: shouldSearchAll,
    });

    useEffect(() => {
        if (!classFilter || pendingAutoSelect.current !== classFilter || loadingClassMembers) return;
        pendingAutoSelect.current = null;
        const currentIds = new Set(valueRef.current.map((s) => s.id));
        const toAdd = classFilteredStudents.filter((s) => !currentIds.has(s.id));
        if (toAdd.length > 0) onChange([...valueRef.current, ...toAdd]);
    }, [classFilter, classFilteredStudents, loadingClassMembers, onChange]);

    const selectClassMembers = (classId: string) => {
        if (classFilter !== classId) return;
        const currentIds = new Set(value.map((s) => s.id));
        const toAdd = classFilteredStudents.filter((s) => !currentIds.has(s.id));
        if (toAdd.length > 0) onChange([...value, ...toAdd]);
    };

    const toggleStudent = (student: StudentInfo) => {
        const inValue = value.some((s) => s.id === student.id);
        if (inValue) {
            onChange(value.filter((s) => s.id !== student.id));
        } else {
            onChange([...value, student]);
            if (primaryClassId && primaryScopedStudents.length > 0) {
                const primaryMemberIds = new Set(primaryScopedStudents.map((s) => s.id));
                if (!primaryMemberIds.has(student.id)) setAddToPrimaryPrompt(student);
            }
        }
    };

    const removeStudent = (id: string) => onChange(value.filter((s) => s.id !== id));

    const toggleYearFilter = (grade: string) => {
        setYearFilter((prev) =>
            prev.includes(grade)
                ? prev.filter((g) => g !== grade)
                : [...prev, grade].sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
        );
    };

    const toggleCollapsed = (grade: string) => {
        setCollapsedYears((prev) => {
            const next = new Set(prev);
            next.has(grade) ? next.delete(grade) : next.add(grade);
            return next;
        });
    };

    const getInitials = (name?: string | null) =>
        (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

    const recommendSet = useMemo(() => new Set(recommendSubjectIds ?? []), [recommendSubjectIds]);
    const hasRecommendations = recommendSet.size > 0;

    const matchesRecommendedSubjects = useCallback(
        (student: StudentInfo) =>
            hasRecommendations && (student.subject_ids ?? []).some((id) => recommendSet.has(id)),
        [recommendSet, hasRecommendations],
    );

    const results = useMemo(() => {
        if (classFilter) return classFilteredStudents;
        if (isScopedByPrimary) return primaryScopedStudents;
        return searchedStudents;
    }, [classFilter, classFilteredStudents, isScopedByPrimary, primaryScopedStudents, searchedStudents]);

    const loading = classFilter
        ? loadingClassMembers
        : isScopedByPrimary
            ? loadingPrimaryScopedStudents
            : (loadingSearchedStudents || fetchingSearchedStudents);
    const loadingAll = expandedToAll && !classFilter && loading;

    const filteredResults = useMemo(() => {
        let list = [...results];
        if (excludeIds?.size) list = list.filter((s) => !excludeIds.has(s.id));
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            list = list.filter(
                (s) => s.full_name?.toLowerCase().includes(q) || s.display_name?.toLowerCase().includes(q)
            );
        }
        if (yearFilter.length > 0) list = list.filter((s) => s.grade_level && yearFilter.includes(s.grade_level));
        return sortByGradeDesc(list);
    }, [results, query, yearFilter, excludeIds]);

    const { recommendedStudents, nonRecommendedStudents } = useMemo(() => {
        if (!hasRecommendations) return { recommendedStudents: [] as StudentInfo[], nonRecommendedStudents: filteredResults };
        const rec: StudentInfo[] = [], rest: StudentInfo[] = [];
        for (const s of filteredResults) {
            (matchesRecommendedSubjects(s) ? rec : rest).push(s);
        }
        return { recommendedStudents: rec, nonRecommendedStudents: rest };
    }, [filteredResults, hasRecommendations, matchesRecommendedSubjects]);

    const byYear = useMemo(() => groupByGrade(nonRecommendedStudents), [nonRecommendedStudents]);
    const useGroups = filteredResults.length > COLLAPSE_THRESHOLD;
    const orderedYearKeys = useMemo(
        () => useGroups
            ? GRADES_DESC.filter((g) => byYear.has(g)).concat(byYear.has("_") ? ["_"] : [])
            : [],
        [byYear, useGroups],
    );

    const flatForKeyboard = useMemo(() => {
        const out: StudentInfo[] = [...recommendedStudents];
        if (!useGroups) {
            out.push(...nonRecommendedStudents);
        } else {
            for (const key of orderedYearKeys) {
                if (!collapsedYears.has(key)) out.push(...(byYear.get(key) ?? []));
            }
        }
        return out;
    }, [useGroups, recommendedStudents, nonRecommendedStudents, orderedYearKeys, collapsedYears, byYear]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((p) => (p < flatForKeyboard.length - 1 ? p + 1 : 0));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((p) => (p > 0 ? p - 1 : flatForKeyboard.length - 1));
        } else if (e.key === "Enter" && highlightedIndex >= 0 && flatForKeyboard[highlightedIndex]) {
            e.preventDefault();
            toggleStudent(flatForKeyboard[highlightedIndex]);
        } else if (e.key === "Backspace" && !query && value.length > 0) {
            removeStudent(value[value.length - 1].id);
        }
    };

    useEffect(() => {
        if (!open) {
            setQuery("");
            setHighlightedIndex(-1);
        }
    }, [open]);

    const rowBase = "w-[calc(100%-6px)] mx-1 my-0.5 flex items-center gap-3 px-2.5 py-2 text-left rounded-xl transition-colors border border-transparent";

    function renderStudentRow(student: StudentInfo, idx: number, isHighlighted: boolean, isSelected: boolean) {
        const looksHovered = isHighlighted || isSelected;
        const isRecommended = hasRecommendations && matchesRecommendedSubjects(student);
        const grade = student.grade_level ? String(parseInt(student.grade_level, 10)) : null;
        const showCourse = student.course && getEducationLevelByGrade(student.grade_level ?? "")?.key === "secundario";

        const displayName = student.display_name || student.full_name || "—";

        return (
            <button
                key={student.id}
                type="button"
                onClick={(e) => { e.preventDefault(); toggleStudent(student); }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onMouseLeave={() => setHighlightedIndex(-1)}
                className={cn(
                    rowBase,
                    isSelected
                        ? "bg-brand-primary/5"
                        : isHighlighted
                            ? "bg-brand-primary/[0.04]"
                            : "hover:bg-brand-primary/[0.03]"
                )}
            >
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-brand-primary/8 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-brand-primary/8">
                    {student.avatar_url ? (
                        <Image src={student.avatar_url} alt="" width={32} height={32} className="object-cover h-full w-full" />
                    ) : (
                        <span className="text-[11px] font-semibold text-brand-primary/60">
                            {getInitials(student.full_name)}
                        </span>
                    )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate font-satoshi text-brand-primary flex items-center gap-1">
                        <span className="truncate">{displayName}</span>
                        {isRecommended && <Sparkles className="h-3 w-3 text-brand-accent shrink-0" />}
                    </p>
                </div>

                {/* Course + Grade */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {showCourse && <CourseTag courseKey={student.course!} size="sm" />}
                    {grade && <GradePill grade={grade} />}
                </div>

                <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleStudent(student)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-lg shrink-0 border-brand-primary/30 data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent"
                />
            </button>
        );
    }

    // ── Filter pill button style ────────────────────────────────
    const filterBtnBase = "inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border-2 bg-white font-satoshi text-xs font-medium transition-all";
    const filterBtnIdle = "border-brand-primary/10 text-brand-primary/60 hover:border-brand-primary/20 hover:text-brand-primary";
    const filterBtnActive = "border-brand-accent/40 text-brand-accent bg-brand-accent/5";

    return (
        <>
            {/* ── Trigger ── */}
            <button
                type="button"
                onClick={() => { if (!disabled) setOpen(true); }}
                disabled={disabled}
                className={cn(
                    "flex items-center gap-1.5 min-w-0 h-9 w-full rounded-xl border-2 border-brand-primary/10 bg-white px-3 overflow-hidden",
                    "transition-all duration-200 hover:border-brand-primary/20",
                    "focus:border-brand-accent/40 focus:ring-2 focus:ring-brand-accent/10 focus:outline-none",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
            >
                <Search className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />

                {value.length === 0 ? (
                    <span className="flex-1 text-sm text-brand-primary/40 font-satoshi text-left truncate">{placeholder}</span>
                ) : value.length === 1 ? (
                    <span className="flex-1 flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/5 border border-brand-primary/10 pl-0.5 pr-1.5 py-0.5 text-brand-primary shrink-0">
                            <span className="h-5 w-5 rounded-full bg-brand-accent/10 flex items-center justify-center overflow-hidden shrink-0">
                                {value[0].avatar_url ? (
                                    <Image src={value[0].avatar_url} alt="" width={20} height={20} className="object-cover h-full w-full" />
                                ) : (
                                    <span className="text-[9px] font-bold text-brand-accent">{getInitials(value[0].full_name)}</span>
                                )}
                            </span>
                            <span className="truncate max-w-[120px] text-[11px] font-medium font-satoshi">
                                {value[0].display_name || value[0].full_name}
                            </span>
                        </span>
                    </span>
                ) : (
                    <span className="flex-1 text-[11px] font-medium font-satoshi text-brand-primary text-left">
                        {value.length} alunos
                    </span>
                )}

                <ChevronDown className="h-3.5 w-3.5 text-brand-primary/30 shrink-0 ml-auto" />
            </button>

            {/* ── Dialog ── */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="p-0 sm:max-w-[540px] gap-0 flex flex-col overflow-hidden"
                    onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => inputRef.current?.focus(), 0); }}
                >
                    {/* Title */}
                    <div className="px-5 pt-5 pb-3 pr-12 shrink-0">
                        <DialogTitle className="font-instrument text-brand-primary text-lg font-normal">
                            Selecionar Alunos
                        </DialogTitle>
                    </div>

                    {/* Search */}
                    <div className="px-4 pb-2 shrink-0">
                        <div className={cn(
                            "flex items-center gap-2 rounded-xl border-2 border-brand-primary/10 bg-white px-3 py-2",
                            "transition-all focus-within:border-brand-accent/40 focus-within:ring-2 focus-within:ring-brand-accent/10"
                        )}>
                            <Search className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => { startTransition(() => setQuery(e.target.value)); setHighlightedIndex(-1); }}
                                onKeyDown={handleKeyDown}
                                placeholder={placeholder}
                                className="flex-1 min-w-0 bg-transparent text-sm text-brand-primary placeholder:text-brand-primary/40 outline-none font-satoshi"
                            />
                            {loading
                                ? <Loader2 className="h-3.5 w-3.5 text-brand-primary/30 animate-spin shrink-0" />
                                : query && (
                                    <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="rounded-full p-0.5 opacity-50 hover:opacity-100 transition-all shrink-0">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )
                            }
                        </div>
                    </div>

                    {/* Filter buttons */}
                    <div className="px-4 pb-3 flex items-center gap-2 shrink-0">
                        {enableClassFilter && (
                            <Popover onOpenChange={(isOpen) => { if (isOpen) handleLoadClasses(); }}>
                                <PopoverTrigger asChild>
                                    <button type="button" className={cn(filterBtnBase, classFilter ? filterBtnActive : filterBtnIdle)}>
                                        <Users className="h-3 w-3" />
                                        {classFilter ? (classes.find((c) => c.id === classFilter)?.name ?? "Turma") : "Turma"}
                                        <ChevronDown className="h-3 w-3 opacity-60" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2 rounded-xl border-brand-primary/10 font-satoshi z-[60]" align="start">
                                    {loadingClasses ? (
                                        <div className="py-4 flex items-center justify-center">
                                            <Loader2 className="h-4 w-4 animate-spin text-brand-primary/30" />
                                        </div>
                                    ) : shouldLoadClasses && classes.length === 0 ? (
                                        <div className="py-3 px-1 text-center">
                                            <p className="text-xs text-brand-primary/50 mb-2">Ainda não tens turmas.</p>
                                            <button type="button" onClick={() => setCreateClassOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-accent hover:text-brand-accent/80 transition-colors">
                                                <Plus className="h-3.5 w-3.5" />Criar turma
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
                                                                pendingAutoSelect.current = newId;
                                                            }}
                                                            className={cn(
                                                                "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                                                                isActive ? "bg-brand-accent/10 text-brand-accent" : "hover:bg-brand-primary/5 text-brand-primary/70"
                                                            )}
                                                        >
                                                            <Users className="h-3.5 w-3.5 shrink-0" />
                                                            <span className="text-xs font-medium truncate">{cls.name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {classFilter && !loadingClassMembers && classFilteredStudents.length > 0 && (
                                                <button type="button" onClick={() => selectClassMembers(classFilter)} className="mt-2 w-full text-center text-[11px] text-brand-accent hover:text-brand-accent/80 font-medium py-1 border-t border-brand-primary/8">
                                                    Selecionar todos da turma
                                                </button>
                                            )}
                                            {classFilter && (
                                                <button type="button" onClick={() => { pendingAutoSelect.current = null; setClassFilter(null); }} className="mt-1 w-full text-center text-[11px] text-brand-primary/50 hover:text-brand-primary font-medium py-1">
                                                    Limpar filtro
                                                </button>
                                            )}
                                            <button type="button" onClick={() => setCreateClassOpen(true)} className="mt-1.5 pt-1.5 border-t border-brand-primary/8 w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-brand-primary/50 hover:text-brand-accent transition-colors">
                                                <Plus className="h-3 w-3" />Criar turma
                                            </button>
                                        </>
                                    )}
                                </PopoverContent>
                            </Popover>
                        )}

                        <Popover>
                            <PopoverTrigger asChild>
                                <button type="button" className={cn(filterBtnBase, yearFilter.length > 0 ? filterBtnActive : filterBtnIdle)}>
                                    {yearFilter.length > 0 ? `Ano (${yearFilter.length})` : "Ano"}
                                    <ChevronDown className="h-3 w-3 opacity-60" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-2 rounded-xl border-brand-primary/10 font-satoshi z-[60]" align="start">
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
                                    <button type="button" onClick={() => setYearFilter([])} className="mt-2 w-full text-center text-[11px] text-brand-primary/50 hover:text-brand-primary font-medium py-1">
                                        Limpar filtros
                                    </button>
                                )}
                            </PopoverContent>
                        </Popover>

                        {(yearFilter.length > 0 || classFilter) && (
                            <button
                                type="button"
                                onClick={() => { setYearFilter([]); setClassFilter(null); pendingAutoSelect.current = null; }}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary/40 hover:text-brand-primary/70 transition-colors"
                            >
                                <X className="h-3 w-3" />Limpar
                            </button>
                        )}
                    </div>

                    {/* Student list */}
                    <AppScrollArea
                        viewportClassName="py-1.5"
                        viewportStyle={{ maxHeight: "min(55vh, 360px)" }}
                        showFadeMasks
                        desktopScrollbarOnly
                        onMouseLeave={() => setHighlightedIndex(-1)}
                    >
                        {filteredResults.length === 0 && !loading && (
                            <div className="px-3 py-8 text-center text-sm text-brand-primary/40 font-satoshi">
                                {query.trim()
                                    ? "Nenhum aluno encontrado"
                                    : yearFilter.length > 0
                                        ? "Nenhum aluno nos anos selecionados"
                                        : "Nenhum aluno"}
                                {isScopedByPrimary && (
                                    <button type="button" onClick={handleExpandToAll} disabled={loadingAll} className="block mx-auto mt-2 text-xs text-brand-accent hover:text-brand-accent/80 font-medium transition-colors">
                                        {loadingAll ? "A carregar..." : "Procurar em todos os alunos do centro"}
                                    </button>
                                )}
                            </div>
                        )}

                        {loading && filteredResults.length === 0 && (
                            <div className="px-3 py-8 text-center text-sm text-brand-primary/40 font-satoshi flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />A procurar...
                            </div>
                        )}

                        {/* Recommended section */}
                        {hasRecommendations && recommendedStudents.length > 0 && !loading && (
                            <div className="mb-1">
                                <div className="w-[calc(100%-6px)] mx-1 flex items-center gap-2 px-2 py-1 text-left text-xs font-semibold text-brand-accent/80">
                                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                    <span>Recomendados</span>
                                    <span className="text-brand-accent/40 font-normal">({recommendedStudents.length})</span>
                                </div>
                                {recommendedStudents.map((s, i) =>
                                    renderStudentRow(s, i, highlightedIndex === i, value.some((v) => v.id === s.id))
                                )}
                                {nonRecommendedStudents.length > 0 && <div className="mx-4 my-1.5 border-t border-brand-primary/6" />}
                            </div>
                        )}

                        {/* Flat (no groups) */}
                        {!useGroups && nonRecommendedStudents.map((s, i) => {
                            const fi = recommendedStudents.length + i;
                            return renderStudentRow(s, fi, highlightedIndex === fi, value.some((v) => v.id === s.id));
                        })}

                        {/* Grouped by year */}
                        {useGroups && (() => {
                            let fi = recommendedStudents.length;
                            return orderedYearKeys.map((yearKey) => {
                                const list = byYear.get(yearKey) ?? [];
                                const label = yearKey === "_" ? "Sem ano" : getGradeLabel(yearKey);
                                const isCollapsed = collapsedYears.has(yearKey);
                                const startIdx = fi;
                                if (!isCollapsed) fi += list.length;
                                return (
                                    <div key={yearKey} className="mb-0.5">
                                        <button
                                            type="button"
                                            onClick={() => toggleCollapsed(yearKey)}
                                            className="w-[calc(100%-6px)] mx-1 flex items-center gap-2 px-2 py-1 rounded-lg text-left text-xs font-semibold text-brand-primary/60 hover:bg-brand-primary/5 border border-transparent"
                                        >
                                            {isCollapsed
                                                ? <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                                : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                                            <span>{label}</span>
                                            <span className="text-brand-primary/35 font-normal">({list.length})</span>
                                        </button>
                                        {!isCollapsed && list.map((s, i) =>
                                            renderStudentRow(s, startIdx + i, highlightedIndex === startIdx + i, value.some((v) => v.id === s.id))
                                        )}
                                    </div>
                                );
                            });
                        })()}

                        {/* Expand to all students */}
                        {isScopedByPrimary && filteredResults.length > 0 && !loading && (
                            <button
                                type="button"
                                onClick={handleExpandToAll}
                                disabled={loadingAll}
                                className="w-[calc(100%-6px)] mx-1 my-1 py-2 rounded-xl text-center text-[11px] font-medium text-brand-primary/40 hover:text-brand-accent hover:bg-brand-accent/5 border border-dashed border-brand-primary/10 hover:border-brand-accent/20 transition-colors"
                            >
                                {loadingAll ? "A carregar..." : "Ver todos os alunos do centro"}
                            </button>
                        )}
                    </AppScrollArea>

                    {/* Footer */}
                    <div className="px-4 py-3 flex items-center justify-between shrink-0">
                        <span className="text-xs text-brand-primary/40 font-satoshi">
                            {value.length > 0
                                ? `${value.length} ${value.length === 1 ? "aluno selecionado" : "alunos selecionados"}`
                                : "Nenhum selecionado"}
                        </span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-accent text-white px-4 py-1.5 text-sm font-medium font-satoshi hover:bg-brand-accent/90 transition-colors"
                        >
                            Feito
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {enableClassFilter && (
                <CreateClassDialog
                    open={createClassOpen}
                    onOpenChange={setCreateClassOpen}
                    onCreated={handleClassCreated}
                    primaryClassId={primaryClassId ?? null}
                />
            )}

            <AlertDialog open={!!addToPrimaryPrompt} onOpenChange={(o) => { if (!o) setAddToPrimaryPrompt(null); }}>
                <AlertDialogContent className="rounded-2xl font-satoshi">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-brand-primary font-instrument">Adicionar aos teus alunos?</AlertDialogTitle>
                        <AlertDialogDescription className="text-brand-primary/60">
                            <strong className="text-brand-primary/80">{addToPrimaryPrompt?.display_name || addToPrimaryPrompt?.full_name}</strong>{" "}
                            não está na tua lista de alunos. Queres adicioná-lo para que apareça sempre por defeito?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl font-satoshi" disabled={addingToPrimary}>Não, obrigado</AlertDialogCancel>
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
        </>
    );
}
