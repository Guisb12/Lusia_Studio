"use client";

import React from "react";
import Image from "next/image";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { CourseTag } from "@/components/ui/course-tag";
import { getEducationLevelByGrade, getGradeLabel } from "@/lib/curriculum";
import { Mail, Phone, User } from "lucide-react";

export interface StudentInfo {
    id: string;
    full_name?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    grade_level?: string | null;
    /** Secundário course key (e.g. ciencias_tecnologias). Only set for Ensino Secundário. */
    course?: string | null;
    subject_ids?: string[] | null;
    parent_name?: string | null;
    parent_email?: string | null;
    parent_phone?: string | null;
    subjects?: { id: string; name: string; color?: string }[];
}

interface StudentHoverCardProps {
    student: StudentInfo;
    children: React.ReactNode;
    /** Delay in ms before showing the card (e.g. 1000 for dropdown rows). Default 200. */
    openDelay?: number;
}

export function StudentHoverCard({ student, children, openDelay = 200 }: StudentHoverCardProps) {
    const initials = (student.display_name || student.full_name || "?")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return (
        <HoverCard openDelay={openDelay} closeDelay={100}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>
            <HoverCardContent side="top" className="w-72">
                {/* Header */}
                <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-brand-accent/10 flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-brand-primary/10">
                        {student.avatar_url ? (
                            <Image
                                src={student.avatar_url}
                                alt={student.full_name || ""}
                                width={40}
                                height={40}
                                className="object-cover h-full w-full"
                            />
                        ) : (
                            <span className="text-sm font-semibold text-brand-accent">
                                {initials}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-primary truncate">
                            {student.display_name || student.full_name}
                        </p>
                        {student.display_name && student.full_name && student.display_name !== student.full_name && (
                            <p className="text-xs text-brand-primary/50 truncate">
                                {student.full_name}
                            </p>
                        )}
                        <div className="flex justify-between items-end gap-2 mt-1.5">
                            <div className="min-w-0">
                                {student.course &&
                                    getEducationLevelByGrade(student.grade_level ?? "")?.key === "secundario" && (
                                        <CourseTag courseKey={student.course} size="sm" />
                                    )}
                            </div>
                            {student.grade_level && (
                                <span className="text-[10px] font-medium text-brand-primary/50 tabular-nums shrink-0">
                                    {getGradeLabel(student.grade_level)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Subjects */}
                {student.subjects && student.subjects.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                        {student.subjects.slice(0, 3).map((subj) => (
                            <Badge
                                key={subj.id}
                                variant="outline"
                                className="text-[10px] h-5 gap-1"
                            >
                                {subj.color && (
                                    <span
                                        className="h-2 w-2 rounded-full inline-block"
                                        style={{ backgroundColor: subj.color }}
                                    />
                                )}
                                {subj.name}
                            </Badge>
                        ))}
                        {student.subjects.length > 3 && (
                            <Badge variant="outline" className="text-[10px] h-5">
                                +{student.subjects.length - 3}
                            </Badge>
                        )}
                    </div>
                )}

                {/* Parent info */}
                {(student.parent_name || student.parent_email || student.parent_phone) && (
                    <div className="mt-3 pt-3 border-t border-brand-primary/5 space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-brand-primary/40 font-medium">
                            Encarregado de Educação
                        </p>
                        {student.parent_name && (
                            <div className="flex items-center gap-1.5 text-xs text-brand-primary/70">
                                <User className="h-3 w-3 shrink-0" />
                                <span className="truncate">{student.parent_name}</span>
                            </div>
                        )}
                        {student.parent_email && (
                            <div className="flex items-center gap-1.5 text-xs text-brand-primary/70">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{student.parent_email}</span>
                            </div>
                        )}
                        {student.parent_phone && (
                            <div className="flex items-center gap-1.5 text-xs text-brand-primary/70">
                                <Phone className="h-3 w-3 shrink-0" />
                                <span>{student.parent_phone}</span>
                            </div>
                        )}
                    </div>
                )}
            </HoverCardContent>
        </HoverCard>
    );
}
