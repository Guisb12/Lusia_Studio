"use client";

import * as React from "react";
import type { Subject } from "@/types/subjects";

import {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxChipsInput,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxItem,
    ComboboxLabel,
    ComboboxList,
    ComboboxSeparator,
} from "@/components/ui/combobox";

/* ─────────────────────────────────────────────────────────────── */

interface SubjectComboboxProps {
    /** All available subjects (pass from useSubjects or externally) */
    subjects: Subject[];
    /** Currently selected subject IDs */
    value: Subject[];
    /** Called whenever the selection changes */
    onValueChange: (subjects: Subject[]) => void;
    /** Placeholder text */
    placeholder?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Loading state */
    loading?: boolean;
    /** Optional className for the root */
    className?: string;
}

/* ─────────────────────────────────────────────────────────────── */

export function SubjectCombobox({
    subjects,
    value,
    onValueChange,
    placeholder = "Pesquisar disciplinas…",
    disabled = false,
    loading = false,
    className,
}: SubjectComboboxProps) {
    // Split into global vs custom for grouped display
    const globalSubjects = subjects.filter((s) => !s.is_custom);
    const customSubjects = subjects.filter((s) => s.is_custom);

    return (
        <div className={className}>
            <Combobox
                items={subjects}
                itemToStringValue={(s) => s.name}
                multiple
                value={value}
                onValueChange={onValueChange}
            >
                <ComboboxChips>
                    {value.map((s) => (
                        <ComboboxChip key={s.id}>
                            {s.color && (
                                <span
                                    className="inline-block size-2 rounded-full shrink-0"
                                    style={{ backgroundColor: s.color }}
                                />
                            )}
                            {s.name}
                        </ComboboxChip>
                    ))}
                    <ComboboxChipsInput
                        placeholder={value.length === 0 ? placeholder : ""}
                        disabled={disabled}
                    />
                </ComboboxChips>

                <ComboboxContent>
                    <ComboboxEmpty>
                        {loading
                            ? "Carregando…"
                            : "Nenhuma disciplina encontrada."}
                    </ComboboxEmpty>

                    <ComboboxList>
                        {() => (
                            <>
                                {/* ── Global subjects ── */}
                                {globalSubjects.length > 0 && (
                                    <ComboboxGroup>
                                        <ComboboxLabel>Disciplinas</ComboboxLabel>
                                        {globalSubjects.map((s) => (
                                            <ComboboxItem key={s.id} value={s}>
                                                <SubjectItemContent subject={s} />
                                            </ComboboxItem>
                                        ))}
                                    </ComboboxGroup>
                                )}

                                {/* ── Separator ── */}
                                {globalSubjects.length > 0 && customSubjects.length > 0 && (
                                    <ComboboxSeparator />
                                )}

                                {/* ── Custom subjects ── */}
                                {customSubjects.length > 0 && (
                                    <ComboboxGroup>
                                        <ComboboxLabel>Personalizadas</ComboboxLabel>
                                        {customSubjects.map((s) => (
                                            <ComboboxItem key={s.id} value={s}>
                                                <SubjectItemContent subject={s} isCustom />
                                            </ComboboxItem>
                                        ))}
                                    </ComboboxGroup>
                                )}
                            </>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────── */

function SubjectItemContent({
    subject,
    isCustom = false,
}: {
    subject: Subject;
    isCustom?: boolean;
}) {
    return (
        <span className="flex items-center gap-2">
            {/* Color swatch */}
            <span
                className="inline-block size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: subject.color ?? "#0a1bb6" }}
            />

            {/* Name */}
            <span className="truncate">{subject.name}</span>

            {/* Custom badge */}
            {isCustom && (
                <span className="ml-auto shrink-0 rounded-md bg-brand-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-accent leading-none">
                    Custom
                </span>
            )}
        </span>
    );
}
