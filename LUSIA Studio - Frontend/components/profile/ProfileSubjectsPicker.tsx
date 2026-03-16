"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Loader2, Pencil } from "lucide-react";
import { ProfileCard, ProfileSectionLabel } from "@/components/profile/ProfilePrimitives";
import { SubjectSelector } from "@/components/materiais/SubjectSelector";
import { useSubjectCatalogQuery } from "@/lib/queries/subjects";
import { getSubjectIcon } from "@/lib/icons";
import type { MaterialSubject } from "@/lib/materials";

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
    onSave,
}: ProfileSubjectsPickerProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const snapshotRef = useRef<string[]>([]);

    const { data: catalog, isLoading: loadingCatalog } = useSubjectCatalogQuery(true);

    /* Build selected MaterialSubject[] from catalog + selectedIds */
    const allCatalogSubjects = useMemo<MaterialSubject[]>(() => {
        if (!catalog) return [];
        const map = new Map<string, MaterialSubject>();
        for (const s of catalog.selected_subjects) map.set(s.id, s);
        for (const s of catalog.more_subjects.custom) map.set(s.id, s);
        for (const group of catalog.more_subjects.by_education_level) {
            for (const s of group.subjects) map.set(s.id, s);
        }
        return Array.from(map.values());
    }, [catalog]);

    const selectedSubjects = useMemo(
        () => {
            const idSet = new Set(selectedIds);
            return allCatalogSubjects.filter(s => idSet.has(s.id));
        },
        [allCatalogSubjects, selectedIds],
    );

    const handleToggle = useCallback((subject: MaterialSubject) => {
        const exists = selectedIds.includes(subject.id);
        const next = exists
            ? selectedIds.filter(id => id !== subject.id)
            : [...selectedIds, subject.id];
        onChange(next);
    }, [selectedIds, onChange]);

    const handleRemove = useCallback((subjectId: string) => {
        onChange(selectedIds.filter(id => id !== subjectId));
    }, [selectedIds, onChange]);

    const handleOpenDialog = () => {
        snapshotRef.current = [...selectedIds];
        setDialogOpen(true);
    };

    const handleDialogClose = useCallback(async (open: boolean) => {
        if (open) { setDialogOpen(true); return; }
        setDialogOpen(false);

        // Check if anything changed
        const prev = new Set(snapshotRef.current);
        const curr = new Set(selectedIds);
        const changed = prev.size !== curr.size || [...curr].some(id => !prev.has(id));
        if (!changed) return;

        setSaving(true);
        try { await onSave(selectedIds); }
        finally { setSaving(false); }
    }, [selectedIds, onSave]);

    return (
        <section>
            <ProfileSectionLabel
                right={
                    <button
                        onClick={handleOpenDialog}
                        disabled={saving}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-brand-primary/30 hover:text-brand-accent hover:bg-brand-accent/[0.04] transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Pencil className="h-2.5 w-2.5" />}
                        Editar
                    </button>
                }
            >
                Disciplinas
            </ProfileSectionLabel>

            {loadingCatalog ? (
                <ProfileCard>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-brand-accent/40" />
                    </div>
                </ProfileCard>
            ) : selectedSubjects.length === 0 ? (
                <ProfileCard>
                    <div className="px-3.5 py-6 text-center">
                        <p className="text-[13px] text-brand-primary/25 italic">Nenhuma disciplina selecionada</p>
                    </div>
                </ProfileCard>
            ) : (
                <ProfileCard>
                    <div className="px-3.5 py-1 divide-y divide-brand-primary/[0.06]">
                        {selectedSubjects.map((s) => {
                            const Icon = getSubjectIcon(s.icon);
                            return (
                                <div key={s.id} className="flex items-center gap-2.5 py-2">
                                    <Icon
                                        className="h-3.5 w-3.5 shrink-0"
                                        style={{ color: s.color || undefined }}
                                    />
                                    <span className="text-[13px] text-brand-primary truncate">
                                        {s.name}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </ProfileCard>
            )}

            <SubjectSelector
                open={dialogOpen}
                onOpenChange={handleDialogClose}
                catalog={catalog ?? null}
                selectedSubjects={selectedSubjects}
                onToggleSubject={handleToggle}
                onRemoveSubject={handleRemove}
            />
        </section>
    );
}
