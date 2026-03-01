"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { YearTag } from "@/components/ui/year-tag";
import { cn } from "@/lib/utils";
import { cachedFetch } from "@/lib/cache";
import { getEducationLevel, type EducationLevel } from "@/lib/curriculum";
import type { Subject } from "@/types/subjects";
import { useUser } from "@/components/providers/UserProvider";

export interface SubjectInfo {
    id: string;
    name: string;
    color?: string | null;
    icon?: string | null;
    education_level?: string;
    grade_levels?: string[] | null;
}

interface SubjectPickerProps {
    value: SubjectInfo[];
    onChange: (subjects: SubjectInfo[]) => void;
    disabled?: boolean;
}

const LEVEL_COLORS: Record<EducationLevel, string> = {
    basico_1_ciclo: "#2563eb",
    basico_2_ciclo: "#059669",
    basico_3_ciclo: "#ea580c",
    secundario: "#7c3aed",
};

const LEVEL_ORDER: EducationLevel[] = [
    "secundario",
    "basico_1_ciclo",
    "basico_2_ciclo",
    "basico_3_ciclo",
];

const MAX_VISIBLE_SUBJECTS = 120;
const DROPDOWN_GAP_PX = 6; // mt-1.5 / mb-1.5
const DROPDOWN_MAX_HEIGHT_PX = 288; // max-h-72 baseline
const DROPDOWN_MIN_HEIGHT_PX = 120;

