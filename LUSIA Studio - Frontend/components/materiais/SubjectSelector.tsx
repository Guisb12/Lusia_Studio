"use client";

import React, { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { SubjectRow } from "@/components/ui/subject-row";
import { cn } from "@/lib/utils";
import type { MaterialSubject, SubjectCatalog, SubjectStatus } from "@/lib/materials";

const STATUS_DESCRIPTIONS: Partial<Record<SubjectStatus, string>> = {
    viable: "Sem currículo disponível",
    gpa_only: "Apenas cálculo de nota",
};

interface SubjectSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    catalog: SubjectCatalog | null;
    selectedSubjects: MaterialSubject[];
    onToggleSubject: (subject: MaterialSubject) => void;
    onRemoveSubject: (subjectId: string) => void;
    /** Subjects with these statuses are hidden from all lists. */
    excludeStatuses?: SubjectStatus[];
    /** Subjects with these statuses show a warning tooltip (amber ?) with the given text. */
    warningStatuses?: Partial<Record<SubjectStatus, string>>;
}

function CollapsibleGroup({
    label,
    children,
    defaultOpen = false,
}: {
    label: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div>
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider hover:text-brand-primary/60 transition-colors"
            >
                {open ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                )}
                {label}
            </button>
            {open && <div className="space-y-0.5">{children}</div>}
        </div>
    );
}

export function SubjectSelector({
    open,
    onOpenChange,
    catalog,
    selectedSubjects,
    onToggleSubject,
    onRemoveSubject,
    excludeStatuses = [],
    warningStatuses = {},
}: SubjectSelectorProps) {
    const [search, setSearch] = useState("");

    const selectedIds = useMemo(
        () => new Set(selectedSubjects.map((s) => s.id)),
        [selectedSubjects]
    );

    const filterSubjects = (subjects: MaterialSubject[]) => {
        let filtered = subjects;
        if (excludeStatuses.length > 0) {
            filtered = filtered.filter((s) => !excludeStatuses.includes(s.status as SubjectStatus));
        }
        if (!search.trim()) return filtered;
        const q = search.toLowerCase();
        return filtered.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.slug?.toLowerCase().includes(q)
        );
    };

    const getWarning = (s: MaterialSubject): string | undefined =>
        s.status ? warningStatuses[s.status as SubjectStatus] : undefined;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0 gap-0 bg-white rounded-2xl">
                <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
                    <DialogTitle className="text-lg font-satoshi font-bold text-brand-primary">
                        Selecionar Disciplinas
                    </DialogTitle>
                </DialogHeader>

                {/* Search */}
                <div className="px-5 py-3 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-primary/30 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Pesquisar disciplinas..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-xl border-2 border-brand-primary/10 bg-brand-primary/3 pl-9 pr-4 py-2.5 text-sm text-brand-primary placeholder:text-brand-primary/30 outline-none transition-all duration-200 focus:border-brand-accent/40 font-satoshi"
                        />
                    </div>
                </div>

                {/* Scrollable list */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 min-h-0">
                    {/* Selected subjects */}
                    {selectedSubjects.length > 0 && (
                        <div className="mb-2">
                            <div className="px-3 py-2 text-[11px] font-satoshi font-bold text-brand-primary/40 uppercase tracking-wider">
                                Selecionadas
                            </div>
                            <div className="space-y-0.5">
                                {filterSubjects(selectedSubjects).map((s) => (
                                    <SubjectRow
                                        key={s.id}
                                        name={s.name}
                                        icon={s.icon}
                                        color={s.color}
                                        gradeBadges={s.grade_levels}
                                        description={s.status ? STATUS_DESCRIPTIONS[s.status] : undefined}
                                        warningTooltip={getWarning(s)}
                                        isSelected={true}
                                        onToggle={() => onToggleSubject(s)}
                                        onRemove={() => onRemoveSubject(s.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Profile subjects ("Minhas disciplinas") — always show catalog.selected_subjects so they're easy to find */}
                    {catalog?.selected_subjects &&
                        catalog.selected_subjects.length > 0 && (() => {
                            // Only show profile subjects that are NOT already in selectedSubjects (to avoid duplication with the "Selecionadas" section above)
                            const profileSubjects = filterSubjects(
                                catalog.selected_subjects.filter((s) => !selectedIds.has(s.id))
                            );
                            if (profileSubjects.length === 0) return null;
                            return (
                                <CollapsibleGroup label="Minhas disciplinas" defaultOpen>
                                    {profileSubjects.map((s) => (
                                        <SubjectRow
                                            key={s.id}
                                            name={s.name}
                                            icon={s.icon}
                                            color={s.color}
                                            gradeBadges={s.grade_levels}
                                            description={s.status ? STATUS_DESCRIPTIONS[s.status] : undefined}
                                            warningTooltip={getWarning(s)}
                                            isSelected={selectedIds.has(s.id)}
                                            onToggle={() => onToggleSubject(s)}
                                            onRemove={() => onRemoveSubject(s.id)}
                                        />
                                    ))}
                                </CollapsibleGroup>
                            );
                        })()}

                    {/* Custom subjects */}
                    {catalog?.more_subjects.custom &&
                        catalog.more_subjects.custom.length > 0 && (
                            <CollapsibleGroup label="Personalizadas">
                                {filterSubjects(catalog.more_subjects.custom).map(
                                    (s) => (
                                        <SubjectRow
                                            key={s.id}
                                            name={s.name}
                                            icon={s.icon}
                                            color={s.color}
                                            gradeBadges={s.grade_levels}
                                            description={s.status ? STATUS_DESCRIPTIONS[s.status] : undefined}
                                            warningTooltip={getWarning(s)}
                                            isSelected={selectedIds.has(s.id)}
                                            onToggle={() => onToggleSubject(s)}
                                            onRemove={() =>
                                                onRemoveSubject(s.id)
                                            }
                                        />
                                    )
                                )}
                            </CollapsibleGroup>
                        )}

                    {/* Education level groups */}
                    {catalog?.more_subjects.by_education_level.map((group) => {
                        const filteredSubjects = filterSubjects(group.subjects);
                        if (filteredSubjects.length === 0) return null;
                        return (
                            <CollapsibleGroup
                                key={group.education_level}
                                label={group.education_level_label}
                            >
                                {filteredSubjects.map((s) => (
                                    <SubjectRow
                                        key={s.id}
                                        name={s.name}
                                        icon={s.icon}
                                        color={s.color}
                                        gradeBadges={s.grade_levels}
                                        description={s.status ? STATUS_DESCRIPTIONS[s.status] : undefined}
                                        warningTooltip={getWarning(s)}
                                        isSelected={selectedIds.has(s.id)}
                                        onToggle={() => onToggleSubject(s)}
                                        onRemove={() =>
                                            onRemoveSubject(s.id)
                                        }
                                    />
                                ))}
                            </CollapsibleGroup>
                        );
                    })}

                    {/* Empty state */}
                    {!catalog && (
                        <div className="flex items-center justify-center py-12 text-sm text-brand-primary/30 font-satoshi">
                            A carregar disciplinas...
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
