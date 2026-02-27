"use client";

import { User, Mail, Phone, Building2, Calendar, GraduationCap } from "lucide-react";
import type { Member } from "@/lib/members";

interface StudentInfoTabProps {
    student: Member;
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

export function StudentInfoTab({ student }: StudentInfoTabProps) {
    const enrollmentDate = student.created_at
        ? new Date(student.created_at).toLocaleDateString("pt-PT", {
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : null;

    return (
        <div className="space-y-1">
            {/* Student contact */}
            <div className="mb-4">
                <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                    Contacto
                </h4>
                <InfoRow icon={Mail} label="Email" value={student.email} />
                <InfoRow icon={Phone} label="Telefone" value={student.phone} />
                <InfoRow icon={Building2} label="Escola" value={student.school_name} />
                <InfoRow icon={GraduationCap} label="Curso" value={student.course} />
                <InfoRow icon={Calendar} label="Inscrito desde" value={enrollmentDate} />
            </div>

            {/* Parent info */}
            {(student.parent_name || student.parent_email || student.parent_phone) && (
                <div>
                    <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2 mt-4">
                        Encarregado de Educacao
                    </h4>
                    <InfoRow icon={User} label="Nome" value={student.parent_name} />
                    <InfoRow icon={Mail} label="Email" value={student.parent_email} />
                    <InfoRow icon={Phone} label="Telefone" value={student.parent_phone} />
                </div>
            )}

            {/* Empty state if nothing to show */}
            {!student.email &&
                !student.phone &&
                !student.school_name &&
                !student.parent_name && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <User className="h-8 w-8 text-brand-primary/20 mb-2" />
                        <p className="text-sm text-brand-primary/40">
                            Sem informacao de contacto disponivel.
                        </p>
                    </div>
                )}
        </div>
    );
}
