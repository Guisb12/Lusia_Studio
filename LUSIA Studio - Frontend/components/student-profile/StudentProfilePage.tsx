"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Award, Building2, Calendar, ChevronRight, GraduationCap,
    Loader2, LogOut, Mail, Phone, TrendingUp, User, UserCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { RoleBadge } from "@/components/ui/role-badge";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import {
    ProfileCard, ProfileSection, InlineEditRow,
    DisplayNameEditor,
} from "@/components/profile/ProfilePrimitives";
import { ProfileSubjectsPicker } from "@/components/profile/ProfileSubjectsPicker";
import { ChangePasswordButton } from "@/components/profile/ChangePasswordSection";
import { type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/client";
import { getCurrentAcademicYear } from "@/lib/grades";
import type { GradeBoardData, CFSDashboardData } from "@/lib/grades";
import { isPassingGrade } from "@/lib/grades/calculations";
import { SECUNDARIO_COURSES, getGradeLabel } from "@/lib/curriculum";
import { cn } from "@/lib/utils";
import { patchMyProfileQuery, useMyProfileQuery } from "@/lib/queries/profile";
import { useCFSDashboardQueryWithOptions, useGradeBoardQuery } from "@/lib/queries/grades";
import { useDeferredQueryEnabled } from "@/lib/hooks/use-deferred-query-enabled";
import { prefetchStudentRouteData } from "@/lib/route-prefetch";

/* ── Patch helper ─────────────────────────────────────────────── */

async function patchMe(body: Record<string, unknown>) {
    const res = await fetch("/api/members/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return res.ok;
}

/* ── Main component ───────────────────────────────────────────── */

interface StudentProfilePageProps {
    initialGradeBoard?: GradeBoardData | null;
    initialProfile?: Member | null;
}

export function StudentProfilePage({
    initialGradeBoard,
    initialProfile,
}: StudentProfilePageProps) {
    const { user } = useUser();
    const router = useRouter();
    const profileQuery = useMyProfileQuery(initialProfile ?? undefined, Boolean(user?.id));
    const currentAcademicYear = getCurrentAcademicYear();
    const deferredAcademicEnabled = useDeferredQueryEnabled(Boolean(user?.id));
    const boardQuery = useGradeBoardQuery(
        currentAcademicYear,
        initialGradeBoard ?? undefined,
        { enabled: Boolean(user?.id) && deferredAcademicEnabled },
    );

    const [member, setMember] = useState<Member | null>(initialProfile ?? null);
    const [subjectIds, setSubjectIds] = useState<string[]>(
        user?.subject_ids ?? user?.subjects_ids ?? user?.profile?.subject_ids ?? []
    );

    // Grades summary
    const gradeData = boardQuery.data ?? null;
    const gradeLevel = member?.grade_level ?? user?.grade_level ?? null;
    const course = member?.course ?? user?.course ?? null;
    const gradeLabel = gradeLevel ? getGradeLabel(gradeLevel) : null;
    const courseLabel = course ? (SECUNDARIO_COURSES.find(c => c.key === course)?.label ?? course) : null;

    /* ── Sync from query ── */
    useEffect(() => {
        const data = profileQuery.data;
        if (!data) return;
        setMember(data);
        setSubjectIds(data.subject_ids ?? []);
    }, [profileQuery.data]);

    /* ── Computed ── */
    const educationLevel = gradeData?.settings?.education_level ?? "secundario";
    const cfsQuery = useCFSDashboardQueryWithOptions(undefined, {
        enabled: educationLevel === "secundario" && deferredAcademicEnabled,
    });
    const cfsData: CFSDashboardData | null = cfsQuery.data ?? null;
    const yearlyAverage = useMemo(() => {
        if (!gradeData?.subjects) return null;
        const grades = gradeData.subjects
            .filter(s => s.enrollment.is_active && s.annual_grade)
            .map(s => s.annual_grade!.annual_grade);
        if (!grades.length) return null;
        return grades.reduce((a, b) => a + b, 0) / grades.length;
    }, [gradeData]);

    const joinedDate = member?.created_at
        ? new Date(member.created_at).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })
        : null;

    const displayName = member?.display_name || member?.full_name || user?.display_name || user?.full_name || "";

    /* ── Inline save helpers ── */
    const saveField = useCallback(async (field: string, value: string) => {
        const body: Record<string, unknown> = { [field]: value || null };
        const ok = await patchMe(body);
        if (ok) {
            patchMyProfileQuery((c) => c ? { ...c, ...body } : c);
            setMember(p => p ? { ...p, ...body } as Member : p);
        }
    }, []);

    const handleSaveDisplayName = useCallback(async (name: string) => {
        const ok = await patchMe({ display_name: name });
        if (ok) {
            patchMyProfileQuery((c) => c ? { ...c, display_name: name } : c);
            setMember(p => p ? { ...p, display_name: name } : p);
        }
    }, []);

    const handleAvatarUploaded = useCallback(async (url: string) => {
        patchMyProfileQuery((c) => c ? { ...c, avatar_url: url } : c);
        setMember(p => p ? { ...p, avatar_url: url } : p);
        await patchMe({ avatar_url: url });
    }, []);

    const handleSaveSubjects = useCallback(async (ids: string[]) => {
        await patchMe({ subject_ids: ids });
        patchMyProfileQuery((c) => c ? { ...c, subject_ids: ids } : c);
        setMember(p => p ? { ...p, subject_ids: ids } : p);
    }, []);

    return (
        <div className="w-full lg:h-full lg:overflow-hidden">
            <div className="lg:h-full lg:flex lg:flex-col">
                {/* ── Header (fixed on desktop) ── */}
                <header className="shrink-0 mb-5">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">O meu Perfil</h1>
                    <p className="text-brand-primary/50 mt-0.5 text-sm">As tuas informações e configurações.</p>
                </header>

                <div className="flex flex-col lg:flex-row gap-5 items-start lg:flex-1 lg:min-h-0">

                    {/* ═══════════ LEFT SIDEBAR (fixed on desktop) ═══════════ */}
                    <div className="w-full lg:w-64 lg:shrink-0 space-y-3">
                        <ProfileCard>
                            <div className="p-5 flex flex-col items-center text-center">
                                <div className="mb-4">
                                    <AvatarUpload
                                        value={member?.avatar_url ?? user?.avatar_url ?? null}
                                        onUploadComplete={handleAvatarUploaded}
                                        size="lg" shape="circle" bucket="avatars" pathPrefix="profiles/"
                                    />
                                </div>
                                <DisplayNameEditor
                                    displayName={displayName}
                                    fallback={user?.full_name || ""}
                                    onSave={handleSaveDisplayName}
                                />
                                <p className="text-[11px] text-brand-primary/35 mb-3 truncate max-w-full px-2">{user?.email}</p>
                                <RoleBadge role={user?.role} />

                                {(gradeLabel || courseLabel) && (
                                    <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                                        {gradeLabel && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-accent/8 text-brand-accent border border-brand-accent/15">
                                                {gradeLabel}
                                            </span>
                                        )}
                                        {courseLabel && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-primary/[0.04] text-brand-primary/50 border border-brand-primary/[0.08]">
                                                {courseLabel}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {joinedDate && (
                                    <div className="mt-4 pt-4 border-t border-brand-primary/[0.04] w-full flex items-center justify-center gap-1.5 text-[10px] text-brand-primary/30">
                                        <Calendar className="h-3 w-3 shrink-0" /> Membro desde {joinedDate}
                                    </div>
                                )}
                            </div>
                        </ProfileCard>

                        {/* Compact grades summary */}
                        {gradeData?.settings && (
                            <Link
                                href="/student/grades"
                                onMouseEnter={() => void prefetchStudentRouteData("/student/grades", user)}
                                onFocus={() => void prefetchStudentRouteData("/student/grades", user)}
                                onTouchStart={() => void prefetchStudentRouteData("/student/grades", user)}
                                className="block"
                            >
                                <ProfileCard>
                                    <div className="px-4 py-3 hover:bg-brand-primary/[0.01] transition-colors group">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">Notas</span>
                                            <ChevronRight className="h-3 w-3 text-brand-primary/15 group-hover:text-brand-accent transition-colors" />
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center shrink-0">
                                                    <TrendingUp className="h-4 w-4 text-brand-primary/25" />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-brand-primary/30 uppercase">Média</p>
                                                    <span className={cn("text-[15px] font-bold leading-none",
                                                        yearlyAverage !== null
                                                            ? isPassingGrade(Math.round(yearlyAverage), educationLevel) ? "text-emerald-600" : "text-red-500"
                                                            : "text-brand-primary/20"
                                                    )}>
                                                        {yearlyAverage !== null ? yearlyAverage.toFixed(1) : "—"}
                                                    </span>
                                                </div>
                                            </div>
                                            {cfsData?.computed_cfs != null && (
                                                <div className="flex items-center gap-2 pl-4 border-l border-brand-primary/[0.04]">
                                                    <div className="h-8 w-8 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center shrink-0">
                                                        <Award className="h-4 w-4 text-brand-primary/25" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] text-brand-primary/30 uppercase">CFS</p>
                                                        <span className="text-[15px] font-bold text-brand-primary leading-none">{cfsData.computed_cfs.toFixed(1)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </ProfileCard>
                            </Link>
                        )}

                        <ChangePasswordButton />

                        <button
                            onClick={async () => { const s = createClient(); await s.auth.signOut(); router.replace("/login"); }}
                            className="w-full bg-brand-primary/[0.04] rounded-lg p-0.5"
                        >
                            <span className="w-full flex items-center justify-center gap-2 bg-white rounded-md shadow-sm py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                                <LogOut className="h-3.5 w-3.5" /> Terminar sessão
                            </span>
                        </button>
                    </div>

                    {/* ═══════════ RIGHT: SCROLLABLE CONTENT ═══════════ */}
                    <AppScrollArea
                        className="flex-1 min-w-0 lg:h-full"
                        viewportClassName="pb-12"
                        showFadeMasks
                        desktopScrollbarOnly
                        interactiveScrollbar
                    >
                        <div className="space-y-5">
                            {/* ── Contacto ── */}
                            <ProfileSection title="Contacto">
                                <InlineEditRow icon={User} label="Nome completo"
                                    value={member?.full_name || user?.full_name || ""}
                                    onSave={v => saveField("full_name", v)} />
                                <InlineEditRow icon={Mail} label="Email" value={user?.email} readOnly muted />
                                <InlineEditRow icon={Phone} label="Telefone"
                                    value={member?.phone || ""}
                                    onSave={v => saveField("phone", v)}
                                    type="tel" placeholder="+351 900 000 000" />
                            </ProfileSection>

                            {/* ── Académico ── */}
                            <ProfileSection title="Académico">
                                <InlineEditRow icon={GraduationCap} label="Ano" value={gradeLabel} readOnly />
                                {courseLabel && <InlineEditRow icon={GraduationCap} label="Curso" value={courseLabel} readOnly />}
                                <InlineEditRow icon={Building2} label="Escola"
                                    value={member?.school_name || ""}
                                    onSave={v => saveField("school_name", v)}
                                    placeholder="Nome da escola" />
                            </ProfileSection>

                            {/* ── Disciplinas ── */}
                            <ProfileSubjectsPicker
                                selectedIds={subjectIds}
                                onChange={setSubjectIds}
                                role="student"
                                gradeLevel={gradeLevel}
                                onSave={handleSaveSubjects}
                            />

                            {/* ── Encarregado de Educação ── */}
                            <ProfileSection title="Encarregado de Educação">
                                <InlineEditRow icon={UserCircle} label="Nome"
                                    value={member?.parent_name || ""}
                                    onSave={v => saveField("parent_name", v)} />
                                <InlineEditRow icon={Mail} label="Email"
                                    value={member?.parent_email || ""}
                                    onSave={v => saveField("parent_email", v)}
                                    type="email" placeholder="email@exemplo.com" />
                                <InlineEditRow icon={Phone} label="Telefone"
                                    value={member?.parent_phone || ""}
                                    onSave={v => saveField("parent_phone", v)}
                                    type="tel" placeholder="+351 900 000 000" />
                            </ProfileSection>

                        </div>
                    </AppScrollArea>
                </div>
            </div>
        </div>
    );
}
