"use client";

import React, { useState, useMemo } from "react";
import { Calendar, Mail, Phone, X } from "lucide-react";
import type { Member } from "@/lib/members";
import { updateTeacher } from "@/lib/queries/teachers";
import { useUser } from "@/components/providers/UserProvider";
import { useSubjects } from "@/lib/hooks/useSubjects";
import { getSubjectIcon } from "@/lib/icons";
import { RoleBadge } from "@/components/ui/role-badge";
import { cn } from "@/lib/utils";

interface TeacherInfoTabProps {
    teacher: Member;
    onTeacherUpdated?: (updated: Member) => void;
}

export function TeacherInfoTab({ teacher, onTeacherUpdated }: TeacherInfoTabProps) {
    const { user } = useUser();
    const isAdmin = user?.role === "admin";
    const isSelf = user?.id === teacher.id;
    const isTeacherRole = teacher.role === "teacher";

    const [roleChanging, setRoleChanging] = useState(false);
    const [confirmingRole, setConfirmingRole] = useState(false);

    const { subjects: allSubjects } = useSubjects({ includeCustom: true });

    // Resolve subject IDs to full subject objects
    const resolvedSubjects = useMemo(() => {
        const ids = teacher.subjects_taught ?? [];
        if (ids.length === 0 || allSubjects.length === 0) return [];
        const map = new Map(allSubjects.map((s) => [s.id, s]));
        return ids
            .map((id) => map.get(id))
            .filter((s): s is NonNullable<typeof s> => Boolean(s));
    }, [teacher.subjects_taught, allSubjects]);

    const enrollmentDate = teacher.created_at
        ? new Date(teacher.created_at).toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "long",
            year: "numeric",
        })
        : null;

    return (
        <div className="space-y-4">
            {/* ── Contact ── */}
            <Section title="Contacto">
                <Row icon={Mail} label="Email" value={teacher.email} />
                <Row icon={Phone} label="Telefone" value={teacher.phone} />
                <Row icon={Calendar} label="Membro desde" value={enrollmentDate} />
            </Section>

            {/* ── Disciplines ── */}
            {resolvedSubjects.length > 0 && (
                <Section title="Disciplinas">
                    {resolvedSubjects.map((subject, i) => {
                        const Icon = getSubjectIcon(subject.icon);
                        const color = subject.color;
                        return (
                            <div
                                key={subject.id}
                                className={cn(
                                    "flex items-center gap-2.5 py-2",
                                    i > 0 && "border-t border-brand-primary/[0.06]",
                                )}
                            >
                                <Icon
                                    className="h-3.5 w-3.5 shrink-0"
                                    style={{ color: color || undefined }}
                                />
                                <span className="text-[13px] text-brand-primary truncate">
                                    {subject.name}
                                </span>
                            </div>
                        );
                    })}
                </Section>
            )}

            {/* ── Permissions ── */}
            <Section title="Cargo">
                <div className="flex items-center justify-between py-2">
                    <RoleBadge role={teacher.role} />

                    {isAdmin && !isSelf && (
                        <>
                            {confirmingRole ? (
                                <div className="flex items-center gap-2">
                                    <p className="text-[11px] text-brand-primary/60">
                                        {isTeacherRole ? "Promover a admin?" : "Reverter para professor?"}
                                    </p>
                                    <button
                                        onClick={async () => {
                                            setRoleChanging(true);
                                            try {
                                                const updated = await updateTeacher(teacher.id, {
                                                    role: isTeacherRole ? "admin" : "teacher",
                                                });
                                                onTeacherUpdated?.(updated);
                                                setConfirmingRole(false);
                                            } catch (error) {
                                                console.error("Failed to update role:", error);
                                            } finally {
                                                setRoleChanging(false);
                                            }
                                        }}
                                        disabled={roleChanging}
                                        className="h-5 px-2 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 transition-colors text-[10px] font-medium"
                                    >
                                        {roleChanging ? "..." : "Confirmar"}
                                    </button>
                                    <button
                                        onClick={() => setConfirmingRole(false)}
                                        disabled={roleChanging}
                                        className="h-5 w-5 rounded-md bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmingRole(true)}
                                    className="text-[10px] text-brand-primary/40 hover:text-brand-primary transition-colors underline underline-offset-2"
                                >
                                    {isTeacherRole ? "Promover" : "Reverter"}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </Section>
        </div>
    );
}

/* ─────────────────── Shared Components ─────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h4 className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider mb-2">
                {title}
            </h4>
            <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                <div className="bg-white rounded-md shadow-sm px-3.5 py-1 divide-y divide-brand-primary/[0.06]">
                    {children}
                </div>
            </div>
        </div>
    );
}

function Row({
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
        <div className="flex items-center gap-2.5 py-2">
            <Icon className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
            <span className="text-[10px] text-brand-primary/35 w-24 shrink-0">{label}</span>
            <span className="text-[13px] text-brand-primary truncate flex-1">{value}</span>
        </div>
    );
}