export function SubjectPicker({
    value = [],
    onChange,
    disabled = false,
}: SubjectPickerProps) {
    const { user } = useUser();
    const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [collapsedLevels, setCollapsedLevels] = useState<Set<string>>(new Set());
    const [showAllSubjects, setShowAllSubjects] = useState(false);
    const [dropdownMaxHeight, setDropdownMaxHeight] = useState(224);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch subjects once (cached 120s across dialog opens)
    useEffect(() => {
        (async () => {
            try {
                const data = await cachedFetch<Subject[]>(
                    "subjects:me",
                    async () => {
                        const res = await fetch("/api/subjects?scope=me");
                        if (!res.ok) return [];
                        return res.json();
                    },
                    120_000,
                );
                setAllSubjects(data);
            } catch (e) {
                console.error("Failed to load subjects", e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const preferredSubjectIds = useMemo(() => {
        const runtimeUser: any = Array.isArray(user) ? user[0] : user;
        if (!runtimeUser) return [];

        const directCandidates = [
            runtimeUser?.subject_ids,
            runtimeUser?.subjects_ids,
            runtimeUser?.user?.subject_ids,
            runtimeUser?.user?.subjects_ids,
        ];

        const profileObjects = [
            runtimeUser?.profile,
            runtimeUser?.profiles,
            runtimeUser?.user?.profile,
            runtimeUser?.user?.profiles,
        ]
            .flat()
            .filter(Boolean);

        const profileCandidates = profileObjects.flatMap((p: any) => [
            p?.subject_ids,
            p?.subjects_ids,
        ]);

        const firstArray = [...directCandidates, ...profileCandidates].find((v) => Array.isArray(v));
        return Array.isArray(firstArray) ? firstArray : [];
    }, [user]);

    const hasPreferredSubjects = preferredSubjectIds.length > 0;

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const toSubjectInfo = (subject: Subject | SubjectInfo): SubjectInfo => ({
        id: subject.id,
        name: subject.name,
        color: subject.color ?? null,
        icon: subject.icon ?? null,
        education_level: subject.education_level,
        grade_levels: subject.grade_levels ?? null,
    });

    const toggleSubject = (subject: Subject | SubjectInfo) => {
        const inValue = value.some((s) => s.id === subject.id);
        if (inValue) {
            onChange(value.filter((s) => s.id !== subject.id));
        } else {
            onChange([...value, toSubjectInfo(subject)]);
        }
    };

    const selectedIds = useMemo(() => new Set(value.map((s) => s.id)), [value]);

    const toggleCollapsed = (level: string) => {
        setCollapsedLevels((prev) => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            return next;
        });
    };

    // Include both selected and unselected subjects (checkbox pattern).
    // Behavior:
    // - first glance (empty query): show preferred-only when available
    // - typed search (non-empty query): search across all org subjects
    const filteredSubjects = useMemo(() => {
        const preferredSet = new Set(preferredSubjectIds);
        const q = query.trim().toLowerCase();
        const source =
            q === "" && preferredSubjectIds.length > 0 && !showAllSubjects
                ? allSubjects.filter((s) => preferredSet.has(s.id))
                : allSubjects;

        let filtered = source.filter((s) => q === "" || s.name.toLowerCase().includes(q));

        filtered = [...filtered].sort((a, b) =>
            a.name.localeCompare(b.name, "pt", { sensitivity: "base" })
        );

        return filtered;
    }, [allSubjects, query, preferredSubjectIds, showAllSubjects]);

    const totalFilteredCount = filteredSubjects.length;
    const limitedSubjects = useMemo(
        () => filteredSubjects.slice(0, MAX_VISIBLE_SUBJECTS),
        [filteredSubjects]
    );

    // Group by education level
    const groupedByLevel = useMemo(() => {
        const groups = new Map<string, Subject[]>();
        for (const subject of limitedSubjects) {
            const level = subject.education_level || "other";
            if (!groups.has(level)) groups.set(level, []);
            groups.get(level)!.push(subject);
        }
        return groups;
    }, [limitedSubjects]);

    // Ordered groups: Secundário first, then ciclos.
    const orderedLevels = useMemo(() => {
        const levels: string[] = [];

        for (const level of LEVEL_ORDER) {
            if (groupedByLevel.has(level)) {
                levels.push(level);
            }
        }

        for (const level of groupedByLevel.keys()) {
            if (!LEVEL_ORDER.includes(level as EducationLevel)) {
                levels.push(level);
            }
        }

        return levels;
    }, [groupedByLevel]);

    // Default combobox appearance: collapsed sections when > 1 education level.
    useEffect(() => {
        if (!open) return;
        if (query.trim() !== "") return;
        if (orderedLevels.length > 1 && collapsedLevels.size === 0) {
            setCollapsedLevels(new Set(orderedLevels));
        }
    }, [open, query, orderedLevels, collapsedLevels.size]);

    useEffect(() => {
        if (!open) {
            setCollapsedLevels(new Set());
            setShowAllSubjects(false);
        }
    }, [open]);

    const updateDropdownPlacement = useCallback(() => {
        if (!containerRef.current || typeof window === "undefined") {
            return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        const dialogEl = containerRef.current.closest("[role='dialog']") as HTMLElement | null;

        let topLimit = 0;
        let bottomLimit = window.innerHeight;

        if (dialogEl) {
            const dialogRect = dialogEl.getBoundingClientRect();
            topLimit = dialogRect.top;
            const footerEl = dialogEl.querySelector("[data-dialog-footer]") as HTMLElement | null;
            bottomLimit = footerEl ? footerEl.getBoundingClientRect().top : dialogRect.bottom;
        }

        const spaceBelow = bottomLimit - (rect.bottom + DROPDOWN_GAP_PX);
        const available = spaceBelow;
        const clamped = Math.max(
            DROPDOWN_MIN_HEIGHT_PX,
            Math.min(DROPDOWN_MAX_HEIGHT_PX, Math.floor(available))
        );

        setDropdownMaxHeight(clamped);
    }, []);

    useEffect(() => {
        if (!open) return;
        updateDropdownPlacement();
        const onResize = () => updateDropdownPlacement();
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, true);
        return () => {
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onResize, true);
        };
    }, [open, updateDropdownPlacement, value.length, query]);

    // Flatten for keyboard navigation
    const flatForKeyboard = useMemo(() => {
        const out: Subject[] = [];
        for (const level of orderedLevels) {
            if (collapsedLevels.has(level)) continue;
            out.push(...(groupedByLevel.get(level) ?? []));
        }
        return out;
    }, [orderedLevels, groupedByLevel, collapsedLevels]);

    const visibleFlatForKeyboard = useMemo(
        () => flatForKeyboard.slice(0, MAX_VISIBLE_SUBJECTS),
        [flatForKeyboard]
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) =>
                prev < visibleFlatForKeyboard.length - 1 ? prev + 1 : 0
            );
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) =>
                prev > 0 ? prev - 1 : visibleFlatForKeyboard.length - 1
            );
        } else if (
            e.key === "Enter" &&
            highlightedIndex >= 0 &&
            visibleFlatForKeyboard[highlightedIndex]
        ) {
            e.preventDefault();
            toggleSubject(visibleFlatForKeyboard[highlightedIndex]);
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    const comboboxRowStyles = cn(
        "w-[calc(100%-6px)] mx-1 my-0.5 flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-lg transition-colors border border-transparent"
    );

    function renderSubjectRow(subject: Subject, idx: number, isHighlighted: boolean, isSelected: boolean) {
        const looksHovered = isHighlighted || isSelected;
        const levelInfo = getEducationLevel(subject.education_level as EducationLevel);

        return (
            <button
                key={subject.id}
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    toggleSubject(subject);
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
                {subject.color && (
                    <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: subject.color }}
                    />
                )}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate font-satoshi">
                            {subject.name}
                        </span>
                        <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSubject(subject)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-lg shrink-0 border-brand-primary/30 data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent"
                        />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {levelInfo && (
                            <span
                                className={cn(
                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold font-satoshi",
                                    "bg-brand-primary/5 text-brand-primary/70 border-brand-primary/15"
                                )}
                                style={{
                                    backgroundColor: `${LEVEL_COLORS[levelInfo.key]}1A`,
                                    borderColor: `${LEVEL_COLORS[levelInfo.key]}40`,
                                    color: LEVEL_COLORS[levelInfo.key],
                                }}
                            >
                                {levelInfo.shortLabel}
                            </span>
                        )}
                        {subject.grade_levels && subject.grade_levels.length > 0 && (
                            <>
                                {[...subject.grade_levels]
                                    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
                                    .map((year) => (
                                    <YearTag key={year} year={year} />
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </button>
        );
    }

    return (
        <div ref={containerRef} className="relative">
            {/* Input + selected chips/summary */}
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
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setOpen(true);
                            setHighlightedIndex(-1);
                            if (e.target.value.trim() !== "") {
                                setShowAllSubjects(true);
                            }
                        }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder={value.length === 0 ? "Selecionar disciplinas..." : "Adicionar..."}
                        disabled={disabled}
                        className="flex-1 min-w-0 bg-transparent text-sm text-brand-primary placeholder:text-brand-primary/40 outline-none font-satoshi"
                    />
                    {loading && <Loader2 className="h-3.5 w-3.5 text-brand-primary/30 animate-spin shrink-0" />}
                </div>

                {value.length === 1 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span
                            className="inline-flex items-center gap-1 rounded-full border pl-1.5 pr-1.5 py-0.5 text-[11px] font-medium font-satoshi shrink-0"
                            style={{
                                backgroundColor: value[0].color ? `${value[0].color}15` : "rgba(15, 23, 42, 0.05)",
                                borderColor: value[0].color ? `${value[0].color}40` : "rgba(15, 23, 42, 0.1)",
                                color: value[0].color || "rgba(15, 23, 42, 0.9)",
                            }}
                        >
                            {value[0].color && (
                                <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: value[0].color }}
                                />
                            )}
                            <span className="truncate max-w-[120px]">{value[0].name}</span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSubject(value[0]);
                                }}
                                className="rounded-full p-0.5 opacity-60 hover:opacity-100 transition-all shrink-0"
                                disabled={disabled}
                            >
                                <X className="h-2.5 w-2.5" />
                            </button>
                        </span>
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
                                {value.length} disciplinas
                                <ChevronDown className="h-3 w-3 opacity-70" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="min-w-72 p-2 rounded-xl border-brand-primary/10 font-satoshi" align="start" sideOffset={4}>
                            <div className="max-h-56 overflow-y-auto space-y-0.5">
                                {value.map((subject) => {
                                    const levelInfo = subject.education_level
                                        ? getEducationLevel(subject.education_level as EducationLevel)
                                        : undefined;
                                    return (
                                        <button
                                            key={subject.id}
                                            type="button"
                                            onClick={() => toggleSubject(subject)}
                                            className={cn(
                                                "w-full my-0.5 flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-lg transition-colors border border-transparent",
                                                "bg-brand-accent/8 text-brand-accent border-brand-accent/20 hover:bg-brand-accent/12"
                                            )}
                                        >
                                            {subject.color && (
                                                <span
                                                    className="h-3 w-3 rounded-full shrink-0"
                                                    style={{ backgroundColor: subject.color }}
                                                />
                                            )}
                                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-medium truncate font-satoshi">
                                                        {subject.name}
                                                    </span>
                                                    <Checkbox
                                                        checked={true}
                                                        onCheckedChange={() => toggleSubject(subject)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="rounded-lg shrink-0 border-brand-primary/30 data-[state=checked]:bg-brand-accent data-[state=checked]:border-brand-accent"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {levelInfo && (
                                                        <span
                                                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold font-satoshi"
                                                            style={{
                                                                backgroundColor: `${LEVEL_COLORS[levelInfo.key]}1A`,
                                                                borderColor: `${LEVEL_COLORS[levelInfo.key]}40`,
                                                                color: LEVEL_COLORS[levelInfo.key],
                                                            }}
                                                        >
                                                            {levelInfo.shortLabel}
                                                        </span>
                                                    )}
                                                    {subject.grade_levels?.map((year) => (
                                                        <YearTag key={year} year={year} />
                                                    ))}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
            </div>

            {/* Dropdown */}
            {open && (query.trim() || allSubjects.length > 0 || loading) && (
                <div
                    className={cn(
                        "absolute z-50 w-full bg-white rounded-xl border border-brand-primary/10 shadow-lg overflow-hidden",
                        "mt-1.5"
                    )}
                >
                    <div
                        className="overflow-y-auto py-1.5 px-1.5"
                        style={{ maxHeight: `${dropdownMaxHeight}px` }}
                        onMouseLeave={() => setHighlightedIndex(-1)}
                    >
                        {filteredSubjects.length === 0 && !loading && (
                            <div className="px-3 py-4 text-center text-sm text-brand-primary/40 font-satoshi">
                                {query.trim()
                                    ? "Nenhuma disciplina encontrada"
                                    : hasPreferredSubjects && !showAllSubjects
                                      ? "Sem disciplinas preferidas no perfil"
                                      : "Nenhuma disciplina"}
                            </div>
                        )}
                        {loading && filteredSubjects.length === 0 && (
                            <div className="px-3 py-4 text-center text-sm text-brand-primary/40 font-satoshi flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                A procurar...
                            </div>
                        )}

                        {(() => {
                            let flatIdx = 0;
                            return orderedLevels.map((level) => {
                                const subjectsInLevel = groupedByLevel.get(level) ?? [];
                                const levelInfo = getEducationLevel(level as EducationLevel);
                                const isCollapsed = collapsedLevels.has(level);
                                const startIdx = flatIdx;
                                if (!isCollapsed) flatIdx += subjectsInLevel.length;

                                return (
                                <div key={level} className="mb-0.5">
                                    <button
                                        type="button"
                                        onClick={() => toggleCollapsed(level)}
                                        className="w-[calc(100%-6px)] mx-1 flex items-center gap-2 px-2 py-1 rounded-lg text-left text-xs font-semibold text-brand-primary/70 hover:bg-brand-primary/5 border border-transparent"
                                    >
                                        {isCollapsed ? (
                                            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                        ) : (
                                            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                        )}
                                        <span>{levelInfo?.shortLabel || level}</span>
                                        <span className="text-brand-primary/40 font-normal">({subjectsInLevel.length})</span>
                                    </button>
                                    {!isCollapsed &&
                                        subjectsInLevel.map((subject, idx) => {
                                            const globalIdx = startIdx + idx;
                                            const isSelected = selectedIds.has(subject.id);
                                            return renderSubjectRow(subject, globalIdx, highlightedIndex === globalIdx, isSelected);
                                        })}
                                </div>
                                );
                            });
                        })()}
                    </div>

                    {(hasPreferredSubjects && !showAllSubjects && query.trim() === "") ||
                    totalFilteredCount > MAX_VISIBLE_SUBJECTS ? (
                        <div className="bg-white px-2.5 py-2">
                            {hasPreferredSubjects && !showAllSubjects && query.trim() === "" && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllSubjects(true)}
                                    className="w-full text-center text-[12px] font-satoshi font-medium text-brand-primary/60 hover:text-brand-primary underline underline-offset-4 decoration-brand-primary/25 hover:decoration-brand-primary/50 transition-colors"
                                >
                                    Carregar todas
                                </button>
                            )}

                            {totalFilteredCount > MAX_VISIBLE_SUBJECTS && (
                                <div className="pt-1 text-[11px] text-brand-primary/40 font-satoshi text-center">
                                    A mostrar {MAX_VISIBLE_SUBJECTS} de {totalFilteredCount}. Refina a pesquisa para ver mais.
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
