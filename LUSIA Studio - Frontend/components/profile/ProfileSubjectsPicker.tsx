"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { SubjectRow } from "@/components/ui/subject-row";
import { EDUCATION_LEVELS } from "@/lib/curriculum";
import { cn } from "@/lib/utils";

interface SubjectData {
    id: string;
    name: string;
    slug?: string;
    color?: string | null;
    icon?: string | null;
    grade_levels?: string[];
    status?: string;
}

interface ProfileSubjectsPickerProps {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    role: "student" | "teacher" | "admin";
    gradeLevel?: string | null;
    saving?: boolean;
    onSave: (ids: string[]) => Promise<void>;
}

export function ProfileSubjectsPicker({
    selectedIds,
    onChange,
    role,
    gradeLevel,
    saving,
    onSave,
}: ProfileSubjectsPickerProps) {
    const [allSubjects, setAllSubjects] = useState<SubjectData[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [search, setSearch] = useState("");
    const [localSaving, setLocalSaving] = useState(false);
    const [originalIds, setOriginalIds] = useState<string[]>([]);

    const educationLevels = useMemo(() => {
        if (role === "student" && gradeLevel) {
            const grade = parseInt(gradeLevel, 10);
            const level = EDUCATION_LEVELS.find(l =>
                grade >= l.grades[0] && grade <= l.grades[l.grades.length - 1]
            );
            return level ? [level.key] : [];
        }
        return EDUCATION_LEVELS.map(l => l.key);
    }, [role, gradeLevel]);

    useEffect(() => {
        if (!educationLevels.length) { setLoading(false); return; }
        let cancelled = false;
        (async () => {
            try {
                const fetched: SubjectData[] = [];
                for (const level of educationLevels) {
                    const params = new URLSearchParams({ education_level: level });
                    if (role === "student" && gradeLevel) params.set("grade", gradeLevel);
                    const res = await fetch(`/api/subjects?${params}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data)) fetched.push(...data);
                    }
                }
                if (!cancelled) {
                    setAllSubjects(Array.from(new Map(fetched.map(s => [s.id, s])).values()));
                }
            } catch { /* silent */ }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [educationLevels, role, gradeLevel]);

    const selectedSubjects = useMemo(
        () => allSubjects.filter(s => selectedIds.includes(s.id)),
        [allSubjects, selectedIds]
    );

    const availableSubjects = useMemo(() => {
        const lower = search.toLowerCase();
        return allSubjects
            .filter(s => !selectedIds.includes(s.id))
            .filter(s => s.status !== "gpa_only")
            .filter(s => !lower || s.name.toLowerCase().includes(lower) || (s.slug || "").toLowerCase().includes(lower));
    }, [allSubjects, selectedIds, search]);

    const handleToggle = useCallback((id: string) => {
        const next = selectedIds.includes(id)
            ? selectedIds.filter(x => x !== id)
            : [...selectedIds, id];
        onChange(next);
    }, [selectedIds, onChange]);

    const handleRemove = useCallback((id: string) => {
        onChange(selectedIds.filter(x => x !== id));
    }, [selectedIds, onChange]);

    const handleStartEdit = () => {
        setOriginalIds([...selectedIds]);
        setEditing(true);
        setSearch("");
    };

    const handleCancel = () => {
        onChange(originalIds);
        setEditing(false);
        setSearch("");
    };

    const handleSave = useCallback(async () => {
        setLocalSaving(true);
        try {
            await onSave(selectedIds);
            setEditing(false);
            setSearch("");
        } finally { setLocalSaving(false); }
    }, [selectedIds, onSave]);

    const isSaving = saving || localSaving;
    const hasChanges = editing && JSON.stringify(selectedIds.sort()) !== JSON.stringify(originalIds.sort());

    return (
        <div className="rounded-2xl border border-brand-primary/[0.07] bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-brand-primary/5">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-brand-primary/45 uppercase tracking-widest">
                        Disciplinas
                    </span>
                    {!loading && !editing && (
                        <span className="text-[10px] font-medium text-brand-primary/25">
                            {selectedIds.length}
                        </span>
                    )}
                </div>
                {editing ? (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => void handleSave()}
                            disabled={isSaving || !hasChanges}
                            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Guardar
                        </button>
                        <button onClick={handleCancel} className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary/40 hover:text-brand-primary/70 transition-colors">
                            <X className="h-3.5 w-3.5" />
                            Cancelar
                        </button>
                    </div>
                ) : (
                    <button onClick={handleStartEdit} className="flex items-center gap-1.5 text-xs font-medium text-brand-primary/35 hover:text-brand-accent transition-colors">
                        <Pencil className="h-3 w-3" /> Editar
                    </button>
                )}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-brand-accent/40" />
                </div>
            ) : (
                <div className="px-3 py-2">
                    {/* Selected subjects — always shown as colored pills when not editing */}
                    {!editing ? (
                        selectedSubjects.length === 0 ? (
                            <p className="text-sm text-brand-primary/30 text-center py-6 italic">
                                Nenhuma disciplina selecionada
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-1.5 px-2 py-2">
                                {selectedSubjects.map(s => {
                                    const color = s.color || "#6B7280";
                                    return (
                                        <span
                                            key={s.id}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                                            style={{
                                                backgroundColor: `${color}12`,
                                                borderColor: `${color}30`,
                                                color: color,
                                            }}
                                        >
                                            {s.name}
                                        </span>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        <>
                            {/* Edit mode: selected as removable rows */}
                            {selectedSubjects.length > 0 && (
                                <div className="mb-2">
                                    {selectedSubjects.map(s => (
                                        <SubjectRow
                                            key={s.id}
                                            name={s.name}
                                            icon={s.icon}
                                            color={s.color}
                                            isSelected
                                            onRemove={() => handleRemove(s.id)}
                                            gradeBadges={s.grade_levels}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Search + available subjects */}
                            <div className="border-t border-brand-primary/5 pt-3">
                                <div className="relative mb-2 px-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-primary/30" />
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Procurar disciplinas..."
                                        className="w-full text-sm text-brand-primary bg-brand-primary/[0.04] border border-brand-primary/10 rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-brand-accent/25 placeholder:text-brand-primary/25 transition-all"
                                    />
                                </div>
                                <div className="max-h-56 overflow-y-auto">
                                    {availableSubjects.length === 0 ? (
                                        <p className="text-xs text-brand-primary/30 text-center py-4 italic">
                                            {search ? "Nenhum resultado" : "Todas as disciplinas já foram adicionadas"}
                                        </p>
                                    ) : (
                                        availableSubjects.map(s => (
                                            <SubjectRow
                                                key={s.id}
                                                name={s.name}
                                                icon={s.icon}
                                                color={s.color}
                                                isSelected={false}
                                                onToggle={() => handleToggle(s.id)}
                                                gradeBadges={s.grade_levels}
                                                warningTooltip={s.status === "viable" ? "Esta disciplina ainda não suporta a Lusia IA" : undefined}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
