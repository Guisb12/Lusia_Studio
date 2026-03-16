"use client";

import {
    User,
    Mail,
    Phone,
    Building2,
    Calendar,
    GraduationCap,
    UserCircle,
    Hash,
} from "lucide-react";
import { CourseTag, resolveCourseKey } from "@/components/ui/course-tag";
import type { Member } from "@/lib/members";

interface StudentInfoTabProps {
    student: Member;
}

function extractGrade(gradeLevel: string | null): string | null {
    if (!gradeLevel) return null;
    const match = gradeLevel.match(/(\d+)/);
    return match ? match[1] : null;
}

export function StudentInfoTab({ student }: StudentInfoTabProps) {
    const grade = extractGrade(student.grade_level);
    const enrollmentDate = student.created_at
        ? new Date(student.created_at).toLocaleDateString("pt-PT", {
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : null;

    const hasContact = student.full_name || student.email || student.phone;
    const hasAcademic = student.school_name || student.course || grade || enrollmentDate;
    const hasParent =
        student.parent_name || student.parent_email || student.parent_phone;

    if (!hasContact && !hasAcademic && !hasParent) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <User className="h-8 w-8 text-brand-primary/20 mb-2" />
                <p className="text-sm text-brand-primary/40">
                    Sem informação de contacto disponível.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── Contact ── */}
            {hasContact && (
                <Section title="Contacto">
                    {student.full_name && (
                        <Row icon={User} label="Nome completo" value={student.full_name} />
                    )}
                    {student.email && (
                        <Row icon={Mail} label="Email" value={student.email} />
                    )}
                    {student.phone && (
                        <Row icon={Phone} label="Telefone" value={student.phone} />
                    )}
                </Section>
            )}

            {/* ── Academic ── */}
            {hasAcademic && (
                <Section title="Académico">
                    {student.school_name && (
                        <Row icon={Building2} label="Escola" value={student.school_name} />
                    )}
                    {grade && (
                        <div className="flex items-center gap-2.5 py-2">
                            <Hash className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
                            <span className="text-[10px] text-brand-primary/35 w-24 shrink-0">Ano</span>
                            <div className="flex-1 min-w-0">
                                <span
                                    style={{ color: "#4B5563", backgroundColor: "#F3F4F6", border: "1.5px solid #9CA3AF", borderBottomWidth: "3px" }}
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none"
                                >
                                    {grade}º
                                </span>
                            </div>
                        </div>
                    )}
                    {student.course && (() => {
                        const key = resolveCourseKey(student.course);
                        return (
                            <div className="flex items-center gap-2.5 py-2">
                                <GraduationCap className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
                                <span className="text-[10px] text-brand-primary/35 w-24 shrink-0">Curso</span>
                                <div className="flex-1 min-w-0">
                                    {key ? <CourseTag courseKey={key} size="sm" /> : (
                                        <span className="text-[13px] text-brand-primary truncate">{student.course}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                    {enrollmentDate && (
                        <Row icon={Calendar} label="Inscrito desde" value={enrollmentDate} />
                    )}
                </Section>
            )}

            {/* ── Parent / guardian ── */}
            {hasParent && (
                <Section title="Encarregado de Educação">
                    {student.parent_name && (
                        <Row icon={UserCircle} label="Nome" value={student.parent_name} />
                    )}
                    {student.parent_email && (
                        <Row icon={Mail} label="Email" value={student.parent_email} />
                    )}
                    {student.parent_phone && (
                        <Row icon={Phone} label="Telefone" value={student.parent_phone} />
                    )}
                </Section>
            )}
        </div>
    );
}

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
    value: string;
}) {
    return (
        <div className="flex items-center gap-2.5 py-2">
            <Icon className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
            <span className="text-[10px] text-brand-primary/35 w-24 shrink-0">{label}</span>
            <span className="text-[13px] text-brand-primary truncate flex-1">{value}</span>
        </div>
    );
}
