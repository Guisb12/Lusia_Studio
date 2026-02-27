"use client";

import React, { useState } from "react";
import { Mail, Phone, Calendar, Euro, Check, X, Pencil } from "lucide-react";
import type { Member } from "@/lib/members";
import { updateMember } from "@/lib/members";

interface TeacherInfoTabProps {
    teacher: Member;
    onTeacherUpdated?: (updated: Member) => void;
}

function InfoRow({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ElementType;
    label: string;
    value: string | null | undefined;
}) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3 py-3 border-b border-brand-primary/5 last:border-0">
            <div className="h-8 w-8 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="h-4 w-4 text-brand-primary/40" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] text-brand-primary/40 mb-0.5">{label}</p>
                <p className="text-sm text-brand-primary truncate">{value}</p>
            </div>
        </div>
    );
}

export function TeacherInfoTab({ teacher, onTeacherUpdated }: TeacherInfoTabProps) {
    const [editingRate, setEditingRate] = useState(false);
    const [rateValue, setRateValue] = useState(
        teacher.hourly_rate !== null ? String(teacher.hourly_rate) : "",
    );
    const [saving, setSaving] = useState(false);

    const enrollmentDate = teacher.created_at
        ? new Date(teacher.created_at).toLocaleDateString("pt-PT", {
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : null;

    async function saveRate() {
        const parsed = rateValue.trim() ? parseFloat(rateValue) : null;
        if (rateValue.trim() && (isNaN(parsed!) || parsed! < 0)) return;

        setSaving(true);
        try {
            const updated = await updateMember(teacher.id, {
                hourly_rate: parsed,
            });
            onTeacherUpdated?.(updated);
            setEditingRate(false);
        } catch (e) {
            console.error("Failed to update hourly rate:", e);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-1">
            {/* Contact */}
            <div className="mb-4">
                <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                    Contacto
                </h4>
                <InfoRow icon={Mail} label="Email" value={teacher.email} />
                <InfoRow icon={Phone} label="Telefone" value={teacher.phone} />
                <InfoRow icon={Calendar} label="Membro desde" value={enrollmentDate} />
            </div>

            {/* Subjects */}
            {teacher.subjects_taught && teacher.subjects_taught.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2 mt-4">
                        Disciplinas
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {teacher.subjects_taught.map((s) => {
                            const c = "#0d2f7f";
                            return (
                                <span
                                    key={s}
                                    style={{
                                        color: c,
                                        backgroundColor: c + "12",
                                        border: `1.5px solid ${c}`,
                                        borderBottomWidth: "3px",
                                    }}
                                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-none select-none"
                                >
                                    {s}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Hourly Rate */}
            <div>
                <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2 mt-4">
                    Taxa Horaria
                </h4>
                <div className="flex items-start gap-3 py-3 border-b border-brand-primary/5">
                    <div className="h-8 w-8 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0 mt-0.5">
                        <Euro className="h-4 w-4 text-brand-primary/40" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-brand-primary/40 mb-0.5">
                            Valor por hora
                        </p>
                        {editingRate ? (
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm text-brand-primary">€</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={rateValue}
                                    onChange={(e) => setRateValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") saveRate();
                                        if (e.key === "Escape") {
                                            setEditingRate(false);
                                            setRateValue(
                                                teacher.hourly_rate !== null
                                                    ? String(teacher.hourly_rate)
                                                    : "",
                                            );
                                        }
                                    }}
                                    className="w-20 h-7 text-sm text-brand-primary bg-brand-primary/5 border border-brand-primary/10 rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-brand-primary/20"
                                    autoFocus
                                    disabled={saving}
                                />
                                <span className="text-sm text-brand-primary/40">/hora</span>
                                <button
                                    onClick={saveRate}
                                    disabled={saving}
                                    className="h-6 w-6 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-colors"
                                >
                                    <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingRate(false);
                                        setRateValue(
                                            teacher.hourly_rate !== null
                                                ? String(teacher.hourly_rate)
                                                : "",
                                        );
                                    }}
                                    className="h-6 w-6 rounded-md bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <p className="text-sm text-brand-primary">
                                    {teacher.hourly_rate !== null
                                        ? `€${teacher.hourly_rate}/hora`
                                        : "Nao definido"}
                                </p>
                                <button
                                    onClick={() => setEditingRate(true)}
                                    className="h-6 w-6 rounded-md bg-brand-primary/5 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                                >
                                    <Pencil className="h-3 w-3" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
