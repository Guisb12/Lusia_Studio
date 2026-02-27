"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
    Calendar, ChevronRight, Loader2, LogOut, TrendingUp, Award,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { RoleBadge } from "@/components/ui/role-badge";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import {
    SectionCard, SectionHeader,
    Field, ReadOnlyField, DisplayNameEditor,
} from "@/components/profile/ProfilePrimitives";
import { ProfileSubjectsPicker } from "@/components/profile/ProfileSubjectsPicker";
import { fetchMyProfile, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/client";
import { fetchGradeBoard, fetchCFSDashboard, getCurrentAcademicYear } from "@/lib/grades";
import type { GradeBoardData, CFSDashboardData } from "@/lib/grades";
import { isPassingGrade } from "@/lib/grades/calculations";
import { SECUNDARIO_COURSES, getGradeLabel } from "@/lib/curriculum";
import { cn } from "@/lib/utils";

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

export function StudentProfilePage() {
    const { user } = useUser();
    const router = useRouter();

    // Extended-only fields (not in StudioUser) — fetched async
    const [member, setMember] = useState<Member | null>(null);
    const [extendedLoading, setExtendedLoading] = useState(true);

    // Form state — seeded from user immediately so the page renders right away
    const [editingName, setEditingName] = useState(false);
    const [displayName, setDisplayName] = useState(user?.display_name || user?.full_name || "");
    const [savingName, setSavingName] = useState(false);

    const [editingPersonal, setEditingPersonal] = useState(false);
    const [savingPersonal, setSavingPersonal] = useState(false);
    const [personal, setPersonal] = useState({ full_name: user?.full_name || "", phone: user?.phone || "" });
    const [personalDraft, setPersonalDraft] = useState({ full_name: user?.full_name || "", phone: user?.phone || "" });

    const [editingAcademic, setEditingAcademic] = useState(false);
    const [savingAcademic, setSavingAcademic] = useState(false);
    const [academic, setAcademic] = useState({ school_name: "" });
    const [academicDraft, setAcademicDraft] = useState({ school_name: "" });

    const [editingParent, setEditingParent] = useState(false);
    const [savingParent, setSavingParent] = useState(false);
    const [parentFields, setParentFields] = useState({ parent_name: "", parent_email: "", parent_phone: "" });
    const [parentDraft, setParentDraft] = useState({ parent_name: "", parent_email: "", parent_phone: "" });

    // Subject ids — seeded from user immediately
    const [subjectIds, setSubjectIds] = useState<string[]>(
        user?.subject_ids ?? user?.subjects_ids ?? user?.profile?.subject_ids ?? []
    );

    // Grades summary (compact sidebar)
    const [gradeData, setGradeData] = useState<GradeBoardData | null>(null);
    const [cfsData, setCfsData] = useState<CFSDashboardData | null>(null);

    // Grade + course from user directly (no need to wait for member)
    const gradeLevel = member?.grade_level ?? user?.grade_level ?? null;
    const course = member?.course ?? user?.course ?? null;
    const gradeLabel = gradeLevel ? getGradeLabel(gradeLevel) : null;
    const courseLabel = course ? (SECUNDARIO_COURSES.find(c => c.key === course)?.label ?? course) : null;

    /* ── Fetch extended profile fields in background ── */
    useEffect(() => {
        if (!user?.id) return;
        fetchMyProfile()
            .then(data => {
                setMember(data);
                // Override form fields with fresh backend data
                setDisplayName(data.display_name || data.full_name || user?.display_name || user?.full_name || "");
                const p = { full_name: data.full_name || "", phone: data.phone || "" };
                setPersonal(p);
                setPersonalDraft(p);
                const a = { school_name: data.school_name || "" };
                setAcademic(a);
                setAcademicDraft(a);
                const pr = {
                    parent_name: data.parent_name || "",
                    parent_email: data.parent_email || "",
                    parent_phone: data.parent_phone || "",
                };
                setParentFields(pr);
                setParentDraft(pr);
                setSubjectIds(data.subject_ids ?? []);
            })
            .catch(() => {/* silent — UI already seeded from user */})
            .finally(() => setExtendedLoading(false));
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Load grades (compact sidebar) ── */
    useEffect(() => {
        if (!user?.id) return;
        const year = getCurrentAcademicYear();
        fetchGradeBoard(year).then(setGradeData).catch(() => {});
        fetchCFSDashboard().then(setCfsData).catch(() => {});
    }, [user?.id]);

    /* ── Computed ── */
    const educationLevel = gradeData?.settings?.education_level ?? "secundario";
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

    /* ── Save handlers ── */
    const handleSaveName = useCallback(async () => {
        if (!displayName.trim()) return;
        setSavingName(true);
        try {
            const ok = await patchMe({ display_name: displayName.trim() });
            if (ok) {
                setMember(p => p ? { ...p, display_name: displayName.trim() } : p);
                setEditingName(false);
            }
        } finally { setSavingName(false); }
    }, [displayName]);

    const handleSavePersonal = useCallback(async () => {
        setSavingPersonal(true);
        try {
            const ok = await patchMe({
                full_name: personalDraft.full_name.trim() || undefined,
                phone: personalDraft.phone.trim() || undefined,
            });
            if (ok) { setPersonal({ ...personalDraft }); setEditingPersonal(false); }
        } finally { setSavingPersonal(false); }
    }, [personalDraft]);

    const handleSaveAcademic = useCallback(async () => {
        setSavingAcademic(true);
        try {
            const ok = await patchMe({ school_name: academicDraft.school_name.trim() || undefined });
            if (ok) { setAcademic({ ...academicDraft }); setEditingAcademic(false); }
        } finally { setSavingAcademic(false); }
    }, [academicDraft]);

    const handleSaveParent = useCallback(async () => {
        setSavingParent(true);
        try {
            const ok = await patchMe({
                parent_name: parentDraft.parent_name.trim() || undefined,
                parent_email: parentDraft.parent_email.trim() || undefined,
                parent_phone: parentDraft.parent_phone.trim() || undefined,
            });
            if (ok) { setParentFields({ ...parentDraft }); setEditingParent(false); }
        } finally { setSavingParent(false); }
    }, [parentDraft]);

    const handleSaveSubjects = useCallback(async (ids: string[]) => {
        await patchMe({ subject_ids: ids });
        setMember(p => p ? { ...p, subject_ids: ids } : p);
    }, []);

    return (
        <div className="w-full">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <header className="mb-6">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">O meu Perfil</h1>
                    <p className="text-sm text-brand-primary/60 mt-1">As tuas informações e configurações.</p>
                </header>

                <div className="flex flex-col lg:flex-row gap-5 items-start">

                    {/* ── Left sidebar ── */}
                    <div className="w-full lg:w-64 lg:shrink-0 lg:sticky lg:top-4 space-y-3">
                        <div className="rounded-2xl border border-brand-primary/[0.07] bg-white p-5 flex flex-col items-center text-center">
                            <div className="mb-4">
                                <AvatarUpload
                                    value={member?.avatar_url ?? user?.avatar_url ?? null}
                                    onUploadComplete={async (url) => {
                                        setMember(p => p ? { ...p, avatar_url: url } : p);
                                        await patchMe({ avatar_url: url });
                                    }}
                                    size="lg" shape="circle" bucket="avatars" pathPrefix="profiles/"
                                />
                            </div>

                            <DisplayNameEditor
                                displayName={displayName || user?.display_name || user?.full_name || ""}
                                fallback={user?.full_name || ""}
                                editing={editingName}
                                saving={savingName}
                                onEdit={() => setEditingName(true)}
                                onChange={setDisplayName}
                                onSave={() => void handleSaveName()}
                                onCancel={() => {
                                    setEditingName(false);
                                    setDisplayName(member?.display_name || member?.full_name || user?.display_name || user?.full_name || "");
                                }}
                            />

                            <p className="text-xs text-brand-primary/40 mb-3 truncate max-w-full px-2">{user?.email}</p>
                            <RoleBadge role={user?.role} />

                            {/* Grade + course pills */}
                            {(gradeLabel || courseLabel) && (
                                <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                                    {gradeLabel && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-brand-accent/8 text-brand-accent border border-brand-accent/15">
                                            {gradeLabel}
                                        </span>
                                    )}
                                    {courseLabel && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-brand-primary/5 text-brand-primary/60 border border-brand-primary/10">
                                            {courseLabel}
                                        </span>
                                    )}
                                </div>
                            )}

                            {joinedDate && (
                                <div className="mt-4 pt-4 border-t border-brand-primary/5 w-full flex items-center justify-center gap-1.5 text-[11px] text-brand-primary/35">
                                    <Calendar className="h-3 w-3 shrink-0" /> Membro desde {joinedDate}
                                </div>
                            )}
                        </div>

                        {/* Compact grades summary */}
                        {gradeData?.settings && (
                            <Link href="/student/grades" className="block">
                                <div className="rounded-2xl border border-brand-primary/[0.07] bg-white p-4 hover:border-brand-accent/20 transition-colors group">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[11px] font-semibold text-brand-primary/45 uppercase tracking-widest">Notas</span>
                                        <ChevronRight className="h-3.5 w-3.5 text-brand-primary/20 group-hover:text-brand-accent transition-colors" />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="h-4 w-4 text-brand-primary/30" />
                                            <div>
                                                <p className="text-[10px] text-brand-primary/40 uppercase">Média</p>
                                                <span className={cn("text-base font-bold",
                                                    yearlyAverage !== null
                                                        ? isPassingGrade(Math.round(yearlyAverage), educationLevel) ? "text-emerald-600" : "text-red-500"
                                                        : "text-brand-primary/25"
                                                )}>
                                                    {yearlyAverage !== null ? yearlyAverage.toFixed(1) : "—"}
                                                </span>
                                            </div>
                                        </div>
                                        {cfsData?.computed_cfs != null && (
                                            <div className="flex items-center gap-2 pl-4 border-l border-brand-primary/5">
                                                <Award className="h-4 w-4 text-brand-primary/30" />
                                                <div>
                                                    <p className="text-[10px] text-brand-primary/40 uppercase">CFS</p>
                                                    <span className="text-base font-bold text-brand-primary">{cfsData.computed_cfs.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        )}

                        <button
                            onClick={async () => {
                                const s = createClient();
                                await s.auth.signOut();
                                router.replace("/login");
                            }}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-200/80 bg-red-50 text-red-500 py-2.5 text-sm font-medium hover:bg-red-100 transition-colors"
                        >
                            <LogOut className="h-3.5 w-3.5" /> Terminar sessão
                        </button>
                    </div>

                    {/* ── Right: sections ── */}
                    <div className="flex-1 min-w-0 space-y-4">

                        {/* Personal */}
                        <SectionCard>
                            <SectionHeader
                                title="Informações Pessoais"
                                editing={editingPersonal}
                                saving={savingPersonal}
                                onEdit={() => { setPersonalDraft({ ...personal }); setEditingPersonal(true); }}
                                onSave={() => void handleSavePersonal()}
                                onCancel={() => { setPersonalDraft({ ...personal }); setEditingPersonal(false); }}
                            />
                            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Nome completo"
                                    value={editingPersonal ? personalDraft.full_name : personal.full_name}
                                    editing={editingPersonal}
                                    onChange={v => setPersonalDraft(d => ({ ...d, full_name: v }))} />
                                <ReadOnlyField label="Email" value={user?.email} />
                                <Field label="Telefone"
                                    value={editingPersonal ? personalDraft.phone : personal.phone}
                                    editing={editingPersonal}
                                    onChange={v => setPersonalDraft(d => ({ ...d, phone: v }))}
                                    type="tel" placeholder="+351 900 000 000" />
                            </div>
                        </SectionCard>

                        {/* Academic */}
                        <SectionCard>
                            <SectionHeader
                                title="Informação Académica"
                                editing={editingAcademic}
                                saving={savingAcademic}
                                onEdit={() => { setAcademicDraft({ ...academic }); setEditingAcademic(true); }}
                                onSave={() => void handleSaveAcademic()}
                                onCancel={() => { setAcademicDraft({ ...academic }); setEditingAcademic(false); }}
                            />
                            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <ReadOnlyField label="Ano" value={gradeLabel} />
                                {courseLabel && <ReadOnlyField label="Curso" value={courseLabel} />}
                                {extendedLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-brand-primary/30">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span>A carregar...</span>
                                    </div>
                                ) : (
                                    <Field label="Escola"
                                        value={editingAcademic ? academicDraft.school_name : academic.school_name}
                                        editing={editingAcademic}
                                        onChange={v => setAcademicDraft(d => ({ ...d, school_name: v }))}
                                        placeholder="Nome da escola" />
                                )}
                            </div>
                        </SectionCard>

                        {/* Subjects */}
                        <ProfileSubjectsPicker
                            selectedIds={subjectIds}
                            onChange={setSubjectIds}
                            role="student"
                            gradeLevel={gradeLevel}
                            onSave={handleSaveSubjects}
                        />

                        {/* Parent / Guardian */}
                        <SectionCard>
                            <SectionHeader
                                title="Encarregado de Educação"
                                editing={editingParent}
                                saving={savingParent}
                                onEdit={() => { setParentDraft({ ...parentFields }); setEditingParent(true); }}
                                onSave={() => void handleSaveParent()}
                                onCancel={() => { setParentDraft({ ...parentFields }); setEditingParent(false); }}
                            />
                            {extendedLoading ? (
                                <div className="px-5 py-4 flex items-center gap-2 text-sm text-brand-primary/30">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>A carregar...</span>
                                </div>
                            ) : (
                                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Nome"
                                        value={editingParent ? parentDraft.parent_name : parentFields.parent_name}
                                        editing={editingParent}
                                        onChange={v => setParentDraft(d => ({ ...d, parent_name: v }))} />
                                    <Field label="Email"
                                        value={editingParent ? parentDraft.parent_email : parentFields.parent_email}
                                        editing={editingParent}
                                        onChange={v => setParentDraft(d => ({ ...d, parent_email: v }))}
                                        type="email" placeholder="email@exemplo.com" />
                                    <Field label="Telefone"
                                        value={editingParent ? parentDraft.parent_phone : parentFields.parent_phone}
                                        editing={editingParent}
                                        onChange={v => setParentDraft(d => ({ ...d, parent_phone: v }))}
                                        type="tel" placeholder="+351 900 000 000" />
                                </div>
                            )}
                        </SectionCard>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
